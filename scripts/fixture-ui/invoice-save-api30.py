#!/usr/bin/env python3
"""One ordinary native rounding-invoice save; never replays a submission."""
import fcntl,hashlib,importlib.util,json,os,re,sys,traceback
from pathlib import Path
from invoice_save_controls import point,money_row,bounds
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
class Invoice(auth.Auth):
 def tap_invoice(self,label):
  self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))
 def visible(self,label):
  for _ in range(12):
   t=self.snapshot()
   try:point(t,label);return t
   except AssertionError:self.adb('shell','input','swipe','360','1020','360','500','350')
  raise AssertionError('Exact visible invoice action unavailable')
 def verify_money(self,label,value):
  for _ in range(12):
   t=self.snapshot()
   try:money_row(t,label,value);return
   except AssertionError:self.adb('shell','input','swipe','360','1020','360','500','350')
  raise AssertionError('Exact visible invoice amount unavailable')
def main(path):
 case=json.loads(soak.private(path).read_text());assert case['kind']=='native-invoice-rounding-save' and case['record']=='IRN01' and case['invoiceNumber']==20261010;c,i=soak.config(case['soakConfig']);d=Invoice(c,i,'unused',0);s=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(s/'fixture-invoice-save-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent invoice observer refused'
 observe('guard');lock=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e=e;d.file=e/'invoice-save-result.json';d.state.update(phases=[],businessWriteAttempted=False,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
 try:
  observe('before');assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';apk=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==c['apkSHA256']==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443)
  d.health();d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://invoice-form/step1',soak.PACKAGE);d.tap_invoice('Search and select GRN...');d.wait('Select GRN');d.fill('Search by GR No or Customer...','IRN01');d.tap_invoice('IRN01');d.wait('Backend Test Customer A');tree=d.wait('Invoice Number');fields=[n for n in tree.iter('node') if n.get('class')=='android.widget.EditText'];assert len(fields)==1 and re.fullmatch(r'\d{1,10}',fields[0].get('text','')) and fields[0].get('enabled')=='true';x,y,xx,yy=bounds(fields[0]);old=fields[0].get('text');d.adb('shell','input','tap',str((x+xx)//2),str((y+yy)//2));d.adb('shell','input','keyevent','123')
  for _ in old:d.adb('shell','input','keyevent','67')
  d.adb('shell','input','text','20261010');assert any(n.get('class')=='android.widget.EditText' and n.get('text')=='20261010' for n in d.snapshot().iter('node'))
  if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
  d.archive('header-IRN01');d.tap_invoice('Go to Review step');d.wait('Items Summary');d.wait('IRN01');d.verify_money('Subtotal (Storage)',150);d.verify_money('Labour Charges',20);d.verify_money('Tax Amount',9);d.archive('review-storage-labour-tax');d.verify_money('Grand Total',179);d.archive('review-rounded-total');observe('review');d.visible('Submit Invoice');d.tap_invoice('Submit Invoice');d.wait('Confirm Submission');tree=d.snapshot();assert any('Create invoice #20261010 for Backend Test Customer A?' in n.get('text','') and 'Total: ₹179.00' in n.get('text','') for n in tree.iter('node'));d.archive('confirmation-179');d.state.update(businessWriteAttempted=True,submissionAttempts=1);d.save();d.tap_invoice('Create');d.wait('Invoice Created!');d.verify_money('Total Amount',179);d.archive('native-saved-success');observe('after');d.tap_invoice('View Invoice List');d.wait('20261010');d.archive('native-invoice-list');v=json.loads((e/'invoice-after.json').read_text());inv=v['details']['invoices'][0]['id'];d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://invoice-details/'+inv,soak.PACKAGE);d.wait('Total amount: ₹179');d.wait('Tax amount: ₹9');d.archive('native-saved-overview');d.tap_invoice('Breakdown tab');d.wait('CHARGES BREAKDOWN');d.verify_money('Total Amount',179);d.verify_money('Tax Amount',9);d.archive('native-saved-breakdown');d.state.update(status='PASS',invoiceId=inv,phases=['REVIEW_179_TAX9','CONFIRM_179','ONE_SAVE_RECONCILED','LIST_OVERVIEW_BREAKDOWN_179_TAX9'],unroundedTax=8.5,unroundedTriggerTotal=178.5,roundedTotal=179,roundedTax=9);d.save()
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve document number and native state; no automatic retry');d.save()
  try:observe('failure')
  except Exception:d.state['failureReconciliation']='REFUSED';d.save()
  raise
 finally:os.close(lock)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native rounding invoice single save and reads"}')
 except Exception:print('{"status":"FAIL","category":"NATIVE_ROUNDING_INVOICE_STOPPED"}');sys.exit(1)
