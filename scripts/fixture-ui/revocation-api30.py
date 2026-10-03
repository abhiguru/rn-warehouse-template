#!/usr/bin/env python3
"""One owned native actor; administrator credentials stay in the API parent."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,select,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def emit(value):print(json.dumps(value),flush=True)
def main(path):
 c=json.loads(nav.soak.private(path).read_text());scripts=Path(__file__).parent.parent;ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
 q=subprocess.run([ui['node'],str(scripts/'fixture-revocation-preflight.mjs'),path],capture_output=True,timeout=20);assert q.returncode==0
 cfg,i=nav.soak.config(c['soakConfig']);assert i['serial']=='emulator-5556' and c['artifactSHA256']==cfg['apkSHA256']
 names=['fixture-revocation-preflight.mjs','fixture-revocation-controls.mjs','fixture-session-guards.mjs','fixture-ui/revocation-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py']
 assert all(c['toolingSHA256'].get(n)==digest(scripts/n) for n in names)
 for name in ['databaseHelper','httpObserver']:assert c[name+'SHA256']==digest(cfg[name])
 fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 e=nav.soak.private(c['caseDirectory'],True)/'native';e.mkdir(mode=0o700);d=nav.Navigation(cfg,i,'unused',0);d.e=e;d.file=e/'result.json';d.state.update(phases=[]);d.save()
 def login():
  d.wait('Send OTP');labels=nav.labels(d.snapshot());assert 'Change warehouse server' in labels and 'Choose your warehouse server' not in labels
  assert not labels.intersection({'Orders tab','Invoices tab','GRN tab','Stock tab'})
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  package=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package);assert d.adb('shell','sha256sum',package[8:]).split()[0]==cfg['apkSHA256']
  nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True);d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer A');deadline=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<deadline;time.sleep(.5)
  d.state['phases'].append('EXACT_ARTIFACT_CUSTOMER_COLD_ORDERS200');d.save();emit({'status':'READY','scope':'owned-current-native-customer'})
  ready,_,_=select.select([sys.stdin],[],[],90);assert ready,'Bounded parent reconciliation timeout';raw=sys.stdin.readline(2049);assert raw.endswith('\n') and len(raw)<=2048;assert json.loads(raw)=={'status':'DISABLED_AND_RECONCILED'}
  d.cold();login();d.adb('shell','input','keyevent','3');time.sleep(1);d.adb('shell','monkey','-p',nav.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');login();d.cold();login()
  nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.state.update(status='PASS',loginRequiredAfterRevocation=True,phases=d.state['phases']+['REVOKED_SESSION_COLD_AND_FOREGROUND_LOGIN_REQUIRED']);d.save();emit({'status':'PASS','scope':'owned-native-revocation-login-required'})
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Native revocation stopped; preserve evidence and never replay disable');d.save();emit({'status':'FAIL','category':'NATIVE_REVOCATION_STOPPED'});raise
 finally:os.close(fd)
if __name__=='__main__':
 try:main(str(Path(sys.argv[1]).resolve()))
 except Exception:sys.exit(1)
