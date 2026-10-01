#!/usr/bin/env python3
"""Select the approved native SEND target once, retaining prior failed preparation."""
import fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time,xml.etree.ElementTree as ET
from pathlib import Path
spec=importlib.util.spec_from_file_location('pdf_prepare',Path(__file__).with_name('pdf-prepare-api30.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
os.umask(0o077)
def main(path):
 c=json.loads(p.soak.private(path).read_text());assert c['kind']=='native-pdf-send';cfg,i=p.soak.config(c['soakConfig']);d=p.PDF(cfg,i,'unused',0);d.external=True;d.document_capture=json.loads(p.soak.private(c['documentCapture']).read_text());e=Path(c['caseDirectory']);d.e=e;d.file=e/'reader-selection-result.json';assert not d.file.exists()
 lock=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  d.state.update(status='RUNNING',scope='native SEND to original approved Librera only');d.save();q=d.backend_process(str(Path(__file__).parent.parent/'fixture-pdf-observe.mjs'),[str(Path(path).resolve()),'guard']);assert q.returncode==0
  before=json.loads(p.soak.private(e/'pdf-prepare-result.json').read_text());assert before['status']=='FAIL' and before['failureSite']=='pdf-prepare-api30.py:56' and before['documentGenerationAttempted'];v=json.loads(p.soak.private(e/'pdf-after-generation.json').read_text());assert v['status']=='PASS';file=e/'native-downloaded-invoice.pdf';assert hashlib.sha256(p.soak.private(file).read_bytes()).hexdigest()==v['generated']['sha256']
  q=subprocess.run(['/usr/bin/pdftotext','-layout',str(file),'-'],capture_output=True,text=True,timeout=20);assert q.returncode==0;assert all(x in q.stdout for x in ['20261001','Backend Test Customer A']);assert re.search(r'\bTax:\s*7\b',q.stdout) and re.search(r'\bTotal:\s*147\b',q.stdout);(e/'native-downloaded-invoice-verified.txt').write_text(q.stdout)
  assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';p.owned_reverse_route(d.adb('reverse','--list'),18443)
  for package,expected in [(p.soak.PACKAGE,cfg['apkSHA256']),(p.READER,d.document_capture['approvedReader']['apkSHA256'])]:
   apk=d.adb('shell','pm','path',package);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==expected
  tree=d.snapshot();nodes=[n for n in tree.iter('node') if n.get('text')=='Librera FD'];assert len(nodes)==1 and nodes[0].get('enabled')=='true';match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert match;x,y,xx,yy=map(int,match.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280
  d.state['oneOwnedSENDTargetSelectionAttempted']=True;d.save();d.adb('shell','input','tap',str((x+xx)//2),str((y+yy)//2));end=time.monotonic()+20
  while time.monotonic()<end:
   d.health();focus=d.adb('shell','dumpsys','window')
   if any('mCurrentFocus=' in n and p.READER+'/' in n for n in focus.splitlines()):break
   time.sleep(.5)
  else:raise AssertionError('Approved reader foreground unavailable')
  cap=d.document_capture;assert hashlib.sha256(p.soak.private(cap['jar']).read_bytes()).hexdigest()==cap['sha256'];assert d.adb('shell','sha256sum',cap['remotePath']).split()[0]==cap['sha256'];raw=d.adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin','FixtureDocumentCapture');match=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S);assert match;(e/'approved-reader-first-screen.xml').write_text(match.group(1))
  q=d.backend_process(str(Path(__file__).parent.parent/'fixture-pdf-observe.mjs'),[str(Path(path).resolve()),'after']);assert q.returncode==0;d.state.update(status='PASS',nativeSEND=True,approvedReaderForeground=True,PDFBytesReconciled=True,priorPreparationFailurePreserved=True,viewerExportAcceptance='PENDING actual reader selectors');d.save()
 except Exception as error:d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve chooser/reader and PDF; do not repeat generation or target selection');d.save();raise
 finally:os.close(lock)
if __name__=='__main__':
 try:assert len(sys.argv)==2;main(sys.argv[1]);print('{"status":"PASS","scope":"native SEND and reader foreground; export pending"}')
 except Exception:print('{"status":"FAIL","category":"OWNED_PDF_READER_SELECTION_STOPPED"}');sys.exit(1)
