#!/usr/bin/env python3
"""Ordinary native receipt with one owned synthetic attachment; one submit only."""
import fcntl,hashlib,importlib.util,json,os,re,sys,time,traceback
from pathlib import Path
from normal_receipt_controls import point
from dispatch_case_controls import owned_reverse_route
from receipt_draft_controls import point as draft_point,review_labels
spec=importlib.util.spec_from_file_location('gallery',Path(__file__).with_name('receipt-image-picker-api30.py'));gallery=importlib.util.module_from_spec(spec);spec.loader.exec_module(gallery);auth=gallery.auth;soak=gallery.soak
os.umask(0o077)
class Receipt(gallery.Gallery):
 def tap_normal(self,label):self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))
 def tap_draft(self,label):self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,draft_point(self.wait(label),label)))
 def fill_draft(self,label,value):
  assert re.fullmatch(r'[A-Za-z0-9 ]{1,60}',value);tree=self.wait(label);self.state['lastAction']='bounded input: '+label;self.save();self.adb('shell','input','tap',*map(str,draft_point(tree,label,True)));fields=[n for n in self.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true'];assert len(fields)==1;old=fields[0].get('text','');assert len(old)<=128;self.adb('shell','input','keyevent','123')
  for _ in old:self.adb('shell','input','keyevent','67')
  prefix=''
  for char in value:
   self.adb('shell','input','text',char.replace(' ','%s'));prefix+=char;end=time.monotonic()+5
   while time.monotonic()<end:
    if any(n.get('class')=='android.widget.EditText' and n.get('focused')=='true' and n.get('text')==prefix for n in self.snapshot().iter('node')):break
    time.sleep(.2)
   else:raise AssertionError('Bounded native field mismatch; no typing replay')
  if 'mInputShown=true' in self.adb('shell','dumpsys','input_method'):self.adb('shell','input','keyevent','4')
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['scope']=='isolated-fictional-normal-receipt' and case['record']=='FXN801';c,i=soak.config(case['soakConfig']);d=Receipt(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-normal-receipt-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Normal receipt reconciliation stopped; preserve actual snapshot'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists(),'No resume';e.mkdir(mode=0o700);d.e=e;d.file=e/'normal-receipt-result.json';d.state.update(phases=[],businessWriteAttempted=False,otpRequests=0,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save();d.gallery_capture=json.loads(soak.private(case['galleryCapture']).read_text())
 try:
  assert d.gallery_capture['sourceSHA256']==hashlib.sha256(Path(__file__).with_name('FixtureGalleryCapture.java').read_bytes()).hexdigest();assert d.gallery_capture['api']==30 and d.gallery_capture['viewport']==[720,1280]
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30' and d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing';p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p) and d.adb('shell','sha256sum',p[8:]).split()[0]==case['artifactSHA256']==c['apkSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443);d.health();observe('baseline')
  image=soak.private(case['imageFixture']);assert image.name=='WAREHOUSE_FIXTURE_FXN801.png' and hashlib.sha256(image.read_bytes()).hexdigest()==case['imageFixtureSHA256'];assert d.adb('shell','sha256sum','/sdcard/Pictures/'+image.name).split()[0]==case['imageFixtureSHA256']
  d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://grn-form/step1','-p',soak.PACKAGE)
  d.fill_draft('Receipt number',case['record']);d.tap_draft('Select sender...');d.fill_draft('Search customers...','Backend Test Customer A');d.tap_draft('Backend Test Customer A');d.wait('Core Demo Administrator')
  if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
  d.tap_draft('Go to Items step');d.fill_draft('Type to search...','Backend Test Potatoes');d.tap_draft('Select receipt item Backend Test Potatoes');d.fill_draft('Receipt item quantity','4');d.fill_draft('Receipt item weight','10');d.tap_draft('Save receipt item');d.tap_draft('Go to Review step');review_labels(d.wait('Create GRN'),case['record'],4,10);observe('draft');d.archive('normal-receipt-draft')
  for _ in range(7):
   try:point(d.snapshot(),'Add Photos ');break
   except AssertionError:d.adb('shell','input','swipe','360','1000','360','500','350')
  else:raise AssertionError('Visible image action unavailable')
  d.tap_normal('Add Photos ');d.tap_normal('PHOTO LIBRARY');d.external=True;t=d.wait('Recent');labels={v for n in t.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
  if 'Grid view' in labels:d.tap_normal('Grid view')
  d.wait(image.name);d.archive('normal-grid-exact-file');d.tap_normal(image.name);time.sleep(1);window=d.adb('shell','dumpsys','window')
  if any(p+'/' in window for p in gallery.PICKER_PACKAGES):
   labels={v for n in d.snapshot().iter('node') for v in [n.get('text'),n.get('content-desc')] if v};buttons=[v for v in ['OPEN','Open'] if v in labels];assert len(buttons)==1;d.tap_normal(buttons[0])
  d.external=False;d.wait('GRN Images (1)');d.archive('normal-attached-synthetic-image');observe('image');review_labels(d.wait('Create GRN'),case['record'],4,10);observe('pre-submit');d.tap_normal('Create GRN');d.wait('Confirm Create');d.state.update(businessWriteAttempted=True,submittedRecord=case['record'],intendedQuantity=4,submitAttempts=1);d.save();d.tap_normal('Create');d.wait('GRN Created Successfully!');d.archive('normal-receipt-native-success');observe('committed');d.state.update(status='PASS',phases=['NORMAL_NATIVE_REVIEW','GRID_SYNTHETIC_ATTACHMENT','ONE_CONFIRMED_NATIVE_SUBMISSION','SQL_STOCK_CACHE_AND_STORED_IMAGE_RECONCILED'],artifactSHA256=c['apkSHA256'],driverSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),limitations=['Stored image upload verified; native image render and reciprocal denial remain separate']);d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve successful/uncertain document number and actual snapshots; no replay');d.save()
  phase='committed' if d.state['businessWriteAttempted'] else 'aborted'
  if not (e/('normal-'+phase+'.json')).exists():
   try:observe(phase);d.state['readonlyFailureReconciliation']='PASS';d.save()
   except Exception:d.state['readonlyFailureReconciliation']='BLOCKED_WITH_ACTUAL_SNAPSHOT_PRESERVED';d.save()
  raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('PASS ordinary native receipt/image with exact reconciliation')
 except Exception:print('Normal receipt stopped; no resume');sys.exit(1)
