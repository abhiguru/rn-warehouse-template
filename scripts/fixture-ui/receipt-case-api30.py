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
from receipt_draft_controls import review_labels as draft_labels
from receipt_case_controls import Attempts, submission_point, owned_reverse_route
from dispatch_case_cleanup import cleanup_case

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
        helper = scripts / ('fixture-receipt-verify.mjs' if verify else 'fixture-receipt-observe.mjs')
        r = driver.backend_process(str(helper.resolve()), [str(Path(path).resolve()), phase])
        if r.returncode: raise RuntimeError(('BLOCKED:' if r.returncode == 2 else 'FAIL:') + ' guarded phase refused')
        assert json.loads(r.stdout)['status'] == 'PASS'

    backend('guard')  # Before ADB, locks, socket/SQL, markers or routes.
    required = ['fixture-receipt-observe.mjs', 'fixture-receipt-snapshot.mjs',
                'fixture-receipt-verify.mjs', 'fixture-write-reconciliation.mjs',
                'fixture-session-guards.mjs', 'fixture-ui/receipt-case-api30.py',
                'fixture-ui/receipt_case_controls.py', 'fixture-ui/dispatch_case_controls.py', 'fixture-ui/dispatch_case_cleanup.py',
                'fixture-ui/receipt-draft-api30.py',
                'fixture-ui/receipt_draft_controls.py', 'fixture-ui/dispatch_draft_controls.py', 'fixture-ui/soak-api30.py',
                'fixture-ui/fixture_observation.py', 'fixture-ui/auth-api30.py']
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
    assert draft['driverSHA256'] == digest(Path(__file__).with_name('receipt-draft-api30.py'))
    assert 0 <= time.time() - (evidence / 'draft-result.json').stat().st_mtime < 900, 'Fresh draft required'
    # An interrupted invocation cannot be resumed, even if it failed before Submit.
    with (evidence / 'case-started.json').open('x') as f:
        json.dump({'driverSHA256': digest(__file__), 'configSHA256': digest(path), 'utcEpoch': time.time()}, f)
    driver.e, driver.file = evidence, evidence / 'case-result.json'
    driver.state.update(scope='reserved image-free receipt fault case', phases=[], attempts=0)
    driver.save()
    attempts = Attempts(); touched_control = False; route_verified = False

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
        labels = draft_labels(driver.wait('Create GRN'), case['record'], case['quantity'], case['weight'])
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
        tap('Create GRN')
        # Persist the attempt before the only UI operation that can submit.
        save('submit-attempt-'+str(attempts.count), {'attempt':attempts.count, 'utcEpoch':time.time()})
        tap('Create')

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
        owned_reverse_route(driver.adb('reverse', '--list'), 18643)
        route_verified = True
        transport(18443); transport(18643)
        review_hash(); backend('pre-submit')
        backend('guard')
        touched_control = True
        state = control({'action':'arm', 'phase':case['phase'], 'path':'/rest/v1/rpc/save_grn', 'record':case['record']})
        assert state['state'] == 'ARMED'
        submit()
        driver.wait('Error'); save('native-loss', {'nativeError':True})
        backend('after-loss'); backend('loss', verify=True)
        attempts.verified_loss()
        driver.state['phases'].append('INDEPENDENT_LOSS_RECONCILIATION_PASS'); driver.save()
        tap('OK'); review_hash()
        backend('guard')
        submit()
        driver.wait('GRN Created Successfully!')
        save('native-retry', {'nativeSuccess':True, 'unchangedForm':True})
        backend('after-retry'); backend('retry', verify=True)
        driver.state['phases'].append('SAME_KEY_ONE_COMMIT_NATIVE_RETRY_PASS')
        driver.state['status'] = 'PASS'
    except Exception:
        driver.state['status'] = 'FAIL'
        driver.state['reason'] = 'Stopped; preserve write state and evidence; no automatic replay'
        raise
    finally:
        cleanup = cleanup_case(route_verified, touched_control, case['record'], case['phase'], control, driver.adb, save, path="/rest/v1/rpc/save_grn")
        if cleanup.pop('status') != 'PASS': driver.state['status'] = 'FAIL'
        driver.state.update(cleanup)
        driver.save(); os.close(fd)
    assert driver.state['status'] == 'PASS'
    print(json.dumps({'status':'PASS', 'scope':'one reserved native receipt fault/retry case'}))


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 2
        main(sys.argv[1])
    except Exception as error:
        blocked = str(error).startswith('BLOCKED:')
        print(json.dumps({'status':'BLOCKED' if blocked else 'FAIL', 'category':'RECEIPT_CASE_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
