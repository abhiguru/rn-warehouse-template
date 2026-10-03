#!/usr/bin/env python3
"""Bounded read-only monitor; no input, authentication, cleanup or recovery."""
import datetime,hashlib,json,os,re,shutil,subprocess,sys,time
from pathlib import Path
os.umask(0o077)

MAX_STAGE_PLANS=256
# Expanded frozen runtimes currently bind 7,848 unique files (~587 MB).
# Hashes stream from disk; this finite cap covers the 256-plan campaign.
MAX_BOUND_FILES=16384

def bounded_paths(paths,limit=MAX_STAGE_PLANS):
    result=sorted(paths)
    assert len(result)<=limit,'MONITOR_SCOPE_LIMIT_EXCEEDED'
    return result

def private(path):
    path=Path(path);assert path.is_absolute() and path.resolve()==path
    for p in [path,path.parent]:
        s=p.stat();assert s.st_uid==os.getuid() and s.st_mode & 0o077==0
    assert path.is_file() and path.stat().st_size<1048576
    return json.loads(path.read_text())

def run(args,timeout=10):
    q=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    assert q.returncode==0,'Read-only probe unavailable'
    return q.stdout

def terminal_plan(ledger,locked):
    terminal={'PASS','FAIL','BLOCKED','TIMEOUT','INTERRUPTED'}
    steps=ledger.get('steps',[])
    return not locked and ((bool(steps) and all(x.get('status') in terminal for x in steps)) or (not any(x.get('status')=='RUNNING' for x in steps) and any(x.get('status') in terminal-{'PASS'} for x in ledger.get('checks',[]))))

def sample(c,cycle):
    root=Path(c['root']);row={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'services':{},'stages':{},'certificates':{}}
    row['diskAvailableBytes']=shutil.disk_usage(root).free
    row['memory']={k:int(v.strip().split()[0])*1024 for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines()) if k in ['MemAvailable','SwapFree']}
    row['nativeBuildSpaceAvailable']=row['diskAvailableBytes']>=25*1024**3
    row['pressure']=row['memory']['MemAvailable']<3*1024**3 or row['diskAvailableBytes']<10*1024**3
    for unit in c['units']:
        try:
            assert re.fullmatch(r'warehouse-fixture-(?:core|switch|fault|emulator)-[a-z0-9-]+\.service',unit)
            raw=run(['systemctl','--user','show',unit,'--property=LoadState,ActiveState,SubState,MainPID,NRestarts,Result,RuntimeMaxUSec,ActiveEnterTimestampMonotonic'])
            props=dict(x.split('=',1) for x in raw.splitlines() if '=' in x)
            props['uptimeSeconds']=max(0,float(Path('/proc/uptime').read_text().split()[0])-int(props.get('ActiveEnterTimestampMonotonic','0'))/1000000) if props.get('ActiveState')=='active' else None
            if re.fullmatch(r'warehouse-fixture-(?:core|switch|fault)-[a-z0-9-]+\.service',unit):
                props['existingTwelveHourCap']=props.get('RuntimeMaxUSec')=='12h'
                props['remainingSeconds']=max(0,43200-props['uptimeSeconds']) if props['existingTwelveHourCap'] and props['uptimeSeconds'] is not None else None
            row['services'][unit]=props
        except Exception:row['services'][unit]={'status':'PROBE_UNAVAILABLE'}
    for name in ['tls-primary','tls-switching','tls-replacement']:
        try:
            path=root/name/'fixture-ca.pem';out=run(['openssl','x509','-in',str(path),'-noout','-enddate']);expiry=datetime.datetime.strptime(out.strip().split('=',1)[1],'%b %d %H:%M:%S %Y %Z').replace(tzinfo=datetime.timezone.utc)
            row['certificates'][name]={'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'remainingSeconds':int((expiry-datetime.datetime.now(datetime.timezone.utc)).total_seconds())}
        except Exception:row['certificates'][name]={'status':'PROBE_UNAVAILABLE'}
    for path in bounded_paths(root.glob('stage-*-evidence/ledger.json')):
        try:v=private(path);row['stages'][path.parent.name]={'steps':[{k:s.get(k) for k in ['id','status']} for s in v.get('steps',[])],'checks':[{k:s.get(k) for k in ['label','status']} for s in v.get('checks',[])]}
        except Exception:row['stages'][path.parent.name]={'status':'CONCURRENT_OR_UNREADABLE_LEDGER'}
    if cycle%10==0:
        actual={};errors=[];critical=[];plans=[Path(c['olderPlan']),*bounded_paths(root.glob('stage-*.json'))]
        for path in plans:
            historical=False
            try:
                if path!=Path(c['olderPlan']):
                    ledger=root/(path.stem+'-evidence')/'ledger.json'
                    if ledger.exists():
                        historical=terminal_plan(private(ledger),(ledger.parent/'run.lock').exists())
                for binding in private(path)['bindings']:
                    name=binding['path']
                    if name not in actual:
                        assert len(actual)<MAX_BOUND_FILES
                        file=Path(name);assert file.stat().st_size<=1024**3
                        actual[name]=hashlib.file_digest(file.open('rb'),'sha256').hexdigest()
                    if actual[name]!=binding['sha256']:
                        error={'plan':path.name,'path':name,'category':'BINDING_CHANGED','terminalHistoricalPlan':historical}
                        errors.append(error)
                        if not historical:critical.append(error)
            except Exception:
                error={'plan':path.name,'category':'PLAN_OR_BOUND_FILE_UNREADABLE','terminalHistoricalPlan':historical}
                errors.append(error)
                if not historical:critical.append(error)
        row['integrity']={'boundFiles':len(actual),'maximumBoundFiles':MAX_BOUND_FILES,'errors':errors,'currentOrPreservedSoakErrors':critical,'historicalChangesNeverAuthorizeResume':True}
    # The serial is fixed; never enumerate or contact other devices.
    try:
        a=[c['adb'],'-s','emulator-5556'];name=run(a+['emu','avd','name'],5).splitlines()[0]
        assert name=='TestWarehouseFixture_API30';assert run(a+['shell','getprop','ro.build.version.sdk'],5).strip()=='30'
        events=run(a+['logcat','-b','events','-d'],10);crashes=run(a+['logcat','-b','crash','-d'],10)
        row['emulator']={'status':'OWNED_API30','anr':bool(re.search(r'\bam_anr\b',events)),'crash':bool(re.search(r'\bam_crash\b',events) or re.search(r'Fatal signal|FATAL EXCEPTION',crashes))}
    except Exception:row['emulator']={'status':'STOPPED_OR_READ_PROBE_UNAVAILABLE','noRecoveryAttempted':True}
    return row

def main(path):
    c=private(path);assert c['scope']=='isolated-fictional-vm-monitor';root=Path(c['root']);assert root==Path('/home/jay/warehouse-install-private/vm-campaign-20261001')
    campaign=private(root/'campaign.json');deadline=datetime.datetime.fromisoformat(campaign['deadline']);assert (deadline-datetime.datetime.fromisoformat(campaign['startedAt'])).total_seconds()==172800
    assert c['adb']=='/home/jay/Android/Sdk/platform-tools/adb' and 30<=c['intervalSeconds']<=300
    output=Path(c['output']);assert output.parent==root and not output.exists()
    with output.open('x') as log:
        cycle=0
        while datetime.datetime.now(datetime.timezone.utc)<deadline:
            try:row=sample(c,cycle)
            except Exception:row={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'READONLY_MONITOR_PROBE_FAILED','noRecoveryAttempted':True}
            log.write(json.dumps(row)+'\n');log.flush();cycle+=1
            remaining=(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds()
            if remaining<=0:break
            time.sleep(min(c['intervalSeconds'],remaining))
if __name__=='__main__':
    assert len(sys.argv)==2;main(sys.argv[1])
