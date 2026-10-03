#!/usr/bin/env python3
"""One image-free fictional receipt draft; never submits or authenticates."""
import fcntl,hashlib,importlib.util,json,os,re,sys
from pathlib import Path
from receipt_draft_controls import point,review_labels
from dispatch_case_controls import owned_reverse_route
spec=importlib.util.spec_from_file_location('fixture_auth',Path(__file__).with_name('auth-api30.py'))
auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)

class Receipt(auth.Auth):
    def wait(self,label):
        self.state['lastWait']=label;self.save();return super().wait(label)
    def tap(self,label):
        self.state['lastAction']={'operation':'tap','control':label};self.save()
        self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))
    def fill(self,label,value):
        point(self.wait(label),label,editable=True)
        assert re.fullmatch(r'[A-Za-z0-9 ]{1,60}',value)
        self.state['lastAction']={'operation':'fill','control':label};self.save()
        super().fill(label,value)

def main(path):
    case=json.loads(soak.private(path).read_text());c,i=soak.config(case['soakConfig'])
    assert case['backendCheckout']==c['backendCheckout'] and case['backendState']==c['backendState']
    assert case['artifactSHA256']==c['apkSHA256'] and case['kind']=='receipt'
    driver=Receipt(c,i,'unused',0);helper=str(Path(__file__).parent.parent/'fixture-receipt-observe.mjs')
    def observe(phase):
        q=driver.backend_process(helper,[str(Path(path).resolve()),phase]);assert q.returncode==0,'Receipt observation refused'
    observe('guard')
    fd=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists(),'Preserve attempts; no resume';e.mkdir(mode=0o700)
    driver.e,driver.file=e,e/'draft-result.json';driver.state.update(phases=[],businessWriteAttempted=False,driverSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());driver.save();changed=False
    try:
        audit=json.loads(soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit['sha256']==c['apkSHA256']
        assert driver.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert driver.adb('shell','getprop','ro.build.version.sdk')=='30' and driver.adb('shell','getenforce')=='Enforcing'
        p=driver.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p)
        assert driver.adb('shell','sha256sum',p[8:]).split()[0]==c['apkSHA256']
        owned_reverse_route(driver.adb('reverse','--list'),18443);driver.wait('Orders tab');observe('baseline')
        driver.adb('shell','am','force-stop',soak.PACKAGE);driver.adb('reverse','tcp:443','tcp:18643');changed=True
        driver.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');driver.wait('Orders tab')
        driver.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://grn-form/step1','-p',soak.PACKAGE)
        driver.fill('Receipt number',case['record']);driver.tap('Select sender...');driver.fill('Search customers...','Backend Test Customer A');driver.tap('Backend Test Customer A')
        driver.wait('Core Demo Administrator')
        if 'mInputShown=true' in driver.adb('shell','dumpsys','input_method'):driver.adb('shell','input','keyevent','4')
        driver.tap('Go to Items step');driver.fill('Type to search...','Backend Test Potatoes');driver.tap('Select receipt item Backend Test Potatoes')
        driver.fill('Receipt item quantity',str(case['quantity']));driver.fill('Receipt item weight',str(case['weight']));driver.tap('Save receipt item');driver.tap('Go to Review step')
        labels=review_labels(driver.wait('Create GRN'),case['record'],case['quantity'],case['weight']);observe('after-draft')
        driver.state.update(status='PASS',reviewLabelsSHA256=hashlib.sha256(json.dumps(labels).encode()).hexdigest(),routeHeldForGuardedCase=True);driver.state['phases'].append('BOUND_RECEIPT_REVIEW_NO_BUSINESS_CHANGE')
    except Exception:
        driver.state.update(status='FAIL',reason='Receipt draft stopped; preserve evidence; no replay')
        if changed:
            owned_reverse_route(driver.adb('reverse','--list'),18643);driver.adb('reverse','tcp:443','tcp:18443');driver.state['normalRouteRestored']=True
        raise
    finally:driver.save();os.close(fd)
    print(json.dumps({'status':'PASS','scope':'non-submitting receipt draft'}))
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:print(json.dumps({'status':'FAIL','category':'RECEIPT_DRAFT_STOPPED_NO_REPLAY'}));sys.exit(1)
