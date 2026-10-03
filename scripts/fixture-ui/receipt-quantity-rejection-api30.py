#!/usr/bin/env python3
"""Bounded native quantity admission checks; no save, submit, OTP or network edits."""
import datetime,fcntl,importlib.util,json,os,re,shlex,sys,time,traceback
from pathlib import Path
from receipt_quantity_rejection_controls import receipt_rejection_config,receipt_rejected_quantity
from dispatch_draft_controls import point
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('normal',Path(__file__).with_name('normal-dispatch-api30.py'));normal=importlib.util.module_from_spec(spec);spec.loader.exec_module(normal)
os.umask(0o077)
def main(path):
 case=receipt_rejection_config(json.loads(normal.soak.private(path).read_text()));c,i=normal.soak.config(case['soakConfig']);deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
 class Bounded(normal.Draft):
  def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
 d=Bounded(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-receipt-quantity-observe.mjs'),[path,phase],timeout=30);assert q.returncode==0,'Independent receipt observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);normal.soak.private(e.parent,True);e.mkdir(mode=0o700);d.e=e;d.file=e/'receipt-quantity-result.json';d.state.update(phases=[],submissionAttempts=0,itemSaveAttempts=0,otpRequests=0);d.save()
 try:
  assert i['serial']=='emulator-5556' and d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  apk=d.adb('shell','pm','path',normal.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443);d.health()
  q=d.backend_process(str(scripts/'fixture-soak-preflight.mjs'),[case['soakConfig']],timeout=90);assert q.returncode==0,'Actual TLS/IPC readiness required'
  audit=json.loads(normal.soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==case['artifactSHA256']
  d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab')
  raw=d.adb('shell',shlex.join(['/system/bin/sqlite3','-readonly','/data/user/0/'+normal.soak.PACKAGE+'/databases/RKStorage',"SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1';"]));assert len(raw)<=4096;selected=json.loads(raw);assert selected['origin']==case['origin'] and selected['instanceId']==case['instanceId']
  observe('before')
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://grn-form/step1','-p',normal.soak.PACKAGE)
  d.fill('Receipt number',case['record']);d.tap('Select sender...');d.fill('Search customers...','Backend Test Customer A');d.tap('Backend Test Customer A',button=True);d.wait('New customer');d.tap('Go to Items step');d.fill('Type to search...','Backend Test Potatoes');d.tap('Select receipt item Backend Test Potatoes',button=True)
  proofs=[]
  for value in case['quantities']:
   tree=d.wait('Receipt item quantity');d.adb('shell','input','tap',*map(str,point(tree,'Receipt item quantity',editable=True)));fields=[n for n in d.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true'];assert len(fields)==1 and fields[0].get('content-desc')=='Receipt item quantity';old=fields[0].get('text','');assert len(old)<=10
   d.state['lastAction']={'operation':'enterInvalidQuantity','value':value};d.save();d.adb('shell','input','keyevent','123')
   for _ in old:d.adb('shell','input','keyevent','67')
   d.adb('shell','input','text',value);proof=receipt_rejected_quantity(d.snapshot(),value)
   if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
   receipt_rejected_quantity(d.snapshot(),value);proofs.append(proof);d.archive('receipt-invalid-'+str(len(proofs)));d.state['phases'].append(proof);d.save()
  observe('after');d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');end=time.monotonic()+25
  while True:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=normal.auth.soak.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  observe('final')
  d.state.update(status='PASS',normalRouteColdOrders200=True,nativeRejections=proofs,cleanup='Unsaved local form abandoned through normal cold restart',scope='native receipt zero/negative/fractional item admission with protected SQL/auth/stored bytes unchanged; no receipt submission');d.save();print('{"status":"PASS","scope":"native receipt zero, negative and fractional quantity rejection"}')
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve form and evidence; no replay or automatic cleanup');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_RECEIPT_QUANTITY_REJECTION_STOPPED"}');sys.exit(1)
