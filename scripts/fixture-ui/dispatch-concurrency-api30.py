#!/usr/bin/env python3
"""Phased native race driver, one submit, no retry or autonomous cleanup."""
import datetime,importlib.util,json,os,re,sys,time
from pathlib import Path
from dispatch_concurrency_controls import config,stale_stock_error
from dispatch_draft_controls import grn_search_controls
from dispatch_case_controls import owned_reverse_route,submission_point
spec=importlib.util.spec_from_file_location('normal',Path(__file__).with_name('normal-dispatch-api30.py'));normal=importlib.util.module_from_spec(spec);spec.loader.exec_module(normal)
os.umask(0o077)
def main(path,phase):
    assert phase in {'prepare','submit'};case=config(json.loads(normal.soak.private(path).read_text()));c,i=normal.soak.config(case['soakConfig']);deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
    fd=int(os.environ['WAREHOUSE_DISPATCH_CONCURRENCY_ACTOR_FD']);assert fd>=3;lock=Path(path).parent/'fixture-session-actor.lock';a=lock.lstat();b=os.fstat(fd);assert a.st_uid==os.getuid() and not lock.is_symlink() and a.st_mode&0o077==0 and (a.st_ino,a.st_dev)==(b.st_ino,b.st_dev)
    class Bounded(normal.Draft):
        def adb(self,*args):assert time.time()<deadline;return super().adb(*args)
    d=Bounded(c,i,'unused',0);e=Path(case['caseDirectory'])/'native';normal.soak.private(e.parent,True)
    if phase=='prepare':e.mkdir(mode=0o700)
    else:normal.soak.private(e,True)
    d.e=e;d.file=e/'result.json'
    if phase=='prepare':d.state.update(status='RUNNING',submissionAttempts=0,itemSaveAttempts=0,otpRequests=0,prepared=False)
    else:d.state=json.loads(normal.soak.private(d.file).read_text());assert d.state['prepared'] and d.state['submissionAttempts']==0 and d.state['status']=='PREPARED'
    d.save()
    try:
        assert i['serial']=='emulator-5556' and d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';assert d.adb('shell','getprop','ro.build.version.sdk')=='30';assert d.adb('shell','getenforce')=='Enforcing'
        apk=d.adb('shell','pm','path',normal.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',apk);assert d.adb('shell','sha256sum',apk[8:]).split()[0]==case['artifactSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443);d.health(True)
        audit=json.loads(normal.soak.private(case['artifactAudit']).read_text());assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==case['artifactSHA256']
        if phase=='prepare':
            d.adb('shell','am','force-stop',normal.soak.PACKAGE);d.adb('shell','monkey','-p',normal.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1');d.wait('Orders tab')
            d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://dispatch-form/step1','-p',normal.soak.PACKAGE)
            d.fill('Dispatch number',case['record']);d.tap('Select customer...');d.fill('Search customers...','Backend Test Customer A');d.tap('Backend Test Customer A',button=True);d.fill('Vehicle registration','TEST FIXTURE');d.wait('New customer');d.tap('Go to Items step');d.tap('Select GR No');prefix,digits=grn_search_controls(case['sourceReceipt']);d.tap(prefix)
            for label in digits:d.tap(label)
            d.tap(case['sourceReceipt']);d.wait('Qty: 3 · Stock: 3');d.wait('Backend Test Potatoes');d.fill('Dispatch quantity','2');d.state['itemSaveAttempts']=1;d.save();d.tap('Save dispatch item');d.wait('Adding Item 2');d.tap('Go to Review step');d.wait('Submit Dispatch');d.archive('race-prepared-review');d.state.update(status='PREPARED',prepared=True)
        else:
            xy=submission_point(d.wait('Submit Dispatch'),'Submit Dispatch',case['record']);d.adb('shell','input','tap',*map(str,xy));xy=submission_point(d.wait('Submit'),'Submit',case['record']);d.state['submissionAttempts']=1;d.save();d.adb('shell','input','tap',*map(str,xy));proof=stale_stock_error(d.wait('Insufficient stock: Backend Test Potatoes (Available: 1, Requested: 2)'));d.archive('race-native-stale-stock-error');d.state.update(status='NATIVE_ERROR_OBSERVED',nativeProof=proof)
        d.save();print(json.dumps({'status':d.state['status'],'phase':phase,'submissionAttempts':d.state['submissionAttempts']}))
    except Exception as error:
        d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve form and attempts; no retry or automatic cleanup');d.save();raise
if __name__=='__main__':
    try:assert len(sys.argv)==3;main(str(Path(sys.argv[1]).resolve()),sys.argv[2])
    except Exception:print('{"status":"FAIL","category":"NATIVE_DISPATCH_CONCURRENCY_STOPPED"}');sys.exit(1)
