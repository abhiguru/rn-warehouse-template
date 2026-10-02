#!/usr/bin/env python3
"""Genuine higher-version warehouse rejection; never select or authenticate."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
 assert c['reservedCustomerCompatibility'] is True and c['kind']=='native-compatibility-rejection'
 deadline=datetime.datetime.fromisoformat(c['deadline']);assert datetime.datetime.now(datetime.timezone.utc)<deadline;assert (deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds()<=600
 cfg,i=nav.soak.config(c['soakConfig']);assert c['artifactSHA256']==cfg['apkSHA256'];assert i['serial']=='emulator-5556'
 names=['fixture-navigation-observe.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/compatibility-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert set(c['toolingSHA256'])==set(names) and all(c['toolingSHA256'][n]==digest(scripts/n) for n in names)
 for name in ['databaseHelper','httpObserver']:assert c[name+'SHA256']==digest(cfg[name])
 fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700);d=nav.Navigation(cfg,i,'unused',0);d.e=e;original_adb=d.adb
 def bounded_adb(*args):
  assert datetime.datetime.now(datetime.timezone.utc)<deadline,'CASE_DEADLINE'
  return original_adb(*args)
 d.adb=bounded_adb;d.file=e/'compatibility-result.json';d.state.update(phases=[]);d.save()
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[path,phase],timeout=25);assert q.returncode==0,'Readonly release/preservation guard refused'
 try:
  observe('guard');assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  package=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package);assert d.adb('shell','sha256sum',package[8:]).split()[0]==cfg['apkSHA256']
  nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);d.cold();d.wait('Orders tab');observe('before')
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://settings','-p',nav.soak.PACKAGE);d.wait('Settings')
  for _ in range(7):
   if 'Change Warehouse Server' in nav.labels(d.snapshot()):break
   d.adb('shell','input','swipe','360','1050','360','450','400')
  d.tap('Change Warehouse Server');d.fill_origin(c['targetOrigin'])
  d.tap('Check server');d.wait('Server Unavailable');d.wait('This server requires app version 0.2.0 or newer.');labels=nav.labels(d.snapshot())
  assert 'Use this server' not in labels and 'Fictional Switching Warehouse' not in labels
  (e/'actual-compatibility-rejection.json').write_text(json.dumps({'status':'PASS','nativeError':'This server requires app version 0.2.0 or newer.','targetOrigin':c['targetOrigin'],'targetInstanceId':c['targetInstanceId'],'noSelectionOffered':True})+'\n')
  d.tap('OK')
  d.adb('shell','input','keyevent','4');d.wait('Settings');d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer A');read_deadline=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<read_deadline;time.sleep(.5)
  d.selected_server(e,c['origin'],c['instanceId']);observe('after');d.state.update(status='PASS',normalRouteColdOrders200=True,nativeCompatibilityRejected=True);d.save();print('{"status":"PASS","scope":"genuine higher-version native rejection only"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Compatibility rejection stopped; preserve evidence');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_COMPATIBILITY_STOPPED"}');sys.exit(1)
