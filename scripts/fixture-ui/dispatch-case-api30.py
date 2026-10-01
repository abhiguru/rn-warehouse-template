#!/usr/bin/env python3
"""One reserved dispatch fault/retry case after a separately verified draft.

No login, seeding, form editing, route substitution before retry or failed resume.
Requires the reviewed observer and an exclusive released fixture. Source-only
until its SQL, native selectors and end-to-end execution have been validated.
"""
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import ssl
import sys
import time
from dispatch_draft_controls import draft_labels
from dispatch_case_controls import Attempts, submission_point

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

    def backend(phase, verify=False):
        helper = scripts / ('fixture-dispatch-verify.mjs' if verify else 'fixture-dispatch-observe.mjs')
        r = driver.backend_process(str(helper.resolve()), [str(Path(path).resolve()), phase])
        if r.returncode: raise RuntimeError(('BLOCKED:' if r.returncode == 2 else 'FAIL:') + ' guarded phase refused')
        assert json.loads(r.stdout)['status'] == 'PASS'

    backend('guard')  # Before ADB, locks, socket/SQL, markers or routes.
    required = ['fixture-dispatch-observe.mjs', 'fixture-dispatch-snapshot.mjs',
                'fixture-dispatch-verify.mjs', 'fixture-write-reconciliation.mjs',
                'fixture-session-guards.mjs', 'fixture-ui/dispatch-case-api30.py',
                'fixture-ui/dispatch_case_controls.py', 'fixture-ui/dispatch-draft-api30.py',
                'fixture-ui/dispatch_draft_controls.py', 'fixture-ui/soak-api30.py',
                'fixture-ui/fixture_observation.py']
    assert set(case['toolingSHA256']) == set(required), 'Complete case source bindings required'
    def bindings():
        assert all(digest(scripts / name) == case['toolingSHA256'][name] for name in required), 'Case tooling changed'
    bindings()
    lock = Path(case['soakConfig']).parent / 'fixture-session-actor.lock'
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    soak.private(lock); fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    evidence = soak.private(case['caseDirectory'], True)
    draft = json.loads(soak.private(evidence / 'draft-result.json').read_text())
    assert draft['status'] == 'PASS' and draft['businessWriteAttempted'] is False and draft['routeHeldForGuardedCase']
    assert draft['configSHA256'] == digest(path)
    assert draft['driverSHA256'] == digest(Path(__file__).with_name('dispatch-draft-api30.py'))
    assert 0 <= time.time() - (evidence / 'draft-result.json').stat().st_mtime < 900, 'Fresh draft required'
    # An interrupted invocation cannot be resumed, even if it failed before Submit.
    with (evidence / 'case-started.json').open('x') as f:
        json.dump({'driverSHA256': digest(__file__), 'configSHA256': digest(path), 'utcEpoch': time.time()}, f)
    driver.e, driver.file = evidence, evidence / 'case-result.json'
    driver.state.update(scope='reserved direct partial dispatch fault case', phases=[], attempts=0)
    driver.save()
    attempts = Attempts(); touched_control = False

    def save(name, value):
        with (evidence / (name+'.json')).open('x') as f: json.dump(value, f)

    def control(command):
        sockpath = Path(case['faultSocket']); st = sockpath.lstat()
        import stat
        assert sockpath.resolve() == sockpath and stat.S_ISSOCK(st.st_mode) and st.st_uid == os.getuid() and st.st_mode & 0o077 == 0
        soak.private(sockpath.parent, True)
        with socket.socket(socket.AF_UNIX) as sock:
            sock.settimeout(5); sock.connect(str(sockpath)); sock.sendall((json.dumps(command)+'\n').encode())
            chunks = bytearray()
            while True:
                part = sock.recv(2048)
                if not part: break
                chunks.extend(part); assert len(chunks) <= 8192
        data = json.loads(chunks); assert 'error' not in data
        return data

    def transport(port):
        context = ssl.create_default_context(cafile=c['primaryCA'])
        conn = http.client.HTTPSConnection('backend-core.example.test', port, timeout=10, context=context)
        try:
            # Explicit loopback socket, certificate/hostname verification still enabled.
            conn.sock = context.wrap_socket(socket.create_connection(('127.0.0.1', port), timeout=10), server_hostname='backend-core.example.test')
            conn.request('GET', '/functions/v1/get-public-config', headers={'Host':'backend-core.example.test'})
            response = conn.getresponse(); raw = response.read(65537)
            assert response.status == 200 and len(raw) <= 65536
            data = json.loads(raw)['data']
            assert data['instanceId'] == case['instanceId'] and data['canonicalOrigin'] == 'https://backend-core.example.test'
        finally: conn.close()

    def review_hash():
        labels = draft_labels(driver.wait('Submit Dispatch'), case['record'], case['sourceReceipt'], case['sourceQuantity'])
        value = hashlib.sha256(json.dumps(labels).encode()).hexdigest()
        assert value == draft['reviewLabelsSHA256'], 'Draft changed; no write allowed'
        return value

    def tap(label):
        xy = submission_point(driver.wait(label), label, case['record'])
        driver.adb('shell', 'input', 'tap', *map(str, xy))

    def submit():
        bindings()
        attempts.authorize()
        driver.state['attempts'] = attempts.count; driver.save()
        tap('Submit Dispatch')
        # Persist the attempt before the only UI operation that can submit.
        save('submit-attempt-'+str(attempts.count), {'attempt':attempts.count, 'utcEpoch':time.time()})
        tap('Submit')

    try:
        backend('guard')
        audit = json.loads(soak.private(case['artifactAudit']).read_text())
        assert audit['status'] == 'PASS' and audit.get('sha256', audit.get('artifact', {}).get('sha256')) == c['apkSHA256']
        assert 'TestWarehouseFixture_API30' in driver.adb('emu', 'avd', 'name')
        assert driver.adb('shell', 'getprop', 'ro.build.version.sdk') == '30'
        assert driver.adb('shell', 'getenforce') == 'Enforcing'
        package = driver.adb('shell', 'pm', 'path', soak.PACKAGE)
        assert re.fullmatch(r'package:/data/app/[^\n]+', package)
        assert driver.adb('shell', 'sha256sum', package[8:]).split()[0] == c['apkSHA256']
        assert 'tcp:443 tcp:18643' in driver.adb('reverse', '--list')
        transport(18443); transport(18643)
        review_hash(); backend('pre-submit')
        backend('guard')
        touched_control = True
        state = control({'action':'arm', 'phase':case['phase'], 'path':'/rest/v1/rpc/create_dispatch_with_stock_check', 'record':case['record']})
        assert state['state'] == 'ARMED'
        submit()
        driver.wait('Error'); save('native-loss', {'nativeError':True})
        backend('after-loss'); backend('loss', verify=True)
        attempts.verified_loss()
        driver.state['phases'].append('INDEPENDENT_LOSS_RECONCILIATION_PASS'); driver.save()
        tap('OK'); review_hash()
        backend('guard')
        submit()
        driver.wait('Dispatch Created Successfully!')
        save('native-retry', {'nativeSuccess':True, 'unchangedForm':True})
        backend('after-retry'); backend('retry', verify=True)
        driver.state['phases'].append('SAME_KEY_ONE_COMMIT_NATIVE_RETRY_PASS')
        driver.state['status'] = 'PASS'
    except Exception:
        driver.state['status'] = 'FAIL'
        driver.state['reason'] = 'Stopped; preserve write state and evidence; no automatic replay'
        raise
    finally:
        if touched_control:
            try:
                save('control-before-cleanup', {'status':control({'action':'status'}), 'observations':control({'action':'observations'})})
                assert control({'action':'disarm'})['state'] == 'DISARMED'
                driver.state['faultDisarmed'] = True
            except Exception:
                driver.state['faultDisarmed'] = False; driver.state['status'] = 'FAIL'
        try:
            driver.adb('reverse', 'tcp:443', 'tcp:18443')
            driver.state['normalRouteRestored'] = True
        except Exception:
            driver.state['normalRouteRestored'] = False; driver.state['status'] = 'FAIL'
        driver.save(); os.close(fd)
    assert driver.state['status'] == 'PASS'
    print(json.dumps({'status':'PASS', 'scope':'one reserved native dispatch fault/retry case'}))


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 2
        main(sys.argv[1])
    except Exception as error:
        blocked = str(error).startswith('BLOCKED:')
        print(json.dumps({'status':'BLOCKED' if blocked else 'FAIL', 'category':'DISPATCH_CASE_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
