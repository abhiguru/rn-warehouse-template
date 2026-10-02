#!/usr/bin/env python3
"""Bounded administrator inventory reads; no form, share, login or write actions."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
def number(value):
 assert isinstance(value,int) and 0<=value<1000000
 digits=str(value)
 if len(digits)<=3:return digits
 head,tail=digits[:-3],digits[-3:];groups=[]
 while len(head)>2:groups.insert(0,head[-2:]);head=head[:-2]
 return ','.join([head,*groups,tail])
def customer_label(row):return f"{row['name']}, {row['items']} item{'s' if row['items']!=1 else ''} • {row['grns']} GRN{'s' if row['grns']!=1 else ''}, {number(row['stock'])} units"
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['kind']=='native-inventory-read';c,i=soak.config(case['soakConfig']);assert case['artifactSHA256']==c['apkSHA256'];d=auth.Auth(c,i,'unused',0);helper=str(Path(__file__).parent.parent/'fixture-inventory-observe.mjs')
 def observe(phase,*args):
  q=d.backend_process(helper,[str(Path(path).resolve()),phase,*args]);assert q.returncode==0,'Independent inventory observation refused';return json.loads(q.stdout)
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'inventory-read-result.json';d.state.update(phases=[],businessWriteAttempted=False,loginAttempts=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 def visible(label):
  for attempt in range(7):
   tree=d.snapshot()
   if any(label in [n.get('text'),n.get('content-desc')] for n in tree.iter('node')):return tree
   if attempt<2:time.sleep(1)
   else:d.adb('shell','input','swipe','360','1000','360','500','350')
  raise AssertionError('Exact SQL-bound inventory label unavailable')
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';owned_reverse_route(d.adb('reverse','--list'),18443)
  apk=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk) and d.adb('shell','sha256sum',apk[8:]).split()[0]==c['apkSHA256'];d.health();observe('before');stock=json.loads(soak.private(e/'inventory-before.json').read_text())['inventory'];assert 1<=len(stock['customers'])<=10 and 1<=len(stock['items'])<=10
  since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://reports/stock-summary',soak.PACKAGE);d.wait('Total Units')
  for row in stock['customers']:visible(customer_label(row))
  d.archive('native-inventory-all-customers');d.state['phases'].append('SQL_BOUND_CUSTOMER_STOCK_LABELS');d.save()
  for _ in range(3):d.adb('shell','input','swipe','360','450','360','1050','350')
  row=next(x for x in stock['customers'] if x['id']==case['customerId']);label=customer_label(row);tree=visible(label);xy=auth.point(tree,label);d.adb('shell','input','tap',*map(str,xy));d.wait(case['customerName'])
  for item in stock['items']:visible(f"{item['name']}, {item['stock']} units in {item['grns']} GRNs")
  d.archive('native-inventory-customer-items');http=observe('http',since);assert http['all']>=1 and http['customer']>=1 and not http['failures'];(e/'inventory-http.json').write_text(json.dumps(http,indent=2)+'\n');observe('after');d.state.update(status='PASS',phases=['SQL_BOUND_CUSTOMER_STOCK_LABELS','SQL_BOUND_CUSTOMER_ITEM_STOCK_LABELS','ACTUAL_NATIVE_STOCK_RPCS_200','UNCHANGED_BUSINESS_AUTH_OTP_BASELINE'],actualHTTP=http);d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),exceptionType=type(error).__name__,reason='Preserve native inventory evidence; no writes or automatic rerun');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native inventory read and independent SQL/HTTP reconciliation"}')
 except Exception:print('{"status":"FAIL","category":"NATIVE_INVENTORY_READ_STOPPED"}');sys.exit(1)
