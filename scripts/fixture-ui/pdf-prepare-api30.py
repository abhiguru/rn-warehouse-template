#!/usr/bin/env python3
"""Prepare one native PDF chooser and reconcile it; never select external target."""
import fcntl,hashlib,importlib.util,json,os,re,subprocess,sys,time,traceback,xml.etree.ElementTree as ET
from pathlib import Path
from pdf_read_controls import point,READER
from pdf_device_preservation import preserve
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('pdf_auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
class PDF(auth.Auth):
    external=False
    def snapshot(self):
        self.health();window=self.adb('shell','dumpsys','window');focus=[x for x in window.splitlines() if 'mCurrentFocus=' in x];assert len(focus)==1
        fixture=soak.PACKAGE+'/' in focus[0];chooser='android/com.android.internal.app.ChooserActivity' in focus[0]
        assert fixture or self.external and chooser,'Unowned or unexpected PDF foreground'
        cap=self.i['uiCapture'] if fixture else self.document_capture
        assert hashlib.sha256(soak.private(cap['jar']).read_bytes()).hexdigest()==cap['sha256']
        assert self.adb('shell','sha256sum',cap['remotePath']).split()[0]==cap['sha256']
        main='FixtureUiCapture' if fixture else 'FixtureDocumentCapture'
        raw=self.adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin',main);m=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S);assert m
        return ET.fromstring(m.group(1))
    def tap_pdf(self,label):
        self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))
    def visible(self,label):
        for _ in range(8):
            t=self.snapshot()
            try:point(t,label);return t
            except AssertionError:self.adb('shell','input','swipe','360','1000','360','550','350')
        raise AssertionError('Visible exact PDF action unavailable')

def main(path):
    case=json.loads(soak.private(path).read_text());assert case['kind']=='native-pdf-send'
    c,i=soak.config(case['soakConfig']);d=PDF(c,i,'unused',0);scripts=Path(__file__).parent.parent
    def observe(phase):
        q=d.backend_process(str(scripts/'fixture-pdf-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent PDF observation refused'
    observe('guard');cap=json.loads(soak.private(case['documentCapture']).read_text());assert cap['api']==30 and cap['mainClass']=='FixtureDocumentCapture';assert cap['sourceSHA256']==hashlib.sha256(Path(__file__).with_name('FixtureDocumentCapture.java').read_bytes()).hexdigest();d.document_capture=cap
    f=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e,d.file=e,e/'pdf-prepare-result.json';d.state.update(phases=[],documentGenerationAttempted=False,businessWriteAttempted=False,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
    try:
        observe('before');assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        for package,expected in [(soak.PACKAGE,c['apkSHA256']),(READER,cap['approvedReader']['apkSHA256'])]:
            p=d.adb('shell','pm','path',package);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==expected
        assert c['apkSHA256']==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443)
        filename='Invoice_'+str(case['invoiceNumber'])+'_FY2026-2027.pdf';cache='/data/user/0/'+soak.PACKAGE+'/cache/'+filename;export='/sdcard/Download/Librera/'+filename
        if case.get('preserveExistingPDFDeviceFiles') is True:
            d.state['priorDevicePDFs']=preserve(d,case,e,{'cache':cache,'export':export});d.save()
        else:
            d.adb('shell','test','!','-e',cache);d.adb('shell','test','!','-e',export)
        d.state['deviceStartedEpoch']=int(d.adb('shell','date','+%s'));d.save()
        d.health();d.adb('shell','am','force-stop',soak.PACKAGE);d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://invoice-details/'+case['invoiceId'],soak.PACKAGE)
        d.wait('Total amount: ₹'+str(case['invoiceTotal']));d.wait('Tax amount: ₹'+str(case['invoiceTax']));d.tap_pdf('Overview tab');d.visible('Share PDF');d.archive('native-before-PDF-generation')
        d.state.update(documentGenerationAttempted=True,failurePhase='ONE_NATIVE_SHARE');d.save();d.tap_pdf('Share PDF');d.external=True
        end=time.monotonic()+45
        while time.monotonic()<end:
            d.health();w=d.adb('shell','dumpsys','window')
            if any('mCurrentFocus=' in x and 'android/com.android.internal.app.ChooserActivity' in x for x in w.splitlines()):break
            time.sleep(.5)
        else:raise AssertionError('Actual Android PDF chooser unavailable')
        d.archive('actual-native-PDF-chooser');observe('after-generation');v=json.loads(soak.private(e/'pdf-after-generation.json').read_text())['generated']
        q=subprocess.run([c['adb'],'-s',i['serial'],'exec-out','cat',cache],capture_output=True,timeout=20);assert q.returncode==0 and 1000<len(q.stdout)<=1048576;assert hashlib.sha256(q.stdout).hexdigest()==v['sha256'];p=e/'native-downloaded-invoice.pdf';assert not p.exists();p.write_bytes(q.stdout)
        q=subprocess.run(['/usr/bin/pdftotext','-layout',str(p),'-'],capture_output=True,text=True,timeout=20);assert q.returncode==0;assert all(x in q.stdout for x in [str(case['invoiceNumber']),'Backend Test Customer A']);assert re.search(r'\bTax:\s*'+str(case['invoiceTax'])+r'\b',q.stdout) and re.search(r'\bTotal:\s*'+str(case['invoiceTotal'])+r'\b',q.stdout);(e/'native-downloaded-invoice.txt').write_text(q.stdout)
        prepared={'status':'PASS','artifactSHA256':c['apkSHA256'],'configSHA256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'prepareDriverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'generated':v,'filename':filename,'exportPath':export,'deviceStartedEpoch':d.state['deviceStartedEpoch'],'currentForeground':'owned Android ChooserActivity','newPDFObjects':1,'readerNotSelected':True,'permissionsUnchanged':True};p=e/'prepared-native-PDF.json';assert not p.exists();p.write_text(json.dumps(prepared,indent=2)+'\n');d.state.update(status='PASS',phases=['ONE_NATIVE_PDF_GENERATED_DOWNLOADED_CHOOSER_PREPARED'],storedBytesMatchNativeDownload=True,chooserHeldForGuardedReader=True);d.save()
    except Exception as error:
        last=traceback.extract_tb(error.__traceback__)[-1];d.state.update(status='FAIL',reason='PDF preparation stopped; preserve generated objects and native state; no regeneration/resume',failureSite=Path(last.filename).name+':'+str(last.lineno),exceptionType=type(error).__name__);d.save();raise
    finally:os.close(f)
    print(json.dumps({'status':'PASS','scope':'one native PDF generation/download and prepared Android chooser; viewer/export acceptance separate'}))
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:print(json.dumps({'status':'FAIL','category':'PDF_PREPARATION_STOPPED_NO_REGENERATION'}));sys.exit(1)
