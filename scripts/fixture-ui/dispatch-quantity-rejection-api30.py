#!/usr/bin/env python3
"""Bounded native quantity admission checks; no save, submit, OTP or network edits."""
import datetime,fcntl,importlib.util,json,os,re,shlex,sys,time,traceback
from pathlib import Path
from dispatch_quantity_rejection_controls import rejection_config,rejected_quantity
from dispatch_draft_controls import grn_search_controls
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('normal',Path(__file__).with_name('normal-dispatch-api30.py'));normal=importlib.util.module_from_spec(spec);spec.loader.exec_module(normal)
os.umask(0o077)
def main(path):
 case=rejection_config(json.loads(normal.soak.private(path).read_text()));c,i=normal.soak.config(case['soakConfig']);deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
 class Bounded(normal.Draft):
  def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
 d=Bounded(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-dispatch-quantity-observe.mjs'),[path,phase],timeout=30);assert q.returncode==0,'Independent quantity observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);normal.soak.private(e.parent,True);e.mkdir(mode=0o700);d.e=e;d.file=e/'quantity-result.json';d.state.update(phases=[],submissionAttempts=0,itemSaveAttempts=0,otpRequests=0);d.save()
 try:
  assert i['serial']=='emulator-5556' and d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  apk=d.adb('shell','pm','path',normal.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True)
  q=d.backend_process(str(scripts/'fixture-soak-preflight.mjs'),[case['soakConfig']],timeout=90);assert q.returncode==0,'Actual TLS/IPC readiness required'
  audit=json.loads(normal.soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==case['artifactSHA256']
  observe('before');d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab')
  raw=d.adb('shell',shlex.join(['/system/bin/sqlite3','-readonly','/data/user/0/'+normal.soak.PACKAGE+'/databases/RKStorage',"SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1';"]));assert len(raw)<=4096;selected=json.loads(raw);assert selected['origin']==case['origin'] and selected['instanceId']==case['instanceId']
  d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://dispatch-form/step1','-p',normal.soak.PACKAGE)
  d.fill('Dispatch number',case['record']);d.tap('Select customer...');d.fill('Search customers...','Backend Test Customer A');d.tap('Backend Test Customer A',button=True);d.fill('Vehicle registration','TEST FIXTURE');d.wait('New customer');d.tap('Go to Items step');d.tap('Select GR No');prefix,digits=grn_search_controls(case['sourceReceipt']);d.tap(prefix)
  for label in digits:d.tap(label)
  d.tap(case['sourceReceipt']);d.wait('Qty: 20 · Stock: 20');d.wait('Backend Test Potatoes')
  proofs=[]
  for quantity in case['quantities']:
   if quantity==0:
    tree=d.wait('Dispatch quantity');d.adb('shell','input','tap',*map(str,normal.point(tree,'Dispatch quantity',editable=True)));fields=[n for n in d.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true'];assert len(fields)==1 and fields[0].get('content-desc')=='Dispatch quantity' and fields[0].get('text','') in ['', 'Qty'];d.adb('shell','input','text','0')
    rejected_quantity(d.snapshot(),0)
    if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
   else:d.fill('Dispatch quantity',str(quantity))
   proof=rejected_quantity(d.snapshot(),quantity);proofs.append(proof);d.archive('quantity-'+str(quantity)+'-disabled-save');d.state['phases'].append(proof);d.save()
  observe('after');d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');end=time.monotonic()+25
  while True:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=normal.auth.soak.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  observe('final')
  d.state.update(status='PASS',normalRouteColdOrders200=True,nativeRejections=proofs,cleanup='Unsaved local form abandoned through normal cold restart',scope='native zero/excess create-item admission with unchanged stock/state; no dispatch API write or concurrency claim');d.save();print('{"status":"PASS","scope":"native zero and excess dispatch quantity rejection"}')
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve form and evidence; no replay or automatic cleanup');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_QUANTITY_REJECTION_STOPPED"}');sys.exit(1)
