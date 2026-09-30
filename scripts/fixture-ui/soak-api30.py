#!/usr/bin/env python3
"""Bounded native read soak for an explicitly owned API30 fictional emulator.

A private plan/config is executable input; this helper is not a sandbox. It never
logs in, requests OTPs, modifies business records, resets ADB or dismisses ANRs.
Usage: soak-api30.py PRIVATE_CONFIG run|verify STEP_ID SECONDS
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = 'in.gurucold.warehouse.fixture'
os.umask(0o077)
os.environ['ADB_LIBUSB'] = '1'


def private(path, directory=False):
    path = Path(path)
    st = path.lstat()
    assert not path.is_symlink() and st.st_uid == os.getuid() and st.st_mode & 0o077 == 0
    assert path.is_absolute() and (path.is_dir() if directory else path.is_file())
    return path


def config(path):
    path = private(path)
    private(path.parent, True)
    c = json.loads(path.read_text())
    assert c['scope'] == 'isolated-fictional-fixture'
    i = json.loads(private(c['emulatorInputs']).read_text())
    assert i['createdOnlyForUnattendedFixtures'] and re.fullmatch(r'emulator-\d+', i['serial'])
    assert i['artifact']['package'] == PACKAGE and i['artifact']['versionCode'] == c['versionCode']
    assert i['artifact']['sha256'] == c['apkSHA256']
    assert hashlib.sha256(Path(i['artifact']['path']).read_bytes()).hexdigest() == c['apkSHA256']
    cap = i['uiCapture']
    assert cap['api'] == 30 and cap['viewport'] == [720, 1280]
    assert hashlib.sha256(Path(cap['jar']).read_bytes()).hexdigest() == cap['sha256']
    private(c['results'], True)
    for key in ['adb', 'node', 'databaseHelper', 'httpObserver', 'backendCheckout', 'backendState']:
        assert Path(c[key]).is_absolute()
    return c, i


class Soak:
    def __init__(self, c, i, step, seconds):
        self.c, self.i, self.step, self.seconds = c, i, step, seconds
        self.e = Path(c['results']) / step
        self.file = self.e / 'result.json'
        self.state = {'status': 'RUNNING', 'artifact': i['artifact'], 'durationSeconds': seconds,
                      'cycles': [], 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      'helperSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

    def adb(self, *args):
        r = subprocess.run([self.c['adb'], '-s', self.i['serial'], *args],
                           capture_output=True, timeout=25)
        assert r.returncode == 0, 'Owned emulator command failed; private inputs suppressed'
        return r.stdout.decode(errors='replace').strip()

    def health(self, foreground=False):
        w = self.adb('shell', 'dumpsys', 'window')
        assert 'Application Not Responding' not in w, 'ANR detected; no dismissal attempted'
        assert not re.search(r'\bam_anr\b|\bam_crash\b', self.adb('logcat', '-b', 'events', '-d'))
        assert not re.search(r'FATAL EXCEPTION|Fatal signal', self.adb('logcat', '-b', 'crash', '-d'))
        if foreground:
            f = [s for s in w.splitlines() if 'mCurrentFocus=' in s]
            assert f and PACKAGE in f[-1], 'Actual fixture foreground required'

    def snapshot(self):
        self.health(True)
        cap = self.i['uiCapture']
        raw = self.adb('exec-out', 'env',
                       'CLASSPATH=/system/framework/uiautomator.jar:' + cap['remotePath'],
                       'app_process', '/system/bin', 'FixtureUiCapture')
        match = re.search(r'(<hierarchy\b.*?</hierarchy>)', raw, re.S)
        assert match, 'Bounded fixture snapshot unavailable'
        t = ET.fromstring(match.group(1))
        # Never store/print raw screens. Authentication appearing is a failed gate.
        assert not any(n.get('text') in ['Send OTP', 'Verify Your Phone', 'Configuration Error']
                       for n in t.iter('node')), 'Authenticated warehouse lost'
        return t

    def wait(self, label):
        end = time.monotonic() + 60
        while time.monotonic() < end:
            self.health()
            try:
                t = self.snapshot()
                if any(label in [n.get('text'), n.get('content-desc')] for n in t.iter('node')):
                    return t
            except AssertionError as error:
                if str(error) not in ['Actual fixture foreground required', 'Bounded fixture snapshot unavailable']:
                    raise
            time.sleep(1)
        raise AssertionError('Expected fictional screen/control timed out')

    def tap(self, label):
        t = self.wait(label)
        ns = [n for n in t.iter('node') if label in [n.get('text'), n.get('content-desc')]
              and n.get('class') != 'android.widget.EditText']
        assert ns
        n = next((n for n in ns if n.get('clickable') == 'true' and n.get('enabled') == 'true'), ns[0])
        x, y, xx, yy = map(int, re.findall(r'\d+', n.get('bounds')))
        assert 0 <= x < xx <= 720 and 0 <= y < yy <= 1280, 'Invalid inspected control bounds'
        self.adb('shell', 'input', 'tap', str((x + xx) // 2), str((y + yy) // 2))

    def backend(self, helper, args):
        # Exact plan bindings and strict backend fixture guard are required too.
        # Filenames are not shell-quoted ad hoc: quote every private path/argument.
        import shlex
        command = ' '.join(shlex.quote(x) for x in [self.c['node'], helper, *args])
        env = {**os.environ, 'WAREHOUSE_STATE_DIR': self.c['backendState'],
               'WAREHOUSE_FIXTURE_CHECKOUT': self.c['backendCheckout'],
               'PATH': str(Path(self.c['node']).parent) + ':' + os.environ['PATH']}
        r = subprocess.run(['/usr/bin/sg', 'docker', '-c', command], cwd=self.c['backendCheckout'],
                           env=env, capture_output=True, timeout=45)
        assert r.returncode == 0, 'Guarded read-only backend observation failed; output suppressed'
        return r.stdout.decode()

    def save(self):
        tmp = self.file.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.state, indent=2) + '\n')
        tmp.replace(self.file)

    def run(self):
        assert not self.e.exists(), 'Preserve existing attempts; do not automatically rerun'
        self.e.mkdir(mode=0o700)
        self.save()
        start = time.monotonic()
        try:
            assert 'TestWarehouseFixture_API30' in self.adb('emu', 'avd', 'name')
            assert self.adb('shell', 'getprop', 'ro.build.version.sdk') == '30'
            assert self.adb('shell', 'getenforce') == 'Enforcing'
            assert 'versionCode=' + str(self.c['versionCode']) in self.adb('shell', 'dumpsys', 'package', PACKAGE)
            remote = self.adb('shell', 'pm', 'path', PACKAGE)
            assert re.fullmatch(r'package:/data/app/[^\n]+', remote)
            assert self.adb('shell', 'sha256sum', remote[8:]).split()[0] == self.c['apkSHA256']
            assert 'tcp:443 tcp:18443' in self.adb('reverse', '--list')
            self.health()
            self.adb('shell', 'am', 'force-stop', PACKAGE)
            self.adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
            self.wait('Orders tab')
            self.state['coldLaunch'] = 'PASS'
            self.backend(self.c['databaseHelper'], ['session', str(self.e / 'session-before.json')])
            began = time.monotonic()
            while time.monotonic() - began < self.seconds:
                cycle = time.monotonic()
                self.tap('Orders tab')
                since = datetime.datetime.now(datetime.timezone.utc).isoformat()
                self.tap('Refresh orders')
                self.wait(self.c['orderLabel'])
                # Observe a real current RPC200; cached UI alone cannot pass.
                network = None
                deadline = time.monotonic() + 15
                polls = 0
                while time.monotonic() < deadline:
                    polls += 1
                    try:
                        network = json.loads(self.backend(self.c['httpObserver'], [since]))
                        break
                    except AssertionError:
                        time.sleep(1)
                assert network is not None, 'Actual Orders RPC200 not observed within deadline'
                network['observationPolls'] = polls
                self.tap('Invoices tab')
                t = self.wait(self.c['invoiceLabel'])
                labels = '\n'.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in t.iter('node'))
                assert '₹173' in labels and '₹9' in labels
                self.adb('shell', 'input', 'keyevent', '3')
                time.sleep(2)
                self.health()
                self.adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
                self.wait('Invoices tab')
                self.wait(self.c['invoiceLabel'])
                self.backend(self.c['databaseHelper'], ['verify', self.c['businessBaseline']])
                self.state['cycles'].append({'status': 'PASS', 'elapsedSeconds': round(time.monotonic() - began, 3),
                                             'network': network, 'backgroundForeground': True})
                self.save()
                while time.monotonic() - cycle < 60 and time.monotonic() - began < self.seconds:
                    time.sleep(min(5, max(0.01, self.seconds - (time.monotonic() - began))))
                    self.health()
            self.state['soakSeconds'] = time.monotonic() - began
            self.backend(self.c['databaseHelper'], ['session', str(self.e / 'session-after.json')])
            self.state['status'] = 'PASS'
        except Exception as error:
            self.state['status'] = 'FAIL'
            self.state['reason'] = str(error)
            raise
        finally:
            self.state['elapsedSeconds'] = time.monotonic() - start
            self.save()

    def verify(self):
        r = json.loads(private(self.file).read_text())
        assert r['status'] == 'PASS' and r['durationSeconds'] == self.seconds
        assert r['artifact']['sha256'] == self.c['apkSHA256'] and r['soakSeconds'] >= self.seconds
        assert r['helperSHA256'] == hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        assert len(r['cycles']) >= max(1, self.seconds // 120)
        assert all(x['status'] == 'PASS' and x['network']['successfulOrdersRequests'] >= 1 for x in r['cycles'])
        before = json.loads(private(self.e / 'session-before.json').read_text())
        after = json.loads(private(self.e / 'session-after.json').read_text())
        assert before['verifiedCount'] == after['verifiedCount'], 'Unexpected new administrator OTP verification'
        assert {s['id'] for s in before['sessions']} == {s['id'] for s in after['sessions']}, 'Native session replaced/revoked'
        native = self.c['nativeSessionId']
        assert any(s['id'] == native for s in after['sessions'])
        self.backend(self.c['databaseHelper'], ['verify', self.c['businessBaseline']])
        print(self.step + ': PASS bounded native/network/business/session postconditions')


def main():
    assert len(sys.argv) == 5, 'Usage: PRIVATE_CONFIG run|verify STEP_ID SECONDS'
    c, i = config(sys.argv[1])
    mode, step, text = sys.argv[2:]
    assert mode in ['run', 'verify'] and re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', step)
    seconds = int(text)
    assert 1 <= seconds <= 3300
    soak = Soak(c, i, step, seconds)
    getattr(soak, mode)()


if __name__ == '__main__':
    main()
