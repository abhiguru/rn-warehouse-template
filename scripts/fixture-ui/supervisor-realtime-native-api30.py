#!/usr/bin/env python3
"""One parent-owned native observation phase; no login, save or networking edits."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
from fixture_observation import decode_observation
from dispatch_case_controls import owned_reverse_route
from navigation_controls import settings,disconnect,reconnect
from emulator_offline_network import original_airplane,airplane,disconnected,reject_fixture_loopback,restore_fixture_loopback
from supervisor_realtime_controls import supervisor_cards,fresh_trigger
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'))
nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main(path,phase,since):
 assert phase in ['before','after','cycle'];case=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent
 assert case['scope']=='isolated-fictional-supervisor-realtime'
 assert case['origin']=='https://backend-core.example.test'
 assert case['instanceId']=='b0ec3933-5258-4bd5-87f4-d57b13a78971'
 deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00'))
 assert 0<(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds()<=600
 assert digest(case['soakConfig'])==case['soakConfigSHA256']
 c,inputs=nav.soak.config(case['soakConfig']);assert case['artifactSHA256']==c['apkSHA256']
 names=['fixture-ui/supervisor-realtime-native-api30.py','fixture-ui/supervisor_realtime_controls.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/fixture_observation.py','fixture-ui/dispatch_case_controls.py','fixture-ui/emulator_offline_network.py']
 for name in names:assert case['toolingSHA256'].get(name)==digest(scripts/name)
 for name in ['databaseHelper','httpObserver']:assert digest(c[name])==case[name+'SHA256']
 # The live adapter guard checks release/owner/helper/campaign/source bindings.
 q=subprocess.run([c['node'],str(scripts/'fixture-supervisor-realtime-api.mjs'),path,'guard'],capture_output=True,timeout=25)
 assert q.returncode==0
 fd=int(os.environ['WAREHOUSE_SUPERVISOR_REALTIME_ACTOR_FD']);assert fd>=3
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
  driver.selected_server(evidence,case['origin'],case['instanceId']);supervisor_cards(driver.snapshot())
  if phase=='cycle':
   assert case.get('currentArtifactRealtime') is True and case.get('supervisorReconnect') is True
   assert case['artifactSHA256']=='a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69'
   radios=settings(driver.adb);original_airplane(driver.adb)
   match=re.fullmatch(r'package:in\.gurucold\.warehouse\.fixture uid:(\d+)',driver.adb('shell','pm','list','packages','-U',nav.soak.PACKAGE));assert match;uid=int(match.group(1));marker='whvm-supervisor-realtime-0110-03'
   network=plane=rule=False;driver.state.update(originalRadios=radios,ownedRule=marker,fixtureUID=uid);driver.save()
   try:
    network=True;disconnect(driver.adb,radios,18443);plane=True;airplane(driver.adb,'0','1');rule=True;reject_fixture_loopback(driver.adb,uid,marker)
    (evidence/'actual-disconnection.txt').write_text(disconnected(driver.adb));driver.wait('No internet connection')
   finally:
    if rule:restore_fixture_loopback(driver.adb,uid,marker)
    if plane:airplane(driver.adb,'1','0')
    if network:reconnect(driver.adb,radios,18443)
   end=time.monotonic()+30
   while 'No internet connection' in nav.labels(driver.snapshot()):assert time.monotonic()<end;time.sleep(1)
   time.sleep(5);supervisor_cards(driver.snapshot());owned_reverse_route(driver.adb('reverse','--list'),18443)
   proof={'status':'PASS','actualDeviceDisconnection':True,'ownedNetworkRestored':True,'manualRefresh':False,'artifactSHA256':c['apkSHA256'],'scope':'owned real network cycle; event delivery must be independently proved afterward'}
   driver.state.update(proof);driver.save();print(json.dumps(proof));return
  if phase=='before':
   since=datetime.datetime.now(datetime.timezone.utc).isoformat();driver.tap('Refresh orders')
  else:fresh_trigger(since)
  end=time.monotonic()+45;label=None
  while time.monotonic()<end:
   assert datetime.datetime.now(datetime.timezone.utc)<deadline
   label=supervisor_cards(driver.snapshot())
   result=driver.backend_process(c['httpObserver'],[since],timeout=20)
   value=decode_observation(result.returncode,result.stdout.decode(errors='replace'))
   assert value['status'] in ['PASS','WAIT'],'Orders observer refused'
   if value['status']=='PASS':break
   time.sleep(1)
  else:raise AssertionError('No fresh native Orders read; preserve without replay')
  proof={'status':'PASS','role':'supervisor','artifactSHA256':c['apkSHA256'],'ordersHTTPStatus':200,'foreignContent':False,'manualRefresh':False,'ownEventRefetchObserved':phase=='after','cards':label,'since':since,'scope':'native supervisor foreground and fresh Orders RPC; wire/SQL proof separate'}
  driver.state.update(proof);driver.save();print(json.dumps(proof))
 except Exception as error:
  driver.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve native phase; no authentication, retry or cleanup');driver.save();raise
if __name__=='__main__':
 try:assert len(sys.argv)==4;main(*sys.argv[1:])
 except Exception:print('{"status":"FAIL","category":"NATIVE_ISOLATION_STOPPED"}');sys.exit(1)
