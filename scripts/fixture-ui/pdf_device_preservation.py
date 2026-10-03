"""Preserve only the two exact earlier fictional rounding-PDF device files."""
import hashlib,json,subprocess
from pathlib import Path
OLD_SHA='53a6dfa16e77ab64b61f3ca307155dbaf08f734d7f4393385b99ac028379499d'
def admission(case,device_paths):
    assert case.get('preserveExistingPDFDeviceFiles') is True
    current=case.get('currentSupervisorPDF') is True
    if current:
        assert case.get('reservedCustomerPDF') is False
        assert case['profileId']=='947136fa-997b-4a83-819d-1b8bd3ecba68' and case['profileName']=='New customer'
    else:assert case.get('reservedCustomerPDF') is True
    assert case['invoiceNumber']==20261010 and case['invoiceId']=='b515e2b0-bde6-11f1-b80b-1f1c1f6b3e0c'
    assert case['artifactSHA256']==('a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69' if current else '08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7')
    assert device_paths=={'cache':'/data/user/0/in.gurucold.warehouse.fixture/cache/Invoice_20261010_FY2026-2027.pdf','export':'/sdcard/Download/Librera/Invoice_20261010_FY2026-2027.pdf'}
def preserve(driver,case,evidence,device_paths):
    admission(case,device_paths);proof={}
    for kind,path in device_paths.items():
        probe=subprocess.run([driver.c['adb'],'-s',driver.i['serial'],'shell','test','-e',path],capture_output=True,timeout=15)
        assert probe.returncode in [0,1],'Owned device file probe failed'
        if probe.returncode==1:proof[kind]={'existed':False};continue
        q=subprocess.run([driver.c['adb'],'-s',driver.i['serial'],'exec-out','cat',path],capture_output=True,timeout=15)
        assert q.returncode==0 and 1000<len(q.stdout)<=1048576 and q.stdout.startswith(b'%PDF-')
        sha=hashlib.sha256(q.stdout).hexdigest();assert sha in ({OLD_SHA,'b05cff567f130bdfb1090da70cc2a9d5f0187599db597db4dab464d787368786'} if case.get('currentSupervisorPDF') is True else {OLD_SHA}),'Unrecognized prior PDF; preserve without overwrite'
        target=evidence/(kind+'-prior-invoice.pdf')
        with target.open('xb') as f:f.write(q.stdout)
        assert hashlib.sha256(target.read_bytes()).hexdigest()==sha
        parsed=subprocess.run(['/usr/bin/pdftotext','-layout',str(target),'-'],capture_output=True,text=True,timeout=15)
        assert parsed.returncode==0 and '20261010' in parsed.stdout and 'Backend Test Customer A' in parsed.stdout
        proof[kind]={'existed':True,'sha256':sha,'privateCopy':str(target),'size':len(q.stdout),'readable':True}
    target=evidence/'prior-device-pdf-preservation.json'
    with target.open('x') as f:f.write(json.dumps(proof,indent=2)+'\n')
    return proof
