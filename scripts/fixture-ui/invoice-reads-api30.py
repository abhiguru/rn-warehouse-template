#!/usr/bin/env python3
"""Bounded native saved-invoice/GRN reads. No submit, PDF, OTP or restart."""
import fcntl,hashlib,importlib.util,json,os,re,sys
from pathlib import Path
from dispatch_case_controls import owned_reverse_route
from invoice_read_controls import read_control
spec=importlib.util.spec_from_file_location('invoice_auth',Path(__file__).with_name('auth-api30.py'));auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth);soak=auth.soak
os.umask(0o077)
class Invoice(auth.Auth):
    def tap_read(self,label,record):
        read_control(label,record)
        self.state['lastAction']=label;self.save();self.tap(label)
    def visible(self,label):
        for _ in range(8):
            t=self.snapshot()
            if any(label in [n.get('text'),n.get('content-desc')] for n in t.iter('node')):return t
            self.adb('shell','input','swipe','360','1000','360','550','350')
        raise AssertionError('Bounded invoice read label unavailable')

def main(path):
    case=json.loads(soak.private(path).read_text());assert case['kind']=='invoice-read-only' and case['case']=='same-server'
    c,i=soak.config(case['soakConfig']);d=Invoice(c,i,'unused',0);scripts=Path(__file__).parent.parent
    def observe(phase):
        q=d.backend_process(str(scripts/'fixture-navigation-observe.mjs'),[str(Path(path).resolve()),phase]);assert q.returncode==0,'Independent invoice business/session observation refused'
    observe('guard');f=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW);fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists();e.mkdir(mode=0o700);d.e,d.file=e,e/'invoice-read-result.json';d.state.update(phases=[],businessWriteAttempted=False,configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());d.save()
    try:
        observe('before');q=d.backend_process(str(scripts/'fixture-invoice-read-catalog.mjs'),[str(Path(path).resolve())]);assert q.returncode==0
        catalog=json.loads(soak.private(e/'invoice-catalog.json').read_text());assert catalog['status']=='PASS' and len(catalog['rows'])==5
        assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30';p=d.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p);assert d.adb('shell','sha256sum',p[8:]).split()[0]==case['artifactSHA256']==c['apkSHA256'];owned_reverse_route(d.adb('reverse','--list'),18443)
        for row in catalog['rows']:
            assert re.fullmatch(r'IRP0[1-5]',row['record']) and re.fullmatch(r'[a-f0-9-]{36}',row['id'])
            d.state['currentInvoice']=row['number'];d.save();d.health()
            d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://invoice-details/'+row['id'],soak.PACKAGE)
            d.wait('Total amount: ₹'+str(row['total']));d.wait('Tax amount: ₹'+str(row['tax']));d.archive(row['record']+'-overview-header')
            d.tap_read('Breakdown tab',row['record']);d.visible('Charges Breakdown');d.archive(row['record']+'-breakdown')
            d.visible('View GRN '+row['record']);d.tap_read('View GRN '+row['record'],row['record']);t=d.wait('Overview tab')
            assert any(row['record'] in n.get('text','') or row['record'] in n.get('content-desc','') for n in t.iter('node')),'Matched fictional GRN destination required'
            tabs=[n for n in t.iter('node') if n.get('content-desc')=='Overview tab'];assert len(tabs)==1 and tabs[0].get('selected')=='true','GRN must open Overview'
            d.archive(row['record']+'-grn-overview');d.state['phases'].append({'invoice':row['number'],'headerTotal':row['total'],'headerTax':row['tax'],'breakdownLabel':True,'linkedGRN':row['record'],'overviewSelected':True});d.save()
        observe('after');d.state.update(status='PASS',scope='saved invoice header, Breakdown and real GRN Overview navigation; no save or PDF acceptance');d.save()
    except Exception:d.state.update(status='FAIL',reason='Native invoice reads stopped; preserve evidence; no resume');d.save();raise
    finally:os.close(f)
    print(json.dumps({'status':'PASS','scope':'native-saved-invoice-and-GRN-reads'}))
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:print(json.dumps({'status':'FAIL','category':'INVOICE_READS_STOPPED_NO_RESUME'}));sys.exit(1)
