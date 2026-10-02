#!/usr/bin/env python3
"""One synthetic-camera QR discovery, leaving without selecting or authenticating."""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

spec=importlib.util.spec_from_file_location('fixture_auth',Path(__file__).with_name('auth-api30.py'))
auth=importlib.util.module_from_spec(spec);spec.loader.exec_module(auth)
spec=importlib.util.spec_from_file_location('fixture_navigation',Path(__file__).with_name('navigation-api30.py'))
navigation=importlib.util.module_from_spec(spec);spec.loader.exec_module(navigation)
os.umask(0o077)


class QR(auth.Auth):
    selected_server=navigation.Navigation.selected_server

    def tap(self,label):
        assert label in {'Change warehouse server','Scan QR code'},'QR must never select, submit or authenticate'
        super().tap(label)

    def camera_permission(self):
        text=self.adb('shell','dumpsys','package',auth.soak.PACKAGE)
        values=re.findall(r'android\.permission\.CAMERA: granted=(true|false)',text)
        assert len(values)==1,'Exact owned camera permission required'
        return values[0]=='true'


def main(path):
    case=json.loads(auth.soak.private(path).read_text());ui=json.loads(auth.soak.private(case['soakConfig']).read_text())
    scripts=Path(__file__).parent.parent
    def observe(phase):
        command=shlex.join([ui['node'],str(scripts/'fixture-qr-observe.mjs'),str(Path(path).resolve()),phase])
        q=subprocess.run(['/usr/bin/sg','docker','-c',command],capture_output=True,timeout=70,env={**os.environ,'PATH':str(Path(ui['node']).parent)+':'+os.environ['PATH']})
        assert q.returncode==0,'QR ownership/preservation observation refused'
    observe('guard')
    c,i=auth.soak.config(case['soakConfig'])
    fd=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=Path(case['caseDirectory']);auth.soak.private(e.parent,True);assert not e.exists(),'No resume or attempt replacement';e.mkdir(mode=0o700)
    d=QR(c,i,'unused',0);d.e,d.file=e,e/'qr-result.json';d.state.update(phases=[],configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),nativeScanPASS=False);d.save()
    changed_permission=False
    try:
        d.state['failurePhase']='PRE_QR_OBSERVATION';d.save();observe('before')
        assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert d.adb('shell','getprop','ro.build.version.sdk')=='30'
        assert d.adb('shell','getenforce')=='Enforcing'
        installed=d.adb('shell','pm','path',auth.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',installed)
        assert d.adb('shell','sha256sum',installed[8:]).split()[0]==c['apkSHA256']
        assert d.camera_permission() is False,'Require documented original denied camera permission'
        d.adb('shell','am','force-stop',auth.soak.PACKAGE);d.adb('shell','monkey','-p',auth.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1')
        d.wait('Send OTP');d.archive('qr-cold-login-before')
        p=e/'selection-before';p.mkdir(mode=0o700);d.selected_server(p,case['origin'],case['instanceId'])
        d.state['failurePhase']='TEMPORARY_SYNTHETIC_CAMERA_PERMISSION';d.save()
        d.adb('shell','pm','grant',auth.soak.PACKAGE,'android.permission.CAMERA');changed_permission=True
        assert d.camera_permission() is True
        d.tap('Change warehouse server');d.wait('Choose your warehouse server');d.archive('qr-selection-before-scan')
        d.state['failurePhase']='ONE_SYNTHETIC_QR_SCAN';d.save();d.tap('Scan QR code')
        tree=d.wait('Use this server')
        labels={v for n in tree.iter('node') for v in [n.get('text'),n.get('content-desc')] if v}
        assert case['origin'] in labels and case['displayName'] in labels,'Genuine QR discovery identity must be displayed'
        d.archive('qr-genuine-discovery-preview');d.state['phases'].append('SYNTHETIC_CAMERA_GENUINE_DISCOVERY');d.save()
        # Leave the preview with Android Back. Use this server is never tapped.
        d.adb('shell','input','keyevent','4');d.wait('Send OTP');d.archive('qr-preview-left-without-selection')
        d.adb('shell','pm','revoke',auth.soak.PACKAGE,'android.permission.CAMERA');changed_permission=False
        assert d.camera_permission() is False
        d.adb('shell','am','force-stop',auth.soak.PACKAGE);d.adb('shell','monkey','-p',auth.soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1')
        d.wait('Send OTP');d.archive('qr-cold-login-after')
        p=e/'selection-after';p.mkdir(mode=0o700);d.selected_server(p,case['origin'],case['instanceId'])
        d.state['failurePhase']='POST_QR_RECONCILIATION';d.save();observe('after')
        d.state.update(status='PASS',nativeScanPASS=True,syntheticEmulatorEvidenceOnly=True,selectedServerUnchanged=True,newOTPs=0,cameraPermissionRestored=True,completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());d.save()
    except Exception:
        d.state.update(status='FAIL',reason='QR stopped; preserve evidence and do not automatically retry');d.save();raise
    finally:
        if changed_permission:
            try:
                assert d.camera_permission() is True
                d.adb('shell','pm','revoke',auth.soak.PACKAGE,'android.permission.CAMERA')
                assert d.camera_permission() is False
                d.state['cameraPermissionRestored']=True;d.save()
            except Exception:
                d.state['cameraPermissionRestoration']='BLOCKED';d.save()
        os.close(fd)
    print(json.dumps({'status':'PASS','scope':'synthetic-camera-QR-discovery-cancel'}))


if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:
        print(json.dumps({'status':'FAIL','category':'QR_STOPPED_NO_AUTOMATIC_RETRY'}));sys.exit(1)
