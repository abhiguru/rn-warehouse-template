#!/usr/bin/env python3
"""Reconcile one approved B-GRN reader export, then restore owned fixture reads."""
import datetime,fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('b_pdf',Path(__file__).with_name('b-grn-pdf-prepare-api30.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
spec=importlib.util.spec_from_file_location('nav',Path(__file__).with_name('navigation-api30.py'));nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def main(path):
 case=json.loads(p.soak.private(path).read_text());cfg,i=p.soak.config(case['soakConfig']);deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp()
 class Finish(nav.Navigation):
  def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
 d=Finish(cfg,i,'unused',0);p.bind_stage(d,case,path);e=Path(case['caseDirectory']);out=e/'b-grn-pdf-final-result.json';assert not out.exists();d.e=e;d.file=out
 lock=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  d.state.update(status='RUNNING',scope='approved B GRN reader/export and unchanged state');d.save()
  for name in ['pdf-prepare-result.json','reader-selection-result.json','reader-open-result.json']:assert json.loads(p.soak.private(e/name).read_text())['status']=='PASS'
  generated=json.loads(p.soak.private(e/'pdf-after-generation.json').read_text())['generated'];native=e/'native-downloaded-B-GRN.pdf';assert hashlib.sha256(native.read_bytes()).hexdigest()==generated['sha256']
  q=d.backend_process(str(Path(__file__).parent.parent/'fixture-b-grn-pdf-observe.mjs'),[path,'guard'],timeout=25);assert q.returncode==0
  d.health();assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';focus=d.adb('shell','dumpsys','window');assert any('mCurrentFocus=' in x and p.READER+'/' in x for x in focus.splitlines())
  export='/sdcard/Download/Librera/GRN_FXC702.pdf';q=subprocess.run([cfg['adb'],'-s',i['serial'],'exec-out','cat',export],capture_output=True,timeout=20);assert q.returncode==0 and 1000<len(q.stdout)<=1048576;assert hashlib.sha256(q.stdout).hexdigest()==generated['sha256'];assert q.stdout[:5]==b'%PDF-'
  with (e/'approved-reader-export-B-GRN.pdf').open('xb') as f:f.write(q.stdout)
  q=subprocess.run(['/usr/bin/pdftotext','-layout',str(e/'approved-reader-export-B-GRN.pdf'),'-'],capture_output=True,text=True,timeout=20);assert q.returncode==0;p.validate_B_pdf_text(q.stdout)
  with (e/'approved-reader-export-B-GRN.txt').open('x') as f:f.write(q.stdout)
  d.state.update(readerExportSHA256=generated['sha256'],storedNativeExportBytesMatch=True);d.save();d.cold();d.wait('Orders tab');since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.tap('Refresh orders');d.wait('Backend Test Customer B');end=time.monotonic()+25
  while True:
   q=d.backend_process(cfg['httpObserver'],[since],timeout=15);v=nav.decode_observation(q.returncode,q.stdout.decode(errors='replace'))
   if v['status']=='PASS':break
   assert v['status']=='WAIT' and time.monotonic()<end;time.sleep(.5)
  d.selected_server(e,case['origin'],case['instanceId']);q=d.backend_process(str(Path(__file__).parent.parent/'fixture-b-grn-pdf-observe.mjs'),[path,'after-reader'],timeout=25);assert q.returncode==0
  d.state.update(status='PASS',normalRouteColdOrders200=True,permissionsUnchanged=True,noOTP=True,noRegeneration=True);d.save();print('{"status":"PASS","scope":"native B GRN PDF SEND, approved reader/export and reconciliation"}')
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve document/reader/state; no generation, retry or permissions changes');d.save();raise
 finally:os.close(lock)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
 except Exception:print('{"status":"FAIL","category":"B_GRN_PDF_READER_RECONCILIATION_STOPPED"}');sys.exit(1)
