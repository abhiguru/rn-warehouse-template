#!/usr/bin/env python3
"""Attach one synthetic book image through native DocumentsUI; never submit."""
import fcntl,hashlib,importlib.util,json,os,re,sys,time,xml.etree.ElementTree as ET
from pathlib import Path
from receipt_image_controls import point,foreground,PICKER_PACKAGES
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('receipt_auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
class Gallery(auth.Auth):
    external=False
    def snapshot(self):
        self.health();window=self.adb('shell','dumpsys','window');foreground(window,soak.PACKAGE,self.external)
        cap=self.i['uiCapture'];raw=self.adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin','FixtureUiCapture');m=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S);assert m
        return ET.fromstring(m.group(1))
    def tap_image(self,label,filename):
        self.state['lastAction']=label;self.save();self.adb('shell','input','tap',*map(str,point(self.wait(label),label,filename)))
    def archive(self,label):
        t=self.snapshot()
        for n in t.iter('node'):
            for k in ['text','content-desc']:n.set(k,re.sub(r'\b(?:91)?\d{10}\b|\b\d{6}\b','[private digits]',n.get(k,'')))
        p=self.e/(label+'.xml');assert not p.exists();p.write_text(ET.tostring(t,encoding='unicode'))

def main(path):
    case=json.loads(soak.private(path).read_text());c,i=soak.config(case['soakConfig']);assert case['imagePolicy']=='deferred-single-book-image' and case['record']=='FXF502'
    fixture=soak.private(case['imageFixture']);assert fixture.name=='WAREHOUSE_FIXTURE_FXF502.png' and hashlib.sha256(fixture.read_bytes()).hexdigest()==case['imageFixtureSHA256']
    d=Gallery(c,i,'unused',0);helper=str(Path(__file__).parent.parent/'fixture-receipt-observe.mjs')
    def observe(phase):
        q=d.backend_process(helper,[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent deferred-image observation refused'
    observe('guard');f=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=soak.private(case['caseDirectory'],True);base=json.loads(soak.private(e/'draft-result.json').read_text());assert base['status']=='PASS' and base['businessWriteAttempted'] is False
    assert base['configSHA256']==hashlib.sha256(Path(path).read_bytes()).hexdigest();d.e,d.file=e,e/'image-result.json';assert not d.file.exists();d.state.update(phases=[],businessWriteAttempted=False);d.save()
    try:
        assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==case['artifactSHA256']==c['apkSHA256'];owned_reverse_route(d.adb('reverse','--list'),18643)
        assert d.adb('shell','sha256sum','/sdcard/Pictures/'+fixture.name).split()[0]==case['imageFixtureSHA256'];d.wait('Create GRN')
        for _ in range(7):
            t=d.snapshot()
            try:point(t,'Add Photos',fixture.name);break
            except AssertionError:d.adb('shell','input','swipe','360','1000','360','500','350')
        else:raise AssertionError('Visible Add Photos not available')
        d.tap_image('Add Photos',fixture.name);d.tap_image('PHOTO LIBRARY',fixture.name);d.external=True
        t=d.wait(fixture.name);d.archive('picker-before-exact-file');d.tap_image(fixture.name,fixture.name);time.sleep(1)
        window=d.adb('shell','dumpsys','window')
        if any(package+'/' in window for package in PICKER_PACKAGES):
            t=d.snapshot();labels={v for n in t.iter('node') for v in [n.get('text'),n.get('content-desc')] if v};d.archive('picker-selected-file')
            candidates=[label for label in ['OPEN','Open'] if label in labels];assert len(candidates)==1,'Exact picker completion control required';d.tap_image(candidates[0],fixture.name)
        d.external=False;d.wait('GRN Images (1)');d.archive('native-deferred-book-image');observe('after-image')
        from receipt_draft_controls import review_labels
        labels=review_labels(d.wait('Create GRN'),case['record'],case['quantity'],case['weight']);prepared={**base,'imageDriverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'imageFixtureSHA256':case['imageFixtureSHA256'],'reviewLabelsSHA256':hashlib.sha256(json.dumps(labels).encode()).hexdigest(),'deferredBookImage':True};out=e/'prepared-review-with-image.json';assert not out.exists();out.write_text(json.dumps(prepared,indent=2)+'\n');d.state.update(status='PASS',nativeDeferredBookImage=True,serverImageUploadAttempted=False);d.save()
    except Exception:d.state.update(status='FAIL',reason='Native gallery stopped; preserve state; no submission or resume');d.save();raise
    finally:os.close(f)
    print(json.dumps({'status':'PASS','scope':'native deferred synthetic book image; no receipt submission'}))
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:print(json.dumps({'status':'FAIL','category':'NATIVE_GALLERY_STOPPED_NO_RESUME'}));sys.exit(1)
