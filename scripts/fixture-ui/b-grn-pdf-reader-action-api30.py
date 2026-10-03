#!/usr/bin/env python3
"""Use one closed reader menu/export selector; never alter permissions."""
import fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('pdf_select',Path(__file__).with_name('b-grn-pdf-reader-select-api30.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);p=m.p
os.umask(0o077)
def main(path,label):
 assert label in {'Menu','Copy to Downloads','Copy to downloads','ⓘ File info'};tag={'Menu':'menu','Copy to Downloads':'export','Copy to downloads':'export','ⓘ File info':'info'}[label]
 c=json.loads(p.soak.private(path).read_text());cfg,i=p.soak.config(c['soakConfig']);d=p.PDF(cfg,i,'unused',0);p.bind_stage(d,c,path);e=Path(c['caseDirectory']);out=e/('reader-'+tag+'-result.json');assert not out.exists();cap=json.loads(p.soak.private(c['documentCapture']).read_text());lock=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 def capture():
  d.health();w=d.adb('shell','dumpsys','window');assert any('mCurrentFocus=' in x and p.READER+'/' in x for x in w.splitlines());assert d.adb('shell','sha256sum',cap['remotePath']).split()[0]==cap['sha256'];raw=d.adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin','FixtureDocumentCapture');match=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S);assert match;return match.group(1)
 result={'status':'RUNNING','scope':'bounded approved reader action '+tag}
 try:
  q=d.backend_process(str(Path(__file__).parent.parent/'fixture-b-grn-pdf-observe.mjs'),[str(Path(path).resolve()),'guard']);assert q.returncode==0;assert json.loads(p.soak.private(e/'reader-selection-result.json').read_text())['status']=='PASS';assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert hashlib.sha256(p.soak.private(cap['jar']).read_bytes()).hexdigest()==cap['sha256']
  import xml.etree.ElementTree as ET
  tree=ET.fromstring(capture());nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')]];assert len(nodes)==1 and nodes[0].get('enabled')=='true';match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert match;x,y,xx,yy=map(int,match.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280;result['ownedReaderActionAttempted']=True;out.write_text(json.dumps(result,indent=2)+'\n');d.adb('shell','input','tap',str((x+xx)//2),str((y+yy)//2));time.sleep(2);xml=capture();(e/('approved-reader-'+tag+'-screen.xml')).write_text(xml)
  q=subprocess.run([cfg['adb'],'-s',i['serial'],'exec-out','screencap','-p'],capture_output=True,timeout=15);assert q.returncode==0 and q.stdout.startswith(b'\x89PNG\r\n\x1a\n');(e/('approved-reader-'+tag+'.png')).write_bytes(q.stdout);result.update(status='PASS',readerScreenshotSHA256=hashlib.sha256(q.stdout).hexdigest(),rememberSelectionNotChanged=True,permissionsUnchanged=True,exportAcceptance='PENDING');out.write_text(json.dumps(result,indent=2)+'\n')
 except Exception as error:result.update(status='FAIL',exceptionType=type(error).__name__);out.write_text(json.dumps(result,indent=2)+'\n');raise
 finally:os.close(lock)
if __name__=='__main__':
 try:assert len(sys.argv)==3;main(sys.argv[1],sys.argv[2]);print('{"status":"PASS","scope":"approved reader open and captured; export pending"}')
 except Exception:print('{"status":"FAIL","category":"APPROVED_READER_OPEN_STOPPED"}');sys.exit(1)
