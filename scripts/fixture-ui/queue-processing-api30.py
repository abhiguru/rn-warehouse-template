#!/usr/bin/env python3
"""One guarded native queue dispatch; no retry, OTP or route edits."""
import datetime,fcntl,importlib.util,json,os,re,shlex,sys,time,traceback
from pathlib import Path
from queue_processing_controls import queue_config,expand_customer,generate_dispatch,queue_review
from dispatch_draft_controls import draft_labels
from dispatch_case_controls import owned_reverse_route,submission_point
spec=importlib.util.spec_from_file_location('normal',Path(__file__).with_name('normal-dispatch-api30.py'));normal=importlib.util.module_from_spec(spec);spec.loader.exec_module(normal)
os.umask(0o077)
def main(path):
 case=queue_config(json.loads(normal.soak.private(path).read_text()));c,i=normal.soak.config(case['soakConfig']);deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
 class Bounded(normal.Draft):
  def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
 d=Bounded(c,i,'unused',0);scripts=Path(__file__).parent.parent
 def observe(phase):
  q=d.backend_process(str(scripts/'fixture-queue-processing-observe.mjs'),[path,phase],timeout=30);assert q.returncode==0,'Independent queue observer refused'
 observe('guard');fd=os.open(Path(path).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);e=Path(case['caseDirectory']);normal.soak.private(e.parent,True);e.mkdir(mode=0o700);d.e=e;d.file=e/'queue-result.json';d.state.update(phases=[],submissionAttempts=0,itemSaveAttempts=0,otpRequests=0);d.save()
 try:
  assert i['serial']=='emulator-5556' and d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
  apk=d.adb('shell','pm','path',normal.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True)
  q=d.backend_process(str(scripts/'fixture-soak-preflight.mjs'),[case['soakConfig']],timeout=90);assert q.returncode==0,'Actual TLS/IPC readiness required'
  audit=json.loads(normal.soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==case['artifactSHA256']
  observe('before');d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab')
  raw=d.adb('shell',shlex.join(['/system/bin/sqlite3','-readonly','/data/user/0/'+normal.soak.PACKAGE+'/databases/RKStorage',"SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1';"]));assert len(raw)<=4096;selected=json.loads(raw);assert selected['origin']==case['origin'] and selected['instanceId']==case['instanceId']
  d.tap('Queue tab');tree=d.wait('Backend Test Customer A, 1 items, expand');d.adb('shell','input','tap',*map(str,expand_customer(tree)));tree=d.wait('Generate dispatch');d.adb('shell','input','tap',*map(str,generate_dispatch(tree)))
  d.fill('Dispatch number',case['record']);d.wait('Backend Test Customer A');d.fill('Vehicle registration','TEST FIXTURE');d.wait('New customer');d.tap('Go to Items step');d.tap('Go to Review step')
  tree=d.wait('Submit Dispatch');draft_labels(tree,case['record'],case['sourceReceipt'],8);queue_review(tree);observe('prepared');d.archive('queue-before-submit')
  xy=submission_point(d.wait('Submit Dispatch'),'Submit Dispatch',case['record']);d.adb('shell','input','tap',*map(str,xy))
  xy=submission_point(d.wait('Submit'),'Submit',case['record']);assert d.state['submissionAttempts']==0;d.state.update(submissionAttempts=1,businessWriteAttempted=True);d.save();d.adb('shell','input','tap',*map(str,xy))
  d.wait('Dispatch Created Successfully!');d.archive('queue-native-success');observe('committed');d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');end=time.monotonic()+25
  while True:
   q=d.backend_process(c['httpObserver'],[since],timeout=20);v=normal.auth.soak.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  d.tap('Queue tab');tree=d.wait('No Orders in Queue');assert not any((n.get('content-desc')or'').startswith('Backend Test Customer A,') for n in tree.iter('node'));d.archive('queue-cold-no-pending-items');observe('final')
  d.state.update(status='PASS',normalRouteColdOrders200=True,nativeSuccess=True,independentCommitReconciled=True,cleanup='Normal cold restart and actual Orders200; no replay',scope='one queue dispatch from preserved API cart; no native customer cart-creation claim');d.save();print('{"status":"PASS","scope":"one native queue dispatch with independent reconciliation"}')
 except Exception as error:
  last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno),reason='Preserve form and evidence; no replay or automatic cleanup');d.save();raise
 finally:os.close(fd)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"NATIVE_QUEUE_PROCESSING_STOPPED_NO_REPLAY"}');sys.exit(1)
