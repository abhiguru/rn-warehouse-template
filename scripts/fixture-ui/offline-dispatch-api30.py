#!/usr/bin/env python3
"""One prepared fictional dispatch: offline error, zero-write proof, explicit retry.

No OTP, seeding, fault arming, form edits or failed resume. If a first request is
uncertain, leave its owned network disconnected and preserve evidence. No second
write is allowed until native error and independent SQL reconciliation succeed.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import ssl
import http.client
import socket
import sys
import time
from dispatch_draft_controls import draft_labels
from dispatch_case_controls import Attempts, submission_point, owned_reverse_route
from dispatch_case_cleanup import cleanup_case
from navigation_controls import settings, disconnect, reconnect

spec = importlib.util.spec_from_file_location('fixture_soak', Path(__file__).with_name('soak-api30.py'))
soak = importlib.util.module_from_spec(spec); spec.loader.exec_module(soak)
os.umask(0o077)


def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main(path):
    case = json.loads(soak.private(path).read_text())
    c, inputs = soak.config(case['soakConfig'])
    assert case['backendCheckout'] == c['backendCheckout'] and case['backendState'] == c['backendState']
    assert case['artifactSHA256'] == c['apkSHA256']
    driver = soak.Soak(c, inputs, 'unused', 0)
    scripts = Path(__file__).parent.parent

    def backend(phase, draft=False):
        helper = scripts / ('fixture-dispatch-observe.mjs' if draft else 'fixture-offline-dispatch-observe.mjs')
        result = driver.backend_process(str(helper), [str(Path(path).resolve()), phase])
        if result.returncode: raise RuntimeError(('BLOCKED:' if result.returncode == 2 else 'FAIL:')+' guarded offline phase refused')
        assert json.loads(result.stdout)['status'] == 'PASS'
    backend('guard') # Before ADB, locks, socket/SQL, markers or route changes.
    required = ['fixture-dispatch-observe.mjs', 'fixture-dispatch-snapshot.mjs',
                'fixture-dispatch-verify.mjs', 'fixture-write-reconciliation.mjs',
                'fixture-session-guards.mjs', 'fixture-ui/dispatch-case-api30.py',
                'fixture-ui/dispatch_case_controls.py', 'fixture-ui/dispatch_case_cleanup.py',
                'fixture-ui/dispatch-draft-api30.py', 'fixture-ui/dispatch_draft_controls.py',
                'fixture-ui/soak-api30.py', 'fixture-ui/fixture_observation.py']
    extra = ['fixture-offline-dispatch-observe.mjs', 'fixture-ui/offline-dispatch-api30.py',
             'fixture-ui/navigation_controls.py']
    assert set(case['toolingSHA256']) == set(required) and set(case['offlineToolingSHA256']) == set(extra)
    def bindings():
        for mapping in [case['toolingSHA256'],case['offlineToolingSHA256']]:
            assert all(digest(scripts/name) == value for name,value in mapping.items()), 'Case source changed'
    bindings()
    lock = Path(case['soakConfig']).parent/'fixture-session-actor.lock'
    fd = os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    soak.private(lock); fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    evidence = soak.private(case['caseDirectory'],True)
    draft = json.loads(soak.private(evidence/'draft-result.json').read_text())
    assert draft['status']=='PASS' and draft['businessWriteAttempted'] is False and draft['routeHeldForGuardedCase']
    assert draft['configSHA256']==digest(path) and draft['driverSHA256']==digest(Path(__file__).with_name('dispatch-draft-api30.py'))
    assert 0 <= time.time()-(evidence/'draft-result.json').stat().st_mtime < 900, 'Fresh draft required'
    with (evidence/'offline-case-started.json').open('x') as file:
        json.dump({'driverSHA256':digest(__file__),'configSHA256':digest(path),'utcEpoch':time.time()},file)
    driver.e,driver.file = evidence,evidence/'offline-case-result.json'
    driver.state.update(scope='reserved native offline dispatch',attempts=0,phases=[]);driver.save()
    attempts = Attempts();radios = None;network_touched = False;network_restored = False;zero_proved = False
    route_verified = False

    def save(name,value):
        with (evidence/(name+'.json')).open('x') as file:json.dump(value,file)

    def review():
        labels = draft_labels(driver.wait('Submit Dispatch'),case['record'],case['sourceReceipt'],case['sourceQuantity'])
        assert hashlib.sha256(json.dumps(labels).encode()).hexdigest()==draft['reviewLabelsSHA256'], 'Keep the exact prepared form'

    def tap(label):
        driver.adb('shell','input','tap',*map(str,submission_point(driver.wait(label),label,case['record'])))

    def submit():
        bindings();backend('guard');attempts.authorize();driver.state['attempts']=attempts.count;driver.save()
        tap('Submit Dispatch')
        save('offline-submit-attempt-'+str(attempts.count),{'attempt':attempts.count,'utcEpoch':time.time()})
        tap('Submit')

    def transport(port):
        context = ssl.create_default_context(cafile=c['primaryCA'])
        conn = http.client.HTTPSConnection('backend-core.example.test',port,timeout=10,context=context)
        try:
            conn.sock=context.wrap_socket(socket.create_connection(('127.0.0.1',port),timeout=10),server_hostname='backend-core.example.test')
            conn.request('GET','/functions/v1/get-public-config',headers={'Host':'backend-core.example.test'})
            response=conn.getresponse();raw=response.read(65537)
            assert response.status==200 and len(raw)<=65536
            data=json.loads(raw)['data'];assert data['instanceId']==case['instanceId'] and data['canonicalOrigin']=='https://backend-core.example.test'
        finally:conn.close()

    try:
        audit=json.loads(soak.private(case['artifactAudit']).read_text())
        assert audit['status']=='PASS' and audit.get('sha256',audit.get('artifact',{}).get('sha256'))==c['apkSHA256']
        assert driver.adb('emu','avd','name').splitlines()[0]=='TestWarehouseFixture_API30'
        assert driver.adb('shell','getprop','ro.build.version.sdk')=='30' and driver.adb('shell','getenforce')=='Enforcing'
        package=driver.adb('shell','pm','path',soak.PACKAGE);assert re.fullmatch(r'package:/data/app/[^\n]+',package)
        assert driver.adb('shell','sha256sum',package[8:]).split()[0]==c['apkSHA256']
        owned_reverse_route(driver.adb('reverse','--list'),18643);route_verified=True
        transport(18443);transport(18643);review();backend('pre-submit',draft=True)
        radios=settings(driver.adb);save('offline-network-before',radios)
        network_touched=True;disconnect(driver.adb,radios,18643)
        driver.wait('No internet connection');review();submit()
        driver.wait('Error');save('native-offline-error',{'nativeError':True})
        backend('after-offline-error');zero_proved=True
        # Only a completed native error and independently empty document/cache
        # permit reconnection. An unresolved first request is never resumed.
        attempts.verified_loss();tap('OK');review()
        reconnect(driver.adb,radios,18643);network_restored=True
        deadline=time.monotonic()+30
        while any('No internet connection' in [n.get('text'),n.get('content-desc')] for n in driver.snapshot().iter('node')):
            assert time.monotonic()<deadline;time.sleep(1)
        transport(18643);time.sleep(30);review();backend('after-reconnect')
        driver.state['phases'].append('ZERO_WRITE_AND_30_SECOND_NO_REPLAY_PROVED');driver.save()
        submit();driver.wait('Dispatch Created Successfully!')
        save('native-offline-retry',{'nativeError':True,'nativeSuccess':True,'unchangedForm':True,'submitAttempts':attempts.count})
        backend('after-submit');driver.state.update(status='PASS')
        driver.state['phases'].append('ONE_EXPLICIT_RETRY_ONE_COMMIT_STOCK_CACHE_RECONCILED')
    except Exception:
        driver.state.update(status='FAIL',reason='Preserve evidence; no replay; uncertain first request stays disconnected')
        raise
    finally:
        # Restore an owned network only before any submit or after proving the
        # completed first error made zero writes. Never reconnect an uncertain
        # first submit; doing so could release an unobserved pending request.
        if network_touched and not network_restored and (attempts.count==0 or zero_proved):
            try:reconnect(driver.adb,radios,18643);network_restored=True
            except Exception:driver.state['status']='FAIL'
        driver.state['networkRestored']=network_restored
        if driver.state['status']=='PASS':
            cleanup=cleanup_case(route_verified,False,case['record'],case['phase'],None,driver.adb,save)
            if cleanup.pop('status')!='PASS':driver.state['status']='FAIL'
            driver.state.update(cleanup)
        driver.save();os.close(fd)
    assert driver.state['status']=='PASS'
    print(json.dumps({'status':'PASS','scope':'one offline error and explicitly reconciled dispatch retry'}))


if __name__=='__main__':
    try:
        assert len(sys.argv)==2;main(sys.argv[1])
    except Exception as error:
        blocked=str(error).startswith('BLOCKED:')
        print(json.dumps({'status':'BLOCKED' if blocked else 'FAIL','category':'OFFLINE_DISPATCH_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
