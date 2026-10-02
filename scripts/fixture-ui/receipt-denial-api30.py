#!/usr/bin/env python3
"""One other-customer receipt denial; no retries, business submit or authentication."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
 guard=subprocess.run([ui['node'],str(scripts/'fixture-receipt-denial-observe.mjs'),path,'guard'],capture_output=True,timeout=20);assert guard.returncode==0
 cfg,i=nav.soak.config(c['soakConfig']);assert c['artifactSHA256']==cfg['apkSHA256'];assert i['serial']=='emulator-5556'
 names=['fixture-receipt-denial-observe.mjs','fixture-receipt-denial-controls.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/receipt-denial-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert all(c['toolingSHA256'].get(n)==digest(scripts/n) for n in names)
 for name in ['databaseHelper','httpObserver']:assert c[name+'SHA256']==digest(cfg[name])
 fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700);d=nav.Navigation(cfg,i,'unused',0);d.e=e;d.file=e/'receipt-denial-result.json';d.state.update(phases=[],nativeTargetRequestAttempted=False);d.save()
 def observe(phase,since=None):
  q=d.backend_process(str(scripts/'fixture-receipt-denial-observe.mjs'),[path,phase]+([since] if since else []),timeout=25)
  assert q.returncode in ([0,3] if phase=='http' else [0]),'Receipt denial observer refused';return json.loads(q.stdout)
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  package=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package);assert d.adb('shell','sha256sum',package[8:]).split()[0]==cfg['apkSHA256']
  nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);d.wait('Orders tab');observe('before')
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.state['nativeTargetRequestAttempted']=True;d.save()
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://grn-details/'+c['targetReceiptId'],'-p',nav.soak.PACKAGE)
  d.wait('Failed to Load');d.wait('GRN not found or access denied')
  for _ in range(2):
   tree=d.snapshot();labels=nav.labels(tree);assert 'Failed to Load' in labels and 'GRN not found or access denied' in labels
   assert not any('FXC702' in x or 'Backend Test Customer B' in x for x in labels),'Other-customer receipt content exposed';time.sleep(.5)
  deadline=time.monotonic()+20
  while observe('http',since)['status']!='PASS':assert time.monotonic()<deadline;time.sleep(.5)
  (e/'native-denial-ui.json').write_text(json.dumps({'failureTitle':'Failed to Load','message':'GRN not found or access denied','otherCustomerContentAbsent':True,'freshReceiptRPC200':True})+'\n');d.state['phases'].append('GENUINE_OTHER_CUSTOMER_RECEIPT_NATIVE_DENIAL_AND_RPC200');d.save()
  d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer A');deadline=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<deadline;time.sleep(.5)
  observe('after');d.state.update(status='PASS',normalRouteColdOrders200=True);d.save();print('{"status":"PASS","scope":"native A-to-B receipt denial only"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Receipt denial stopped; preserve evidence and do not replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_RECEIPT_DENIAL_STOPPED"}');sys.exit(1)
