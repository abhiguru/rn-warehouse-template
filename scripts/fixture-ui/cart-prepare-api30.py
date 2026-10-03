#!/usr/bin/env python3
"""Native assigned cart/catalog preparation and denied B search; no item write."""
import fcntl,hashlib,importlib.util,json,os,re,sys,traceback
from pathlib import Path
from cart_controls import point
from catalog_input import enter_catalog_record
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
class Cart(auth.Auth):
 def fill_catalog(self,value):
  tree=self.wait('Search stock items');self.adb('shell','input','tap',*map(str,auth.point(tree,'Search stock items',True)))
  fields=[n for n in self.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Search stock items' and n.get('focused')=='true'];assert len(fields)==1
  old=fields[0].get('text','');assert len(old)<=128;self.adb('shell','input','keyevent','123')
  for _ in old:self.adb('shell','input','keyevent','67')
  def current():
   fields=[n for n in self.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Search stock items' and n.get('focused')=='true'];assert len(fields)==1
   text=fields[0].get('text','');return '' if text.startswith('Search items...') else text
  enter_catalog_record(value,current,lambda char:self.adb('shell','input','text',char))
  if 'mInputShown=true' in self.adb('shell','dumpsys','input_method'):self.adb('shell','input','keyevent','4')
 def tap_cart(self,label):self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))
def main(path):
 case=json.loads(soak.private(path).read_text());c,i=soak.config(case['soakConfig']);d=Cart(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-cart-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent cart prerequisite/reconciliation refused'
 observe('guard');fd=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'cart-prepare-result.json';d.state.update(phases=[],businessWriteAttempted=False,otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256'];d.health();observe('before');d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');d.tap('Orders tab');d.tap_cart('Order for Backend Test Customer A, Empty, No items yet');d.wait('Order for Backend Test Customer A');d.tap_cart('Add item to order');d.wait('Add Items');search_tree=d.wait('Search stock items');fields=[n for n in search_tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('text','').startswith('Search items...')];assert len(fields)==1;placeholder=fields[0].get('text');d.fill_catalog(case['deniedRecord']);d.wait('No stock available for "'+case['deniedRecord']+'"');d.archive('catalog-denied-other-customer-record');d.state['phases'].append('ASSIGNED_CART_B_RECORD_SEARCH_EMPTY');d.save();d.fill_catalog(case['record']);d.wait(case['record']);d.wait('Backend Test Potatoes');tree=d.snapshot();point(tree,'+');d.archive('catalog-exact-fresh-stock-before-selection');observe('prepare');d.state.update(status='PASS',phases=['EXISTING_EMPTY_OPEN_ASSIGNED_CART','B_RECORD_SEARCH_DENIED','EXACT_A_FRESH_STOCK_VISIBLE','NO_BUSINESS_AUTH_OR_STOCK_CHANGE'],driverSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),artifactSHA256=c['apkSHA256'],catalogHeldForGuardedSubmission=True);d.save();p=e/'cart-prepared-native.json';assert not p.exists();p.write_text(json.dumps(d.state,indent=2)+'\n')
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Cart preparation stopped; preserve evidence; no item submission');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native cart/catalog preparation without item write"}')
 except Exception:print('{"status":"FAIL","category":"CART_PREPARATION_STOPPED"}');sys.exit(1)
