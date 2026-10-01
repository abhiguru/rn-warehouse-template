#!/usr/bin/env python3
"""Replace one owned same-origin fixture, verify cold local cleanup, hold for auth.

On failure restore only hash-proven owned infrastructure; never log in or replay.
"""
import datetime,fcntl,hashlib,http.client,importlib.util,json,os,re,shlex,socket,sqlite3,ssl,subprocess,sys,time,traceback,xml.etree.ElementTree as ET
from pathlib import Path
from replacement_controls import observations,identity,empty_credentials,discovery
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['scope'] in ['isolated-fictional-replacement-case','isolated-fictional-replacement-return-case'];returning=case['scope']=='isolated-fictional-replacement-return-case';before_role='replacement' if returning else 'primary';after_role='primary' if returning else 'replacement';c,i=soak.config(case['primaryConfig']);d=auth.Auth(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-replacement-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent replacement observer refused'
 observe('guard')
 if returning:
  v=json.loads(soak.private(case['replacementAuthentication']).read_text());assert v['snapshot']['nativeSession']['id']==case['replacementNativeSessionId'] and v['snapshot']['profile']['name']=='Replacement Demo Administrator'
 lock=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'replacement-native-result.json';d.state.update(phases=[],businessWriteAttempted=False,newOTPRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),oldPrimaryStopped=False,replacementStarted=False,replacementStartAttempted=False);d.save()
 def config_for(name):return soak.config(case[name])[0]
 def helper(config,action):
  cfg=json.loads(soak.private(config).read_text());assert len(cfg['services'])==1 and cfg['services'][0]['kind']=='core';helper=case['supervisor'];assert hashlib.sha256(soak.private(helper).read_bytes()).hexdigest()==case['supervisorSHA256']
  if action=='stop':
   js='import{serviceSpec}from'+json.dumps('file://'+helper)+';import{createHash}from"node:crypto";import{readFileSync}from"node:fs";const c=JSON.parse(readFileSync(process.argv[1]));const s=serviceSpec(c,c.services[0]);console.log(JSON.stringify({unit:s.unit,sha256:createHash("sha256").update(s.content).digest("hex")}));'
   q=subprocess.run([c['node'],'--input-type=module','-e',js,config],capture_output=True,timeout=10,env={**os.environ,'PATH':str(Path(c['node']).parent)+':'+os.environ['PATH']});assert q.returncode==0;v=json.loads(q.stdout);unit_guard(v['unit'],v['sha256'])
  command=shlex.join([c['node'],helper,config,action]);q=subprocess.run(['/usr/bin/sg','docker','-c',command],capture_output=True,timeout=90,env={**os.environ,'PATH':str(Path(c['node']).parent)+':'+os.environ['PATH']});(e/('helper-'+cfg['runId']+'-'+action+'.log')).write_bytes(q.stdout+q.stderr);assert q.returncode==0,'Owned supervised helper action refused'
 def unit_guard(name,expected):
  unit=Path('/home/jay/.config/systemd/user')/name;assert hashlib.sha256(soak.private(unit).read_bytes()).hexdigest()==expected,'Owned unit changed; no replacement or cleanup'
 def readiness(cafile,instance,ipc):
  ctx=ssl.create_default_context(cafile=cafile)
  with socket.create_connection(('127.0.0.1',18443),timeout=10) as raw:
   with ctx.wrap_socket(raw,server_hostname='backend-core.example.test') as conn:
    conn.sendall(b'GET /functions/v1/get-public-config HTTP/1.1\r\nHost: backend-core.example.test\r\nConnection: close\r\n\r\n');response=http.client.HTTPResponse(conn);response.begin();assert response.status==200;payload=json.loads(response.read(65536));discovery(payload,instance);expected=hashlib.sha256(ssl.PEM_cert_to_DER_cert(Path(cafile).read_text())).hexdigest();assert hashlib.sha256(conn.getpeercert(binary_form=True)).hexdigest()==expected
  st=Path(ipc).lstat();assert st.st_uid==os.getuid() and st.st_mode&0o077==0
  with socket.socket(socket.AF_UNIX) as conn:
   conn.settimeout(5);conn.connect(ipc);conn.sendall(b'{"phone":"919888888891"}\n');reply=json.loads(conn.recv(1024));assert reply=={'error':'no pending fixture challenge'}
 def stored(phase):
  # App is force-stopped: parse SQLite in memory, never retain plaintext values.
  q=subprocess.run([c['adb'],'-s',i['serial'],'exec-out','cat','/data/user/0/'+soak.PACKAGE+'/databases/RKStorage'],capture_output=True,timeout=15);assert q.returncode==0 and len(q.stdout)<1048576;db=sqlite3.connect(':memory:');db.deserialize(q.stdout);assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok';row=db.execute("SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1'").fetchone();assert row;selected=json.loads(row[0]);keys=[x[0] for x in db.execute('SELECT key FROM catalystLocalStorage')];db.close();raw=d.adb('exec-out','cat','/data/user/0/'+soak.PACKAGE+'/shared_prefs/SecureStore.xml');prefs=ET.fromstring(raw);names=[x.get('name','') for x in prefs];secure=['secure_auth_token','secure_refresh_token','secure_token_expires','secure_operator_identity','secure_enrollment_token','cached_user_profile'];meta={'selected':selected,'securePresence':{k:any(k in n for n in names) for k in secure},'legacyCredentialKeys':[k for k in keys if k in ['auth_token','refresh_token','token_expires_at','session_marker','secure_session_marker','cached_user_profile']],'protectedCacheKeys':[k for k in keys if k.startswith(('grn_detail_','recent_customers_','recent_senders_','session_recent_items_'))]};(e/('device-'+phase+'-metadata.json')).write_text(json.dumps(meta,indent=2)+'\n');return meta
 try:
  assert json.loads(soak.private(case['currentPreservation']).read_text())['status']=='PASS';assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';d.health();d.wait('Orders tab');owned_reverse_route(d.adb('reverse','--list'),18443);apk=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==case['artifactSHA256']==c['apkSHA256'];d.archive('before-real-replacement');d.adb('shell','am','force-stop',soak.PACKAGE);before=stored('before');identity(before['selected'],case[before_role]['instanceId']);assert all(before['securePresence'][k] for k in ['secure_auth_token','secure_refresh_token','secure_token_expires','secure_operator_identity']);observe('before')
  unit_guard(case['oldPrimaryUnit'],case['oldPrimaryUnitSHA256']);q=subprocess.run(['systemctl','--user','stop',case['oldPrimaryUnit']],capture_output=True,timeout=30);assert q.returncode==0;d.state['oldPrimaryStopped']=True;d.save();d.state['replacementStartAttempted']=True;d.save();helper(case['replacementHelpers'],'start');d.state['replacementStarted']=True;d.save();d.c=config_for('replacementConfig');readiness(case['primaryCA'] if returning else case['replacementCA'],case[after_role]['instanceId'],case['replacementSocket']);d.state['actualTLSIPCReadiness']=True;d.state['nativeBeganUTC']=utc();d.save()
  for n in [1,2]:
   d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');tree=d.wait('Send OTP');assert not any(x.get('text')=='Orders tab' for x in tree.iter('node'));d.archive('replacement-cold-login-'+str(n));d.adb('shell','am','force-stop',soak.PACKAGE);meta=stored('replacement-cold-'+str(n));identity(meta['selected'],case[after_role]['instanceId']);empty_credentials(meta)
  time.sleep(16) # Let every bounded 15-second proxy request finish/abort before checking traffic.
  observe('after');rows=[];log=soak.private(case['replacementLog']);assert log.stat().st_size<33554432
  for line in log.read_text().splitlines():
   if line.startswith('{'):rows.append(json.loads(line))
  requests=observations(rows,d.state['nativeBeganUTC']);(e/'redacted-native-replacement-traffic.json').write_text(json.dumps(requests,indent=2)+'\n');d.state.update(status='PASS',phases=['GENUINE_NEW_IDENTITY_SAME_ORIGIN','TWO_COLD_LOGIN_REQUIREMENTS','LOCAL_CREDENTIAL_PROFILE_CACHE_CLEAR','NO_AUTHENTICATED_REPLACEMENT_HTTP_OR_WS','TWO_WAREHOUSES_SQL_UNCHANGED'],nativeRequests=len(requests),replacementHeldForOrdinaryAuthentication=not returning,primaryHeldForOrdinaryAuthentication=returning,applicationForceStopped=True,priorEnrollmentPresence=before['securePresence']['secure_enrollment_token'],limitations=['cold replacement; pending enrollment cleanup only observed when present','foreground/draft/in-flight replacement separate','destination authentication and restoration separate']);d.save();p=e/('return-prepared-native.json' if returning else 'replacement-prepared-native.json');assert not p.exists();p.write_text(json.dumps({'status':'PASS','artifactSHA256':case['artifactSHA256'],'configSHA256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'driverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'replacementInstanceId':case[after_role]['instanceId'],'normalReverseUnchanged':True,'newOTPRequests':0,'heldReplacementUnit':d.c['managedUnits']['core'],'restoreHelpers':case['restoreHelpers']},indent=2)+'\n')
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve evidence; restore only proven owned helper; no login/retry');d.save()
  if d.state['oldPrimaryStopped']:
   try:
    d.adb('shell','am','force-stop',soak.PACKAGE)
    if d.state['replacementStartAttempted'] and (Path('/home/jay/.config/systemd/user')/(config_for('replacementConfig')['managedUnits']['core'])).exists():helper(case['replacementHelpers'],'stop')
    helper(case['restoreHelpers'],'start');d.c=config_for('restoredConfig');d.health();readiness(case['primaryCA'],case['primary']['instanceId'],case['restoreSocket']);d.state['ownedPrimaryRestored']=True;d.save()
   except Exception:d.state['ownedRestoration']='REFUSED_OR_FAILED_PRESERVE_SERVICE_STATE';d.save()
  try:observe('failure')
  except Exception:d.state['failureSQLReconciliation']='REFUSED';d.save()
  raise
 finally:os.close(lock)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"cold genuine replacement; held for ordinary auth and restore"}')
 except Exception:print('{"status":"FAIL","category":"COLD_REPLACEMENT_STOPPED_NO_REPLAY"}');sys.exit(1)
