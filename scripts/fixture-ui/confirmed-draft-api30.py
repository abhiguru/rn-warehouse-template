#!/usr/bin/env python3
"""One real unsaved draft and different-origin confirmation; no destination login.

PASS is pre-authentication reconciliation only. Native empty-draft acceptance
requires a separately guarded ordinary destination login and UI continuation.
"""
import datetime
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import socket
import ssl
import subprocess
import sys
import time
from confirmed_draft_controls import credential_presence
from unsaved_customer_controls import customer_name_point
from unsaved_grn_controls import grn_number_point
from unsaved_invoice_controls import invoice_number_point
from unsaved_dispatch_controls import dispatch_notes_point, optional_toggle_point
spec=importlib.util.spec_from_file_location('navigation',Path(__file__).with_name('navigation-api30.py'))
nav=importlib.util.module_from_spec(spec);spec.loader.exec_module(nav)
os.umask(0o077)
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def main(path):
    c=json.loads(nav.soak.private(path).read_text())
    scripts=Path(__file__).parent.parent
    ui=json.loads(nav.soak.private(c['soakConfig']).read_text())
    def observe(phase):
        command=shlex.join([ui['node'],str(scripts/'fixture-confirmed-draft-observe.mjs'),path,phase])
        q=subprocess.run(['/usr/bin/sg','docker','-c',command],capture_output=True,timeout=45,env={**os.environ,'PATH':str(Path(ui['node']).parent)+':'+os.environ['PATH']})
        assert q.returncode==0,'Confirmed draft observer refused; preserve private evidence'
        assert json.loads(q.stdout)=={'status':'PASS','phase':phase,'scope':'confirmed-switch-pre-authentication-observation-only'}
    observe('guard')  # Release and exact bindings before ADB, locks or attempts.
    cfg,inputs=nav.soak.config(c['soakConfig'])
    assert inputs['serial']=='emulator-5556' and cfg['apkSHA256']==c['artifactSHA256']
    deadline=datetime.datetime.fromisoformat(c['deadlineUTC'].replace('Z','+00:00')).timestamp()
    assert 0<deadline-time.time()<=600
    markers={'customer':'Fixture VM0110 confirmed customer','grn':'FXS992','dispatch':'Fixture VM0110 confirmed dispatch','invoice':'20261992'}
    assert c['draftMarker']==markers[c['draftKind']]
    assert type(c['attemptNumber']) is int and c['attemptNumber'] in [1,2,3]
    e=Path(c['caseDirectory']);nav.soak.private(e.parent,True);assert not e.exists(),'No resume or evidence replacement'
    fd=os.open(Path(c['soakConfig']).parent/'fixture-session-actor.lock',os.O_RDWR|os.O_NOFOLLOW)
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    class Draft(nav.Navigation):
        def adb(self,*args):
            assert time.time()<deadline,'Stop at the configured deadline'
            return super().adb(*args)
        def archive(self,label):
            assert label in ['real-unsaved-draft','switch-warning','destination-login','cold-destination-login','destination-login-after-read-settlement']
            tree=self.snapshot()
            for n in tree.iter('node'):
                for key in ['text','content-desc']:
                    n.set(key,re.sub(r'\b(?:91)?\d{10}\b','[private phone]',n.get(key,'')))
            raw=nav.ET.tostring(tree,encoding='unicode');assert len(raw)<=1048576
            with (self.e/(label+'.xml')).open('x') as f:f.write(raw)
    e.mkdir(mode=0o700)
    d=Draft(cfg,inputs,'unused',0);d.e=e;d.file=e/'confirmed-native-result.json'
    d.state.update(artifactSHA256=c['artifactSHA256'],configSHA256=digest(path),draftKind=c['draftKind'],confirmationAttempts=0,businessSubmitAttempts=0,otpRequests=0,destinationLoginAttempts=0,phases=[])
    d.save()
    def route(value):d.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://'+value,'-p',nav.soak.PACKAGE)
    def marker():
        ns=[n for n in d.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('text')==c['draftMarker']]
        assert len(ns)==1 and ns[0].get('enabled')=='true','Real exact unsaved draft required'
    def discover(origin,port,ca,identity):
        host=origin.removeprefix('https://');context=ssl.create_default_context(cafile=ca)
        conn=http.client.HTTPSConnection(host,port,timeout=10,context=context)
        try:
            conn.sock=context.wrap_socket(socket.create_connection(('127.0.0.1',port),timeout=10),server_hostname=host)
            conn.request('GET','/functions/v1/get-public-config',headers={'Host':host})
            response=conn.getresponse();raw=response.read(65537);assert response.status==200 and len(raw)<=65536
            data=json.loads(raw)['data'];assert data['instanceId']==identity and data['canonicalOrigin']==origin
            return data['displayName']
        finally:conn.close()
    try:
        assert d.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert d.adb('shell','getprop','ro.build.version.sdk')=='30' and d.adb('shell','getenforce')=='Enforcing'
        p=d.adb('shell','pm','path',nav.soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',p)
        assert d.adb('shell','sha256sum',p[8:]).split()[0]==c['artifactSHA256']
        nav.owned_reverse_route(d.adb('reverse','--list'),18443);d.health();observe('before')
        returning=c.get('confirmedDraftSwitchBack') is True
        discover(c['origin'],18444 if returning else 18443,cfg['secondaryCA' if returning else 'primaryCA'],c['instanceId'])
        target_name=discover(c['targetOrigin'],18443 if returning else 18444,cfg['primaryCA' if returning else 'secondaryCA'],c['targetInstanceId'])
        assert target_name==('Fictional Core Warehouse' if returning else 'Fictional Switching Warehouse')
        d.cold();d.wait('Orders tab');assert credential_presence(d.adb),'Ordinary source session required'
        def read_events():
            log=nav.soak.private(c['sourceHTTPLog']);raw=log.read_text();assert len(raw)<=8388608
            return [json.loads(line) for line in raw.splitlines() if line.startswith('{')]
        def settled_reads():
            end=time.monotonic()+45
            while True:
                events=read_events();starts=[x for x in events if x.get('event')=='confirmed-orders-delay-start'];ends=[x for x in events if x.get('path')=='/rest/v1/rpc/get_orders_list' and x.get('event') in ['complete','client-response-closed','client-request-aborted']]
                if starts and ends and datetime.datetime.fromisoformat(ends[-1]['atUTC'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(starts[-1]['atUTC'].replace('Z','+00:00')):break
                assert time.monotonic()<end,'Actual startup read settlement required';time.sleep(.5)
        if c.get('confirmedOrdersResponseSwitch') is True:settled_reads()

        original=e/'original-selection';original.mkdir(mode=0o700);d.selected_server(original,c['origin'],c['instanceId'])
        kind=c['draftKind'];route(('customer' if kind=='customer' else kind)+'-form/step1')
        if kind=='customer':
            tree=d.wait('Enter customer name');xy=customer_name_point(tree);old=''
        elif kind=='grn':
            tree=d.wait('Receipt number');xy=grn_number_point(tree,'A0001');old='A0001'
        elif kind=='invoice':
            tree=d.wait('Auto-generated, can be edited');x,y,old=invoice_number_point(tree);xy=(x,y)
        else:
            d.wait('Dispatch number');d.wait('Select customer...')
            for _ in range(7):
                if 'Show Optional Fields' in nav.labels(d.snapshot()):break
                d.adb('shell','input','swipe','360','1050','360','450','400')
            d.adb('shell','input','tap',*map(str,optional_toggle_point(d.wait('Show Optional Fields'))))
            for _ in range(7):
                if 'Additional notes (max 250 characters)' in nav.labels(d.snapshot()):break
                d.adb('shell','input','swipe','360','1050','360','450','400')
            tree=d.wait('Additional notes (max 250 characters)');xy=dispatch_notes_point(tree);old=''
        d.adb('shell','input','tap',*map(str,xy))
        focused=[n for n in d.snapshot().iter('node') if n.get('class')=='android.widget.EditText' and n.get('focused')=='true'];assert len(focused)==1
        assert focused[0].get('text','') in ([old] if old else ['', 'Enter customer name','Additional notes (max 250 characters)']),'Never overwrite an existing draft'
        if old:
            d.adb('shell','input','keyevent','123')
            for _ in old:d.adb('shell','input','keyevent','67')
        d.adb('shell','input','text',c['draftMarker'].replace(' ','%s'));marker()
        if 'mInputShown=true' in d.adb('shell','dumpsys','input_method'):d.adb('shell','input','keyevent','4')
        marker();d.archive('real-unsaved-draft');d.state['phases'].append('ACTUAL_UNSAVED_DRAFT_NO_SUBMISSION');pid=d.adb('shell','pidof',nav.soak.PACKAGE);assert re.fullmatch(r'[1-9]\d*',pid);d.state['draftProcessPID']=int(pid);d.save()
        if c.get('confirmedOrdersResponseSwitch') is True:
            route('orders');d.wait('Orders tab');settled_reads();d.wait('Refresh orders')
            since=datetime.datetime.now(datetime.timezone.utc).isoformat();d.state['readRequestedUTC']=since;d.save();d.tap('Refresh orders')
            end=time.monotonic()+10
            while True:
                starts=[x for x in read_events() if x.get('event')=='confirmed-orders-delay-start' and datetime.datetime.fromisoformat(x['atUTC'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(since)]
                if starts:assert len(starts)==1 and starts[0]['status']==200 and starts[0]['delayMs']==30000;break
                assert time.monotonic()<end,'Actual pending authenticated read required';time.sleep(.1)
        route('operator-server');d.wait('Choose your warehouse server');d.fill_origin(c['targetOrigin']);d.tap('Check server');d.wait(target_name);d.wait(c['targetOrigin']);d.tap('Use this server');d.wait('Change Warehouse Server')
        warning=f'Changing to {target_name} will sign you out and discard unsaved forms. You will need to sign in again.'
        assert warning in nav.labels(d.snapshot());d.archive('switch-warning')
        d.state['confirmationAttempts']=1;d.state['confirmationAttemptUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();d.save();d.tap('CHANGE SERVER')
        d.wait('Send OTP');d.archive('destination-login');d.state['destinationLoginRequired']=True;d.save()
        assert not credential_presence(d.adb),'Old credential keys survived'
        pid=d.adb('shell','pidof',nav.soak.PACKAGE);assert re.fullmatch(r'[1-9]\d*',pid) and int(pid)==d.state['draftProcessPID'],'Keep the actual draft process alive until destination authentication and empty-form checks'
        d.selected_server(e,c['targetOrigin'],c['targetInstanceId'])
        d.state.update(postConfirmationColdLaunchAttempts=0,destinationProcessPID=int(pid),selection={'origin':c['targetOrigin'],'instanceId':c['targetInstanceId']},oldCredentialStoragePresent=False,status='RECONCILIATION_PENDING');d.save()
        if c.get('confirmedOrdersResponseSwitch') is True:
            end=time.monotonic()+45
            while True:
                settled=[x for x in read_events() if x.get('path')=='/rest/v1/rpc/get_orders_list' and x.get('event') in ['complete','client-response-closed','client-request-aborted','upstream-timeout','upstream-unavailable'] and datetime.datetime.fromisoformat(x['atUTC'].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(d.state['readRequestedUTC'])]
                if settled:break
                assert time.monotonic()<end,'Actual old-read settlement required';time.sleep(.5)
            d.wait('Send OTP');d.archive('destination-login-after-read-settlement')
        observe('after')
        d.state.update(status='PASS',scope='confirmed-switch-pre-authentication-reconciliation-only',draftAcceptance='NOT_TESTED',requiredNext='Separately guarded ordinary destination login and actual empty-draft UI checks in this same process, then cold persistence; preserve destination selection and process')
        d.save();print(json.dumps({'status':'PASS','scope':d.state['scope'],'draftAcceptance':'NOT_TESTED'}))
    except Exception as error:
        d.state.update(status='FAIL',exceptionType=type(error).__name__,reason='Preserve draft/session/selection and evidence; no replay, destination authentication or automatic cleanup')
        d.save();raise
    finally:os.close(fd)
if __name__=='__main__':
    try:assert len(sys.argv)==2;main(str(Path(sys.argv[1]).resolve()))
    except Exception:print('{"status":"FAIL","category":"CONFIRMED_DRAFT_NATIVE_STOPPED"}');sys.exit(1)
