#!/usr/bin/env python3
"""One ordinary native logout, cold login requirement and independent revocation."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from logout_controls import confirm_point,avatar_point
spec_auth=importlib.util.spec_from_file_location("auth",Path(__file__).with_name("auth-api30.py"));auth=importlib.util.module_from_spec(spec_auth);spec_auth.loader.exec_module(auth)
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav);soak=nav.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['case'] in ['ordinary-logout','customer-logout','staff-logout','supervisor-logout','customer-b-logout'];deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600;c,i=soak.config(case['soakConfig']);scripts=Path(__file__).parent.parent
 class BoundedLogout(nav.Navigation):
  def adb(self,*args):assert time.time()<deadline,'Logout stage deadline';return super().adb(*args)
 d=BoundedLogout(c,i,'unused',0)
 if case['case']=='customer-b-logout':
  names=['fixture-navigation-observe.mjs','fixture-navigation-guards.mjs','fixture-session-guards.mjs','fixture-ui/logout-api30.py','fixture-ui/logout_controls.py','fixture-ui/auth-api30.py','fixture-ui/navigation-api30.py','fixture-ui/navigation_controls.py','fixture-ui/soak-api30.py','fixture-ui/dispatch_case_controls.py','fixture-ui/fixture_observation.py','fixture-ui/emulator_offline_network.py','fixture-ui/selection_start_controls.py','fixture-soak-preflight.mjs','prepare-emulator-fixture.mjs','fixture-service-health.mjs','is-main.mjs']
  assert set(case['toolingSHA256'])==set(names) and all(hashlib.sha256((scripts/n).read_bytes()).hexdigest()==case['toolingSHA256'][n] for n in names)
  assert hashlib.sha256(Path(case['soakConfig']).read_bytes()).hexdigest()==case['soakConfigSHA256']
  helper=json.loads(soak.private(case['helperConfig']).read_text());assert hashlib.sha256(Path(case['helperConfig']).read_bytes()).hexdigest()==case['helperConfigSHA256'];assert helper['scope']=='isolated-fictional-fixture' and len(helper['services'])==1
  h=helper['services'][0];assert h['kind']=='core' and h['state']==c['backendState'] and h['owningCheckout']==c['backendCheckout'] and h['ownerGuardSHA256']==case['fixtureGuardSHA256'] and h.get('ordersReadDelayMs',0)==0;assert c['managedUnits']['core']=='warehouse-fixture-core-'+helper['runId']+'.service'
  campaign=json.loads(soak.private(case['campaignFile']).read_text());assert campaign['deadline']==case['campaignDeadlineUTC'];assert deadline<=datetime.datetime.fromisoformat(campaign['deadline'].replace('Z','+00:00')).timestamp()
 def observe(phase):
  assert time.time()<deadline,'Logout observation deadline'
  q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Released owned fixture and independent state required'
 observe('guard')
 fd=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'navigation-result.json';d.state.update(phases=[],configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),businessWrites=0,otpRequests=0,scope='reserved B session cleanup before rejected-account case' if case['case']=='customer-b-logout' else 'ordinary native logout');d.save()
 def selection():
  d.adb('shell','am','force-stop',soak.PACKAGE);d.selected_server(e,'https://backend-core.example.test',case['instanceId']);return {'origin':'https://backend-core.example.test','instanceId':case['instanceId']}
 def read(label):
  d.wait('Orders tab');d.tap('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait(c['orderLabel']);deadline=time.monotonic()+20
  while time.monotonic()<deadline:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=nav.decode_observation(q.returncode,q.stdout.decode());
   if v['status']=='PASS':break
   assert v['status']=='WAIT';time.sleep(.5)
  else:raise AssertionError('Actual fresh Orders read required')
  d.state['phases'].append({'phase':label,'actualOrders':v});d.save()
 try:
  assert case['artifactSHA256']==c['apkSHA256']
  if case['case']=='customer-b-logout':
   q=d.backend_process(str(scripts/'fixture-soak-preflight.mjs'),[case['soakConfig']],timeout=90);assert q.returncode==0,'Actual helper TLS/IPC readiness required'
  audit=json.loads(soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==c['apkSHA256']
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  installed=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',installed);assert d.adb('shell','sha256sum',installed[8:]).split()[0]==c['apkSHA256'];nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health();observe('before')
  d.cold();d.wait('Orders tab')
  # Exact admitted profile avatar and header bounds; never select a generic icon.
  avatar='C' if case.get('genuineALogout') is True else 'N' if case['case'] in ['customer-logout','staff-logout','supervisor-logout'] else 'C';tree=d.wait('Refresh orders');d.adb('shell','input','tap',*map(str,avatar_point(tree,avatar)))
  tree=d.wait('View profile for '+case['profileName']);d.adb('shell','input','tap',*map(str,auth.point(tree,'View profile for '+case['profileName'])))
  for _ in range(6):
   if any('Sign out'==n.get('content-desc') for n in d.snapshot().iter('node')):break
   d.adb('shell','input','swipe','360','1050','360','450','400')
  tree=d.wait('Sign out');d.adb('shell','input','tap',*map(str,auth.point(tree,'Sign out')))
  tree=d.wait('Are you sure you want to sign out of your account?');d.adb('shell','input','tap',*map(str,confirm_point(tree)));d.state['phases'].append('ONE_CONFIRMED_ORDINARY_LOGOUT');d.save()
  d.wait('Send OTP');persisted=selection()
  for n in range(2):
   d.cold();tree=d.wait('Send OTP');assert not any(x.get('text')=='Orders tab' for x in tree.iter('node'))
  observe('after');d.state.update(status='PASS',coldLoginRequirements=2,persistedSelection=persisted);d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Logout stopped; preserve attempt; no login or replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"ordinary native logout and cold login requirement"}')
 except Exception:print('{"status":"FAIL","category":"LOGOUT_STOPPED"}');sys.exit(1)
