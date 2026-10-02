#!/usr/bin/env python3
"""One ordinary fictional native login, bounded by the caller; never retries OTP.

Uses the existing API30 capture and independently guarded database observations.
Plaintext mock challenge travels only in private IPC and ADB stdin.
"""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('soak',Path(__file__).with_name('soak-api30.py'))
soak=importlib.util.module_from_spec(spec);spec.loader.exec_module(soak)
os.umask(0o077)


def point(tree,label,editable=False):
    assert label not in {'Wait','Close app','Resend code','Retry'}, 'Unsafe authentication action'
    nodes=[n for n in tree.iter('node') if label in [n.get('text'),n.get('content-desc')] and (n.get('class')=='android.widget.EditText')==editable]
    preferred=[n for n in nodes if n.get('class')=='android.widget.Button']
    if preferred: nodes=preferred
    assert len(nodes)==1 and nodes[0].get('enabled')=='true','Unique enabled control required'
    m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',nodes[0].get('bounds',''));assert m
    x,y,xx,yy=map(int,m.groups());assert 0<=x<xx<=720 and 0<=y<yy<=1280,'Visible control required'
    return (x+xx)//2,(y+yy)//2


def input_matches(label, actual, expected):
    if label == 'Enter your mobile number':
        return re.sub(r'\D', '', actual) == expected and re.fullmatch(r'\d{10}', expected) is not None
    return actual == expected


class Auth(soak.Soak):
    def snapshot(self):
        self.health(True)
        cap=self.i['uiCapture']
        raw=self.adb('exec-out','env','CLASSPATH=/system/framework/uiautomator.jar:'+cap['remotePath'],'app_process','/system/bin','FixtureUiCapture')
        match=re.search(r'(<hierarchy\b.*?</hierarchy>)',raw,re.S);assert match,'Bounded hierarchy unavailable'
        return ET.fromstring(match.group(1))

    def tap(self,label):
        self.adb('shell','input','tap',*map(str,point(self.wait(label),label)))

    def fill(self,label,value):
        self.adb('shell','input','tap',*map(str,point(self.wait(label),label,True)))
        fields=[n for n in self.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true']
        assert len(fields)==1 and label in [fields[0].get('text'),fields[0].get('content-desc')]
        old=fields[0].get('text','');assert len(old)<=128
        self.adb('shell','input','keyevent','123')
        for _ in old:self.adb('shell','input','keyevent','67')
        self.adb('shell','input','text',value.replace(' ','%s'))
        assert any(input_matches(label,n.get('text',''),value) and n.get('focused')=='true' for n in self.snapshot().iter('node'))
        if 'mInputShown=true' in self.adb('shell','dumpsys','input_method'):self.adb('shell','input','keyevent','4')

    def archive(self,label):
        t=self.snapshot()
        otp=any(n.get('text')=='Verify Your Phone' for n in t.iter('node'))
        for n in t.iter('node'):
            for k in ['text','content-desc']:
                v=n.get(k,'');v=re.sub(r'\b(?:91)?\d{10}\b','[private phone]',v);v=re.sub(r'\b\d{6}\b','[private digits]',v)
                if otp and (re.fullmatch(r'\d+',v) or n.get('class')=='android.widget.EditText'):v='[private OTP input]'
                n.set(k,v)
        (self.e/(label+'.xml')).write_text(ET.tostring(t,encoding='unicode'))


def main(path):
    case=json.loads(soak.private(path).read_text());ui=json.loads(soak.private(case['soakConfig']).read_text())
    scripts=Path(__file__).parent.parent
    bounded=case.get('customerBApprovedAuthentication') is True or case.get('rejectedAuthentication') is True;deadline=None
    if bounded:
        deadline=datetime.datetime.fromisoformat(case['deadlineUTC'].replace('Z','+00:00')).timestamp();assert 0<deadline-time.time()<=600
        campaign=json.loads(soak.private(case['campaignFile']).read_text());assert campaign['deadline']==case['campaignDeadlineUTC'];assert deadline<=datetime.datetime.fromisoformat(campaign['deadline'].replace('Z','+00:00')).timestamp()
        assert case['artifactSHA256']==ui['apkSHA256'];assert hashlib.sha256(Path(case['soakConfig']).read_bytes()).hexdigest()==case['soakConfigSHA256']
        names=['fixture-auth-observe.mjs','fixture-auth-controls.mjs','fixture-session-guards.mjs','fixture-ui/auth-api30.py','fixture-ui/soak-api30.py','fixture-ui/fixture_observation.py','fixture-soak-preflight.mjs','prepare-emulator-fixture.mjs','fixture-service-health.mjs','is-main.mjs']
        assert set(case['toolingSHA256'])==set(names) and all(hashlib.sha256((scripts/n).read_bytes()).hexdigest()==case['toolingSHA256'][n] for n in names)
        helper=json.loads(soak.private(case['helperConfig']).read_text());assert hashlib.sha256(Path(case['helperConfig']).read_bytes()).hexdigest()==case['helperConfigSHA256'];assert helper['scope']=='isolated-fictional-fixture' and len(helper['services'])==1
        h=helper['services'][0];assert h['kind']=='core' and h['state']==ui['backendState'] and h['owningCheckout']==ui['backendCheckout'] and h['ownerGuardSHA256']==case['fixtureGuardSHA256'] and h['socketPath']==case['otpSocket'] and h.get('ordersReadDelayMs',0)==0;assert ui['managedUnits']['core']=='warehouse-fixture-core-'+helper['runId']+'.service'
    def alive():
        if bounded:assert time.time()<deadline,'B authentication deadline'
    def observe(phase):
        alive()
        command=shlex.join([ui['node'],str(scripts/'fixture-auth-observe.mjs'),str(Path(path).resolve()),phase])
        q=subprocess.run(['/usr/bin/sg','docker','-c',command],capture_output=True,timeout=45,env={**os.environ,'PATH':str(Path(ui['node']).parent)+':'+os.environ['PATH']})
        assert q.returncode==0,'Ordinary auth ownership/quota/reconciliation refused'
    observe('guard') # Real release and ownership checks precede ADB and attempt creation.
    c,i=soak.config(case['soakConfig'])
    assert case['expected'] in ['authenticated','pending','disabled','rejected']
    fd=os.open(Path(case['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW)
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    e=Path(case['caseDirectory']);soak.private(e.parent,True);assert not e.exists(),'Preserve attempts; no resume';e.mkdir(mode=0o700)
    class BoundedAuth(Auth):
        def adb(self,*args):alive();return super().adb(*args)
    driver=BoundedAuth(c,i,'unused',0);driver.e,driver.file=e,e/'auth-result.json';driver.state.update(phases=[],configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest());driver.save()
    try:
        if bounded:
            command=shlex.join([ui['node'],str(scripts/'fixture-soak-preflight.mjs'),case['soakConfig']]);q=subprocess.run(['/usr/bin/sg','docker','-c',command],capture_output=True,timeout=90,env={**os.environ,'PATH':str(Path(ui['node']).parent)+':'+os.environ['PATH']});assert q.returncode==0,'Actual normal helper readiness required'
        driver.state['failurePhase']='PRE_AUTH_OBSERVATION';driver.save()
        observe('before')
        assert driver.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert driver.adb('shell','getprop','ro.build.version.sdk')=='30' and driver.adb('shell','getenforce')=='Enforcing'
        installed=driver.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',installed)
        assert driver.adb('shell','sha256sum',installed[8:]).split()[0]==c['apkSHA256']
        driver.adb('shell','am','force-stop',soak.PACKAGE);driver.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1')
        tree=driver.wait('Send OTP');driver.archive('cold-login')
        driver.state['failurePhase']='FILL_FICTIONAL_PHONE';driver.save()
        driver.fill('Enter your mobile number',case['phone'][-10:])
        driver.state['failurePhase']='ORDINARY_OTP_REQUEST';driver.save()
        driver.tap('Send OTP');driver.state['phases'].append('ONE_ORDINARY_OTP_REQUEST');driver.save()
        driver.state['failurePhase']='OTP_INPUT';driver.save()
        driver.wait('Verify Your Phone');tree=driver.snapshot();assert any(case['phone'] in n.get('text','') for n in tree.iter('node')),'Bound fictional phone required'
        # Existing explicitly measured API30 code row. Verify target input before private IPC.
        driver.adb('shell','input','tap','360','585')
        ime=driver.adb('shell','dumpsys','input_method')
        assert 'inputType=0x00004002 targetApp='+soak.PACKAGE in ime,'Bound numeric fixture input required'
        alive();sock=case['otpSocket'];st=Path(sock).lstat();assert st.st_uid==os.getuid() and st.st_mode&0o077==0
        with socket.socket(socket.AF_UNIX) as s:
            s.settimeout(5);s.connect(sock);s.sendall((json.dumps({'phone':case['phone']})+'\n').encode());reply=json.loads(s.recv(1024))
        code=reply.get('code','');assert re.fullmatch(r'\d{6}',code),'Fresh mock challenge unavailable'
        alive();q=subprocess.run([c['adb'],'-s',i['serial'],'shell','sh'],input=('input text '+code+'\n').encode(),capture_output=True,timeout=15)
        del code,reply;assert q.returncode==0,'Private challenge entry failed'
        if case['expected'] in ['disabled','rejected']:
            driver.wait('Verification Failed');driver.archive(case['expected']+'-verification-denied')
            assert not any(n.get('text') in ['Orders tab','Enrollment status'] or n.get('content-desc')=='Orders tab' for n in driver.snapshot().iter('node'))
            driver.tap('OK')
            driver.adb('shell','am','force-stop',soak.PACKAGE)
            driver.adb('shell','monkey','-p',soak.PACKAGE,'-c','android.intent.category.LAUNCHER','1')
            driver.wait('Send OTP');driver.archive(case['expected']+'-cold-login-required')
            driver.state['phases'].append(case['expected'].upper()+'_DENIAL_AND_COLD_LOGIN')
        else:
            driver.wait('Orders tab' if case['expected']=='authenticated' else 'Enrollment status')
        driver.state['failurePhase']='POST_AUTH_RECONCILIATION';driver.save()
        observe('after');driver.archive('ordinary-login-result')
        driver.state.update(status='PASS',ordinaryAuthentication=True,newOTPs=1,completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());driver.save()
    except Exception:
        driver.state.update(status='FAIL',reason='Native authentication stopped; preserve evidence and quota; no retry');driver.save();raise
    finally:os.close(fd)
    print(json.dumps({'status':'PASS','scope':'ordinary-native-fixture-authentication'}))


if __name__=='__main__':
    try:assert len(sys.argv)==2;main(sys.argv[1])
    except Exception:
        print(json.dumps({'status':'FAIL','category':'AUTH_STOPPED_NO_AUTOMATIC_RETRY'}));sys.exit(1)
