#!/usr/bin/env python3
"""One guarded persistent-cart sequence. No resume, implicit replay or cleanup."""
import fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from cart_controls import point,prepared_cart
spec=importlib.util.spec_from_file_location('cart',Path(__file__).with_name('cart-prepare-api30.py'));cart=importlib.util.module_from_spec(spec);spec.loader.exec_module(cart);soak=cart.soak
os.umask(0o077)
def main(path):
 case=json.loads(soak.private(path).read_text());c,i=soak.config(case['soakConfig']);e=soak.private(case['caseDirectory'],True)
 prepared_cart(json.loads(soak.private(e/'cart-prepared-native.json').read_text()),hashlib.sha256(Path(path).read_bytes()).hexdigest(),c['apkSHA256'])
 assert not (e/'cart-workflow-result.json').exists(),'Preserve attempts; no resume'
 d=cart.Cart(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-cart-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Stop on uncertain cart operation; no retry'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);d.e=e;d.file=e/'cart-workflow-result.json';d.state.update(phases=[],businessWriteAttempted=False,otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 def operation(label,phase,changes_database=True):
  d.state.update(nextOperation=label,nextReconciliation=phase,businessWriteAttempted=changes_database or d.state['businessWriteAttempted']);d.save();d.tap_cart(label)
  # The existing application debounces quantity persistence for two seconds.
  # Wait once, then reconcile independently; never resubmit a delayed write.
  time.sleep(3);observe(phase);d.archive('cart-'+phase);d.state['phases'].append(phase);d.save()
 def search_exact():
  assert case['record']=='FXC701';tree=d.wait('Search stock items');fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Search stock items'];assert len(fields)==1
  d.adb('shell','input','tap',*map(str,cart.auth.point(tree,'Search stock items',True)))
  old=fields[0].get('text','');assert len(old)<=128;d.adb('shell','input','keyevent','123')
  for _ in old:d.adb('shell','input','keyevent','67')
  def actual(expected):
   end=time.monotonic()+5
   while time.monotonic()<end:
    if any(n.get('class')=='android.widget.EditText' and n.get('content-desc')=='Search stock items' and n.get('focused')=='true' and n.get('text')==expected for n in d.snapshot().iter('node')):return
    time.sleep(.2)
   raise AssertionError('Native stock input mismatch; no text replay')
  actual('');prefix=''
  for char in case['record']:d.adb('shell','input','text',char);prefix+=char;actual(prefix)
  if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
  d.wait(case['record']);d.wait('Backend Test Potatoes')
 try:
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
  p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256'];d.health(True);observe('ready');d.wait(case['record']);d.wait('Backend Test Potatoes');d.tap_cart('+');d.wait('Add (1)');operation('Add (1)','added');d.wait('Add item to order');operation('+','edited');operation('+10','max');operation('+','excess',False)
  for qty in range(7,0,-1):operation('−','quantity-'+str(qty))
  d.tap_cart('−');d.wait('Remove Backend Test Potatoes from order?');operation('Remove','removed');d.tap_cart('Add item to order');search_exact()
  for _ in range(3):d.tap_cart('+')
  d.wait('Add (1)');operation('Add (1)','queued');d.wait('Add item to order');d.state.update(status='PASS',finalQuantity=3,stockRemains=8,contract='persistent OPEN cart; no separate Place order action');d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Cart stopped; preserve committed/uncertain operations; no replay');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('PASS native persistent cart sequence')
 except Exception:print('Cart workflow refused/stopped; no resume');sys.exit(1)
