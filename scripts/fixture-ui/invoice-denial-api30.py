#!/usr/bin/env python3
"""One other-customer invoice denial; no retries, business submit or authentication."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main(path):
 c=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
 guard=subprocess.run([ui['node'],str(scripts/'fixture-invoice-denial-observe.mjs'),path,'guard'],capture_output=True,timeout=20);assert guard.returncode==0
 assert c.get('customerBInvoiceDenial') is True
 own_customer='Backend Test Customer B'
 denied_customer='Backend Test Customer A'
 denied_record='20261010'
 cfg,i=nav.soak.config(c['soakConfig']);assert c['artifactSHA256']==cfg['apkSHA256'];assert i['serial']=='emulator-5556'
 names=['fixture-invoice-denial-observe.mjs','fixture-invoice-denial-controls.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/invoice-denial-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert all(c['toolingSHA256'].get(n)==digest(scripts/n) for n in names)
 for name in ['databaseHelper','httpObserver']:assert c[name+'SHA256']==digest(cfg[name])
 fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=Path(c['caseDirectory']);assert not e.exists();e.mkdir(mode=0o700);d=nav.Navigation(cfg,i,'unused',0);d.e=e;d.file=e/'invoice-denial-result.json';d.state.update(phases=[],nativeTargetRequestAttempted=False);d.save()
 def observe(phase,since=None):
  q=d.backend_process(str(scripts/'fixture-invoice-denial-observe.mjs'),[path,phase]+([since] if since else []),timeout=25)
  assert q.returncode in ([0,3] if phase=='http' else [0]),'Invoice denial observer refused';return json.loads(q.stdout)
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  package=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package);assert d.adb('shell','sha256sum',package[8:]).split()[0]==cfg['apkSHA256']
  nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);d.wait('Orders tab');observe('before')
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.state['nativeTargetRequestAttempted']=True;d.save()
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://invoice-details/'+c['targetInvoiceId'],'-p',nav.soak.PACKAGE)
  d.wait('Error');d.tap('OK');d.wait('Invoice Not Found');d.wait('The requested invoice could not be found.')
  for _ in range(2):
   tree=d.snapshot();labels=nav.labels(tree);assert 'Invoice Not Found' in labels and 'The requested invoice could not be found.' in labels
   assert not any(denied_record in x or denied_customer in x for x in labels),'Other-customer invoice content exposed';assert not any('Share PDF' in x or 'Total amount:' in x or 'Breakdown tab' in x for x in labels),'Unauthorized document controls exposed';time.sleep(.5)
  deadline=time.monotonic()+20
  while observe('http',since)['status']!='PASS':assert time.monotonic()<deadline;time.sleep(.5)
  (e/'native-denial-ui.json').write_text(json.dumps({'failureTitle':'Invoice Not Found','message':'The requested invoice could not be found.','otherCustomerContentAbsent':True,'freshInvoiceRPC200':True})+'\n');d.state['phases'].append('GENUINE_OTHER_CUSTOMER_INVOICE_NATIVE_DENIAL_AND_RPC200');d.save()
  d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait(own_customer);deadline=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<deadline;time.sleep(.5)
  observe('after');d.state.update(status='PASS',normalRouteColdOrders200=True);d.save();print(json.dumps({'status':'PASS','scope':'native B-to-A invoice denial only; no PDF transport denial claim'}))
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Invoice denial stopped; preserve evidence and do not replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_INVOICE_DENIAL_STOPPED"}');sys.exit(1)
