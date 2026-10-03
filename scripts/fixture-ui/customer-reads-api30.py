#!/usr/bin/env python3
"""Reserved customer assigned Orders and role controls; no business mutations."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from fixture_observation import decode_observation
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());assert case.get('customerReadOnly') is True or case.get('genuineAReadOnly') is True;c,i=soak.config(case['soakConfig']);d=auth.Auth(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-auth-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Customer observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'customer-reads-result.json';d.state.update(phases=[],otpRequests=0,businessWrites=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 def labels(tree):return {v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256'];d.health(True);observe('before');d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');d.tap('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer A');deadline=time.monotonic()+20
  while time.monotonic()<deadline:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=decode_observation(q.returncode,q.stdout.decode())
   if v['status']=='PASS':break
   assert v['status']=='WAIT';time.sleep(.5)
  else:raise AssertionError('Actual assigned Orders read required')
  t=d.snapshot();seen=labels(t);assert 'Queue tab' not in seen and not any('Backend Test Customer B' in label for label in seen);assert any('Order for Backend Test Customer A' in label for label in seen);d.archive('customer-assigned-orders');d.state['phases'].append('ACTUAL_ORDERS200_ASSIGNED_A_ONLY_VISIBLE_NO_STAFF_QUEUE');d.save()
  for tab,forbidden in [('GRN tab',['Create GRN','Edit GRN','Print GRN']),('Dispatch tab',['Create Dispatch','Print Dispatch']),('Invoices tab',['Create Invoice','Print Invoice'])]:
   d.tap(tab);time.sleep(3);t=d.snapshot();seen=labels(t);assert tab in seen and 'Queue tab' not in seen and not seen.intersection(forbidden);assert not any('Backend Test Customer B' in label for label in seen);d.archive(tab.split()[0].lower()+'-customer-controls');d.state['phases'].append('CUSTOMER_CONTROLS:'+tab);d.save()
  d.tap('Orders tab');d.wait('Backend Test Customer A');observe('after');d.state.update(status='PASS',actualOrders=v,limitations=['visible assigned customer and role controls; direct unauthorized reads/writes, reciprocal B, documents and Realtime are separate'],completedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat());d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Customer reads stopped; preserve evidence; no writes/login/retry');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native customer assigned reads and visible role controls"}')
 except Exception:print('{"status":"FAIL","category":"CUSTOMER_READS_STOPPED"}');sys.exit(1)
