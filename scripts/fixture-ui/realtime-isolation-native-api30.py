#!/usr/bin/env python3
"""One parent-owned native observation phase; no login, save or networking edits."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
from fixture_observation import decode_observation
from dispatch_case_controls import owned_reverse_route
from realtime_isolation_controls import own_card,fresh_trigger
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'))
nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(path,phase,since):
 assert phase in ['before','after'];case=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent
 assert case['scope']=='isolated-fictional-reciprocal-realtime'
 assert case['origin']=='https://backend-core.example.test'
 assert case['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
 deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00'))
 assert 0<(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds()<=600
 assert digest(case['soakConfig'])==case['soakConfigSHA256']
 c,inputs=nav.soak.config(case['soakConfig']);assert case['artifactSHA256']==c['apkSHA256']
 names=['fixture-ui/realtime-isolation-native-api30.py','fixture-ui/realtime_isolation_controls.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/fixture_observation.py','fixture-ui/dispatch_case_controls.py']
 for name in names:assert case['toolingSHA256'].get(name)==digest(scripts/name)
 for name in ['databaseHelper','httpObserver']:assert digest(c[name])==case[name+'SHA256']
 # The live adapter guard checks release/owner/helper/campaign/source bindings.
 q=subprocess.run([c['node'],str(scripts/'fixture-realtime-isolation-api.mjs'),path,'guard'],capture_output=True,timeout=25)
 assert q.returncode==0
 fd=int(os.environ['WAREHOUSE_REALTIME_ISOLATION_ACTOR_FD']);assert fd>=3
 lock=nav.soak.private(Path(path).parent/'fixture-session-actor.lock');a=lock.stat();b=os.fstat(fd)
 assert a.st_ino==b.st_ino and a.st_dev==b.st_dev
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 evidence=nav.soak.private(case['caseDirectory'],True)/('native-'+phase);evidence.mkdir(mode=0o700)
 driver=nav.Navigation(c,inputs,'unused',0);driver.e=evidence;driver.file=evidence/'result.json';driver.save()
 try:
  assert inputs['serial']=='emulator-5556'
  assert driver.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
  assert driver.adb('shell','getprop','ro.build.version.sdk')=='30'
  assert driver.adb('shell','getenforce')=='Enforcing'
  package=driver.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package)
  assert driver.adb('shell','sha256sum',package[8:]).split()[0]==c['apkSHA256']
  owned_reverse_route(driver.adb('reverse','--list'),18443);driver.health(True)
  driver.selected_server(evidence,case['origin'],case['instanceId']);own_card(driver.snapshot())
  if phase=='before':
   since=datetime.datetime.now(datetime.timezone.utc).isoformat();driver.tap('Refresh orders')
  else:fresh_trigger(since)
  end=time.monotonic()+45;label=None
  while time.monotonic()<end:
   assert datetime.datetime.now(datetime.timezone.utc)<deadline
   label=own_card(driver.snapshot())
   result=driver.backend_process(c['httpObserver'],[since],timeout=20)
   value=decode_observation(result.returncode,result.stdout.decode(errors='replace'))
   assert value['status'] in ['PASS','WAIT'],'Orders observer refused'
   if value['status']=='PASS':break
   time.sleep(1)
  else:raise AssertionError('No fresh native Orders read; preserve without replay')
  proof={'status':'PASS','customer':'B','artifactSHA256':c['apkSHA256'],'ordersHTTPStatus':200,'foreignContent':False,'manualRefresh':False,'ownEventRefetchObserved':phase=='after','card':label,'since':since,'scope':'native B-only foreground and fresh Orders RPC; wire/SQL proof separate'}
  driver.state.update(proof);driver.save();print(json.dumps(proof))
 except Exception as error:
  driver.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve native phase; no authentication, retry or cleanup');driver.save();raise
if __name__=='__main__':
 try:assert len(sys.argv)==4;main(*sys.argv[1:])
 except Exception:print('{"status":"FAIL","category":"NATIVE_ISOLATION_STOPPED"}');sys.exit(1)
