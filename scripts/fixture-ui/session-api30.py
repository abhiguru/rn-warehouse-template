#!/usr/bin/env python3
"""Post-soak native cold-restoration cases; no login, OTP or expiry manipulation.

Requires a prepared reserved fictional customer, one native session and Settings
visible. Usage: session-api30.py PRIVATE_CASE_CONFIG. No failed-case resume.
"""
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
import time
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('fixture_soak', Path(__file__).with_name('soak-api30.py'))
soak = importlib.util.module_from_spec(spec)
spec.loader.exec_module(soak)
os.umask(0o077)


class SessionCase(soak.Soak):
    def snapshot(self):
        self.health(True)
        cap = self.i['uiCapture']
        raw = self.adb('exec-out', 'env', 'CLASSPATH=/system/framework/uiautomator.jar:' + cap['remotePath'],
                       'app_process', '/system/bin', 'FixtureUiCapture')
        match = re.search(r'(<hierarchy\b.*?</hierarchy>)', raw, re.S)
        assert match, 'Bounded fixture snapshot unavailable'
        return ET.fromstring(match.group(1))  # Never save or print raw screens.

    def login_screen(self):
        tree = self.wait('Send OTP')
        labels = {v for n in tree.iter('node') for v in [n.get('text'), n.get('content-desc')]}
        assert 'Change warehouse server' in labels, 'Expected operator login screen missing'
        assert 'Choose your warehouse server' not in labels, 'Server selection was unexpectedly required'
        assert not labels.intersection({'Orders tab', 'Invoices tab', 'GRN tab', 'Stock tab',
                                        'View profile for Session Rehearsal Customer'}), 'Protected UI still visible'

    def cold_start(self):
        self.adb('shell', 'am', 'force-stop', soak.PACKAGE)
        self.adb('shell', 'monkey', '-p', soak.PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')


def main(path):
    case = json.loads(soak.private(path).read_text())
    c, inputs = soak.config(case['soakConfig'])
    assert case['backendCheckout'] == c['backendCheckout'] and case['backendState'] == c['backendState']
    helper = Path(__file__).parent.parent / 'fixture-session-backend.mjs'

    def backend(mode):
        command = shlex.join([c['node'], str(helper.resolve()), str(Path(path).resolve()), mode])
        result = subprocess.run(['/usr/bin/sg', 'docker', '-c', command], cwd=c['backendCheckout'],
                                capture_output=True, timeout=90,
                                env={**os.environ, 'PATH': str(Path(c['node']).parent) + ':' + os.environ['PATH']})
        # Only a fixed result envelope is allowed into driver output.
        if result.returncode:
            status = 'BLOCKED' if result.returncode == 2 else 'FAIL'
            raise RuntimeError(status + ': session prerequisite/action refused; inspect guarded phase ' + mode)
        parsed = json.loads(result.stdout)
        assert parsed == {'status': 'PASS', 'phase': mode} or parsed == {'status': 'PASS', 'phase': mode, 'case': case['case']}

    backend('guard')  # Before any ADB access, mkdir, session observation or action.
    lock_path = Path(case['soakConfig']).parent / 'fixture-session-actor.lock'
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    soak.private(lock_path)
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    evidence = Path(case['caseDirectory'])
    soak.private(evidence.parent, True)
    assert not evidence.exists(), 'Preserve failed attempts; no automatic retry'
    evidence.mkdir(mode=0o700)
    driver = SessionCase(c, inputs, 'unused', 0)
    driver.e, driver.file = evidence, evidence / 'result.json'
    driver.state.update(case=case['case'], scope='fictional customer session cold restoration', phases=[],
                        driverSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        backendHelperSHA256=hashlib.sha256(helper.read_bytes()).hexdigest(),
                        guardsSHA256=hashlib.sha256(helper.with_name('fixture-session-guards.mjs').read_bytes()).hexdigest(),
                        configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest())
    driver.save()
    try:
        audit = json.loads(soak.private(case['artifactAudit']).read_text())
        assert audit['status'] == 'PASS' and audit.get('sha256', audit.get('artifact', {}).get('sha256')) == c['apkSHA256']
        assert 'TestWarehouseFixture_API30' in driver.adb('emu', 'avd', 'name')
        assert driver.adb('shell', 'getprop', 'ro.build.version.sdk') == '30'
        assert driver.adb('shell', 'getenforce') == 'Enforcing'
        package = driver.adb('shell', 'pm', 'path', soak.PACKAGE)
        assert re.fullmatch(r'package:/data/app/[^\n]+', package)
        assert driver.adb('shell', 'sha256sum', package[8:]).split()[0] == c['apkSHA256']
        assert 'tcp:443 tcp:18443' in driver.adb('reverse', '--list')
        backend('inspect')
        driver.wait('View profile for Session Rehearsal Customer')
        driver.state['phases'].append('RESERVED_NATIVE_CUSTOMER_CONFIRMED')
        driver.save()
        if case['case'] == 'revoked':
            backend('revoke')
            driver.state['phases'].append('AUTHENTICATED_DISABLE_AND_REVOCATION_CONFIRMED')
        else:
            backend('verify')
            driver.state['phases'].append('NATURALLY_EXPIRED_REFRESH_SESSION_CONFIRMED')
        driver.save()
        driver.cold_start()
        driver.login_screen()
        driver.state['phases'].append('LOGIN_REQUIRED_NO_SERVER_RESELECTION')
        driver.save()
        driver.adb('shell', 'input', 'keyevent', '3')
        time.sleep(2)
        driver.adb('shell', 'monkey', '-p', soak.PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
        driver.login_screen()
        driver.cold_start()
        driver.login_screen()
        backend('verify')
        driver.state['phases'].append('COLD_AND_FOREGROUND_LOGIN_PERSISTENCE_INVARIANTS_PASS')
        driver.state['status'] = 'PASS'
    except Exception as error:
        driver.state['status'] = 'BLOCKED' if str(error).startswith('BLOCKED:') else 'FAIL'
        driver.state['reason'] = 'Session case stopped; preserve phase evidence; no automatic replay'
        raise
    finally:
        driver.save()
        os.close(lock_fd)
    print(json.dumps({'status': 'PASS', 'case': case['case'], 'scope': 'owned emulator cold-restoration only'}))


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 2, 'One private case config is required'
        main(sys.argv[1])
    except Exception as error:
        blocked = str(error).startswith('BLOCKED:')
        print(json.dumps({'status': 'BLOCKED' if blocked else 'FAIL',
                          'category': 'SESSION_CASE_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
