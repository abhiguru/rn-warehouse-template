#!/usr/bin/env python3
"""Reserved staff cold Orders/Queue reads and visible controls; never submit."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['case']=='staff-reads' and case['kind']=='native-staff-read';campaign_deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<campaign_deadline-time.time()<=600;c,i=soak.config(case['soakConfig']);assert case['artifactSHA256']==c['apkSHA256'];
 class BoundedStaff(auth.Auth):
  def adb(self,*args):assert time.time()<campaign_deadline,'Staff read deadline';return super().adb(*args)
 d=BoundedStaff(c,i,'unused',0);helper=str(Path(__file__).parent.parent/'fixture-staff-observe.mjs')
 def observe(phase,*args):
  q=d.backend_process(helper,[str(Path(path).resolve()),phase,*args]);assert q.returncode==0,'Independent staff observer refused';return json.loads(q.stdout)
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'staff-read-result.json';d.state.update(phases=[],businessWriteAttempted=False,otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 def fresh(label):
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap(label);deadline=time.monotonic()+20
  while time.monotonic()<deadline:
   value=observe('http',since)
   assert not value['failures'],'Native Orders/Queue RPC denial'
   if value['reads']>=1:return value
   time.sleep(.5)
  raise AssertionError('Actual fresh get_orders_list200 required')
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing';owned_reverse_route(d.adb('reverse','--list'),18443)
  apk=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk) and d.adb('shell','sha256sum',apk[8:]).split()[0]==c['apkSHA256'];d.health(True);observe('before');d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');orders=fresh('Refresh orders');assert not any(n.get('text')=='Queue tab' or n.get('content-desc')=='Queue tab' for n in d.snapshot().iter('node'));d.archive('staff-cold-orders');d.state['phases'].append('COLD_ORDERS200_NO_QUEUE');d.save()
  controls=[]
  for tab,button in [('GRN tab','Create GRN'),('Dispatch tab','Create Dispatch'),('Invoices tab','Create Invoice')]:
   d.tap(tab);d.wait(button);assert not any(n.get('text')=='Queue tab' or n.get('content-desc')=='Queue tab' for n in d.snapshot().iter('node'));d.archive('staff-'+tab.split()[0].lower()+'-controls');controls.append({'tab':tab,'visibleCreateControl':button});d.state['phases'].append('VISIBLE_CONTROL:'+button);d.save()
  d.tap('Orders tab');d.wait('Refresh orders');observe('after');d.state.update(status='PASS',ordersHTTP=orders,controls=controls,limitations=['Read-only Orders and visible create controls; no cart/order creation, queue processing, direct write permission, reciprocal isolation or Realtime acceptance'],completedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat());d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),exceptionType=type(error).__name__,reason='Preserve staff evidence; no writes, login or automatic retry');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native staff reads and visible controls"}')
 except Exception:print('{"status":"FAIL","category":"SUPERVISOR_READ_STOPPED"}');sys.exit(1)
