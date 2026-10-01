#!/usr/bin/env python3
"""Prepare one fictional dispatch draft; deliberately has no submit operation.

Private config extends OPERATOR_WRITE_RETRY_CASES with soakConfig, artifactAudit,
sourceQuantity and sourcePackageMark. Leaves review open for a separately guarded
case runner. No automatic resume or selector fallback.
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time
from dispatch_draft_controls import point, draft_labels, grn_search_controls, selected_lot_labels

spec = importlib.util.spec_from_file_location('fixture_soak', Path(__file__).with_name('soak-api30.py'))
soak = importlib.util.module_from_spec(spec)
spec.loader.exec_module(soak)
os.umask(0o077)


class Draft(soak.Soak):
    def tap(self, label, button=False):
        self.state['lastAction'] = {'operation':'tap', 'control':label}; self.save()
        xy = point(self.wait(label), label, button=button)
        self.adb('shell', 'input', 'tap', *map(str, xy))

    def fill(self, label, value):
        self.state['lastAction'] = {'operation':'fill', 'control':label}; self.save()
        assert re.fullmatch(r'[A-Za-z0-9 ]{1,60}', value), 'Fictional input required'
        t = self.wait(label)
        xy = point(t, label, editable=True)
        self.adb('shell', 'input', 'tap', *map(str, xy))
        t = self.snapshot()
        nodes = [n for n in t.iter('node') if n.get('class') == 'android.widget.EditText' and n.get('focused') == 'true']
        assert len(nodes) == 1 and label in [nodes[0].get('text'), nodes[0].get('content-desc')], 'Exact focused field required'
        old = nodes[0].get('text', '')
        assert len(old) <= 60
        self.adb('shell', 'input', 'keyevent', '123')
        for _ in old: self.adb('shell', 'input', 'keyevent', '67')
        self.adb('shell', 'input', 'text', value.replace(' ', '%s'))
        t = self.snapshot()
        assert any(n.get('text') == value and n.get('focused') == 'true' for n in t.iter('node')), 'Input verification failed'
        # Dismiss only an actually visible IME; BACK must never discard the form.
        ime = self.adb('shell', 'dumpsys', 'input_method')
        if 'mInputShown=true' in ime: self.adb('shell', 'input', 'keyevent', '4')


def main(path):
    case = json.loads(soak.private(path).read_text())
    c, inputs = soak.config(case['soakConfig'])
    assert case['backendCheckout'] == c['backendCheckout'] and case['backendState'] == c['backendState']
    assert case['artifactSHA256'] == c['apkSHA256']
    assert isinstance(case['sourceQuantity'], int) and case['sourceQuantity'] > case['quantity']
    assert re.fullmatch(r'[A-Za-z0-9 -]{0,30}', case['sourcePackageMark'])
    driver = Draft(c, inputs, 'unused', 0)
    helper = str(Path(__file__).parent.parent / 'fixture-dispatch-observe.mjs')

    def backend(phase):
        r = driver.backend_process(helper, [str(Path(path).resolve()), phase])
        if r.returncode:
            raise RuntimeError(('BLOCKED:' if r.returncode == 2 else 'FAIL:') + ' guarded dispatch phase refused')
        assert json.loads(r.stdout)['scope'] == 'readonly-observation-only'

    backend('guard')  # No ADB, route, lock, mkdir or SQL before release.
    lock = Path(case['soakConfig']).parent / 'fixture-session-actor.lock'
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    soak.private(lock)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    evidence = Path(case['caseDirectory']); soak.private(evidence.parent, True)
    assert not evidence.exists(), 'Keep every attempt; no resume'
    evidence.mkdir(mode=0o700)
    driver.e, driver.file = evidence, evidence / 'draft-result.json'
    driver.state.update(scope='fictional non-submitting draft only', phases=[],
                        driverSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        configSHA256=hashlib.sha256(Path(path).read_bytes()).hexdigest())
    driver.save()
    route_changed = False
    try:
        backend('guard')
        audit = json.loads(soak.private(case['artifactAudit']).read_text())
        assert audit['status'] == 'PASS' and audit.get('sha256', audit.get('artifact', {}).get('sha256')) == c['apkSHA256']
        assert 'TestWarehouseFixture_API30' in driver.adb('emu', 'avd', 'name')
        assert driver.adb('shell', 'getprop', 'ro.build.version.sdk') == '30'
        assert driver.adb('shell', 'getenforce') == 'Enforcing'
        installed = driver.adb('shell', 'pm', 'path', soak.PACKAGE)
        assert re.fullmatch(r'package:/data/app/[^\n]+', installed)
        assert driver.adb('shell', 'sha256sum', installed[8:]).split()[0] == c['apkSHA256']
        assert 'tcp:443 tcp:18443' in driver.adb('reverse', '--list')
        driver.wait('Orders tab')  # Authenticated home required; never dismiss another draft.
        backend('baseline')
        driver.adb('shell', 'am', 'force-stop', soak.PACKAGE)
        driver.adb('reverse', 'tcp:443', 'tcp:18643'); route_changed = True
        driver.adb('shell', 'monkey', '-p', soak.PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
        driver.tap('Dispatch tab'); driver.tap('Create Dispatch')
        driver.fill('Dispatch number', case['record'])
        driver.tap('Select customer...'); driver.fill('Search customers...', 'Backend Test Customer A')
        driver.tap('Backend Test Customer A', button=True)
        driver.fill('Vehicle registration', 'TEST FIXTURE')
        # useDispatchForm populates the authenticated supervisor asynchronously.
        # Wait for that bound administrator instead of chasing a placeholder.
        driver.state['lastAction'] = {'operation':'wait', 'control':'Core Demo Administrator'}; driver.save()
        driver.wait('Core Demo Administrator')
        driver.tap('Go to Items step')
        driver.tap('Select GR No')
        prefix, digits = grn_search_controls(case['sourceReceipt'])
        driver.tap(prefix)
        for label in digits: driver.tap(label)
        driver.tap(case['sourceReceipt'])
        lot_label = f"Qty: {case['sourceQuantity']} · Stock: {case['sourceQuantity']}"
        selected_lot_labels(driver.wait(lot_label), case['sourceQuantity'])
        driver.fill('Dispatch quantity', str(case['quantity']))
        driver.tap('Save dispatch item')
        driver.wait('Adding Item 2')
        driver.tap('Go to Review step')
        labels = draft_labels(driver.wait('Submit Dispatch'), case['record'], case['sourceReceipt'], case['sourceQuantity'])
        backend('after-draft')  # Read-only proof that preparation did not commit.
        driver.state.update(status='PASS', reviewLabelsSHA256=hashlib.sha256(json.dumps(labels).encode()).hexdigest(),
                            routeHeldForGuardedCase=True, businessWriteAttempted=False)
        driver.state['phases'].append('BOUND_REVIEW_PREPARED_NO_BUSINESS_CHANGE')
    except Exception:
        driver.state['status'] = 'FAIL'
        driver.state['reason'] = 'Draft preparation stopped; preserve evidence; no automatic resume'
        if route_changed:
            driver.adb('reverse', 'tcp:443', 'tcp:18443')
            driver.state['normalRouteRestored'] = True
        raise
    finally:
        driver.save(); os.close(fd)
    print(json.dumps({'status': 'PASS', 'scope': 'non-submitting draft preparation only'}))


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 2
        main(sys.argv[1])
    except Exception as error:
        blocked = str(error).startswith('BLOCKED:')
        print(json.dumps({'status': 'BLOCKED' if blocked else 'FAIL', 'category': 'DRAFT_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
