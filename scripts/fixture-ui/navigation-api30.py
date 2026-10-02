#!/usr/bin/env python3
"""Bounded post-soak native read/offline and server-selection cases.

No OTP, login, seeding, business submit, automatic resume or service restart.
confirm-switch deliberately logs out the bound fictional administrator once.
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
import socket
import ssl
import sqlite3
import stat
import subprocess
import sys
import time
import traceback
from selection_start_controls import selection_start
import xml.etree.ElementTree as ET
from dispatch_case_controls import owned_reverse_route
from fixture_observation import decode_observation
from navigation_controls import point, settings, disconnect, reconnect, malformed_origins, allowed_origin
from emulator_offline_network import original_airplane,airplane,disconnected,reject_fixture_loopback,restore_fixture_loopback

spec = importlib.util.spec_from_file_location('fixture_soak', Path(__file__).with_name('soak-api30.py'))
soak = importlib.util.module_from_spec(spec); spec.loader.exec_module(soak)
os.umask(0o077)


def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Navigation(soak.Soak):
    def wait(self, label):
        self.state['lastWait'] = label; self.save()
        return super().wait(label)

    def snapshot(self):
        self.health(True)
        cap = self.i['uiCapture']
        raw = self.adb('exec-out', 'env', 'CLASSPATH=/system/framework/uiautomator.jar:' + cap['remotePath'],
                       'app_process', '/system/bin', 'FixtureUiCapture')
        match = re.search(r'(<hierarchy\b.*?</hierarchy>)', raw, re.S)
        assert match, 'Bounded hierarchy required'
        return ET.fromstring(match.group(1))

    def tap(self, label):
        self.adb('shell', 'input', 'tap', *map(str, point(self.wait(label), label)))

    def cold(self):
        self.adb('shell', 'am', 'force-stop', soak.PACKAGE)
        self.adb('shell', 'monkey', '-p', soak.PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')

    def selected_server(self, evidence, expected_origin, expected_id):
        # Read only this owned fixture app. Do not enable root or make a private
        # key/session query; retain the bounded DB/WAL copy outside Git.
        assert self.adb('shell', 'id', '-u') == '0', 'Existing root-readable fictional emulator required'
        directory = evidence / 'selected-server-copy'; directory.mkdir(mode=0o700)
        base = '/data/user/0/' + soak.PACKAGE + '/databases/RKStorage'
        for suffix in ['', '-wal', '-shm']:
            result = subprocess.run([self.c['adb'], '-s', self.i['serial'], 'exec-out', 'cat', base+suffix],
                                    capture_output=True, timeout=20)
            if suffix and result.returncode: continue
            assert result.returncode == 0 and len(result.stdout) <= 2*1024*1024, 'Bounded fixture persistence copy required'
            (directory/('RKStorage'+suffix)).write_bytes(result.stdout)
        with sqlite3.connect('file:'+str(directory/'RKStorage')+'?mode=ro', uri=True) as db:
            rows = db.execute("SELECT value FROM catalystLocalStorage WHERE key='operator_server_v1'").fetchall()
        assert len(rows) == 1
        saved = json.loads(rows[0][0])
        assert saved['origin'] == expected_origin and saved['instanceId'] == expected_id, 'Selected instance not persisted'
        self.state['publicSelectionMatches']=True

    def fill_origin(self, value):
        allowed_origin(value)
        self.adb('shell', 'input', 'tap', *map(str, point(self.wait('Server origin'), 'Server origin', True)))
        fields = [n for n in self.snapshot().iter('node') if n.get('class') == 'android.widget.EditText' and n.get('focused') == 'true']
        assert len(fields) == 1 and fields[0].get('content-desc') == 'Server origin'
        old = fields[0].get('text', ''); assert len(old) <= 128
        self.adb('shell', 'input', 'keyevent', '123')
        for _ in old: self.adb('shell', 'input', 'keyevent', '67')
        self.adb('shell', 'input', 'text', value)
        assert any(n.get('text') == value and n.get('focused') == 'true' for n in self.snapshot().iter('node'))
        if 'mInputShown=true' in self.adb('shell', 'dumpsys', 'input_method'):
            self.adb('shell', 'input', 'keyevent', '4')


def labels(tree):
    return {v for n in tree.iter('node') for v in [n.get('text'), n.get('content-desc')] if v}


def main(path):
    case = json.loads(soak.private(path).read_text())
    scripts = Path(__file__).parent.parent
    # This command's release check runs before metadata, ADB, locks or evidence.
    import shlex
    ui = json.loads(soak.private(case['soakConfig']).read_text())
    def guard_command(phase):
        command = shlex.join([ui['node'], str(scripts / 'fixture-navigation-observe.mjs'), str(Path(path).resolve()), phase])
        result = subprocess.run(['/usr/bin/sg', 'docker', '-c', command], capture_output=True, timeout=45,
                                env={**os.environ, 'PATH':str(Path(ui['node']).parent)+':'+os.environ['PATH']})
        if result.returncode: raise RuntimeError(('BLOCKED:' if result.returncode == 2 else 'FAIL:')+' navigation phase refused')
        assert json.loads(result.stdout) == {'status':'PASS', 'phase':phase, 'scope':'readonly-navigation-observation'}
    guard_command('guard')
    c, inputs = soak.config(case['soakConfig'])
    returning = case['case'] == 'switch-back'
    assert case['backendCheckout'] == c['secondaryBackendCheckout' if returning else 'backendCheckout'] and case['backendState'] == c['secondaryBackendState' if returning else 'backendState']
    assert case['artifactSHA256'] == c['apkSHA256']
    names = ['fixture-navigation-observe.mjs', 'fixture-navigation-guards.mjs', 'fixture-session-guards.mjs',
             'fixture-ui/navigation-api30.py', 'fixture-ui/navigation_controls.py', 'fixture-ui/dispatch_case_controls.py',
             'fixture-ui/soak-api30.py', 'fixture-ui/fixture_observation.py', 'fixture-ui/emulator_offline_network.py', 'fixture-ui/selection_start_controls.py']
    assert set(case['toolingSHA256']) == set(names)
    assert all(digest(scripts / n) == case['toolingSHA256'][n] for n in names)
    for name in ['databaseHelper', 'httpObserver']:
        assert digest(c[name]) == case[name+'SHA256'], 'Backend observer changed'
    lock = Path(case['soakConfig']).parent / 'fixture-session-actor.lock'
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    soak.private(lock); fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    evidence = Path(case['caseDirectory']); soak.private(evidence.parent, True)
    assert not evidence.exists(), 'Preserve attempts; no resume'
    evidence.mkdir(mode=0o700)
    driver = Navigation(c, inputs, 'unused', 0)
    driver.e, driver.file = evidence, evidence / 'navigation-result.json'
    driver.state.update(case=case['case'], phases=[], configSHA256=digest(path), driverSHA256=digest(__file__))
    driver.save()
    radios = None; network_touched = False; network_restored = False
    plane_attempted=False;plane_restored=False;rule_attempted=False;rule_restored=False;uid=None;marker=None

    def transport(origin, port, ca, instance):
        host = origin.removeprefix('https://')
        context = ssl.create_default_context(cafile=ca)
        conn = http.client.HTTPSConnection(host, port, timeout=10, context=context)
        try:
            conn.sock = context.wrap_socket(socket.create_connection(('127.0.0.1', port), timeout=10), server_hostname=host)
            conn.request('GET', '/functions/v1/get-public-config', headers={'Host':host})
            response = conn.getresponse(); raw = response.read(65537)
            assert response.status == 200 and len(raw) <= 65536
            data = json.loads(raw)['data']; assert data['instanceId'] == instance and data['canonicalOrigin'] == origin
            return data['displayName']
        finally: conn.close()

    def disarmed_relay():
        path = Path(c['faultSocket']); st = path.lstat()
        assert path.resolve() == path and stat.S_ISSOCK(st.st_mode) and st.st_uid == os.getuid() and st.st_mode & 0o077 == 0
        soak.private(path.parent, True)
        for action in ['status', 'observations']:
            with socket.socket(socket.AF_UNIX) as sock:
                sock.settimeout(5); sock.connect(str(path)); sock.sendall((json.dumps({'action':action})+'\n').encode())
                buffer = bytearray()
                while True:
                    part = sock.recv(2048)
                    if not part: break
                    buffer.extend(part); assert len(buffer) <= 8192
            value = json.loads(buffer)
            if action == 'status': assert value['state'] == 'DISARMED', 'Fault case still owns transport'
            else: assert value == {'observations':[], 'overflow':False}, 'Preserve previous write observations'

    def fresh_orders():
        since = datetime.datetime.now(datetime.timezone.utc).isoformat()
        driver.tap('Refresh orders'); driver.wait(c['orderLabel'])
        deadline = time.monotonic()+20
        while time.monotonic() < deadline:
            result = driver.backend_process(c['httpObserver'], [since], timeout=20)
            observation = decode_observation(result.returncode, result.stdout.decode(errors='replace'))
            if observation['status'] == 'PASS': return
            assert observation['status'] == 'WAIT', 'Read observer failed'
            time.sleep(1)
        raise AssertionError('No actual fresh Orders200 observed')

    try:
        audit = json.loads(soak.private(case['artifactAudit']).read_text())
        assert audit['status'] == 'PASS' and audit.get('sha256', audit.get('artifact',{}).get('sha256')) == c['apkSHA256']
        assert driver.adb('emu','avd','name').splitlines()[0] == 'TestWarehouseFixture_API30'
        assert driver.adb('shell','getprop','ro.build.version.sdk') == '30'
        assert driver.adb('shell','getenforce') == 'Enforcing'
        package = driver.adb('shell','pm','path',soak.PACKAGE); assert re.fullmatch(r'package:/data/app/[^\n]+',package)
        assert driver.adb('shell','sha256sum',package[8:]).split()[0] == c['apkSHA256']
        owned_reverse_route(driver.adb('reverse','--list'),18443)
        primary_id = json.loads((soak.private(c['backendState'],True)/'public/instance.json').read_text())['instanceId']
        primary_name = transport('https://backend-core.example.test',18443,c['primaryCA'],primary_id)
        disarmed_relay()
        driver.health(True); guard_command('before')
        if case['case'] == 'offline-orders':
            driver.wait('Orders tab'); fresh_orders()
            radios = settings(driver.adb)
            original_plane=original_airplane(driver.adb)
            match=re.fullmatch(r'package:in\.gurucold\.warehouse\.fixture uid:(\d+)',driver.adb('shell','pm','list','packages','-U',soak.PACKAGE));assert match
            uid=int(match.group(1));attempt=evidence.name[-2:];assert attempt in ['02','03'];marker='whvm-offline-0106-'+attempt
            driver.state.update(originalAirplane=original_plane,offlineFixtureUID=uid,ownedLoopbackRule=marker);driver.save()
            with (evidence/'network-before.json').open('x') as f: json.dump(radios,f)
            network_touched = True; disconnect(driver.adb,radios,18443)
            plane_attempted=True;driver.state['airplaneChangeAttempted']=True;driver.save();airplane(driver.adb,'0','1')
            rule_attempted=True;driver.state['loopbackRuleAttempted']=True;driver.save();reject_fixture_loopback(driver.adb,uid,marker)
            connectivity = disconnected(driver.adb)
            assert len(connectivity) <= 65536, 'Bounded Android network observation required'
            with (evidence/'connectivity-after-disconnect.txt').open('x') as f: f.write(connectivity)
            driver.state['androidDefaultNetwork'] = next((x.strip() for x in connectivity.splitlines() if x.startswith('Active default network:')), 'UNKNOWN'); driver.save()
            driver.wait('No internet connection')
            since = datetime.datetime.now(datetime.timezone.utc).isoformat()
            driver.tap('Refresh orders')
            driver.wait('Showing previously loaded orders. Refresh to get current data.')
            time.sleep(5)
            result = driver.backend_process(c['httpObserver'],[since],timeout=20)
            observation = decode_observation(result.returncode,result.stdout.decode(errors='replace'))
            assert observation['status'] == 'WAIT' and observation.get('successfulOrdersRequests',0) == 0, 'Outage not established'
            driver.state['phases'].append('OFFLINE_STALE_WARNING_NO_CURRENT_REQUEST')
            restore_fixture_loopback(driver.adb,uid,marker);rule_restored=True
            airplane(driver.adb,'1','0');plane_restored=True
            reconnect(driver.adb,radios,18443); network_restored = True
            deadline = time.monotonic()+30
            while 'No internet connection' in labels(driver.snapshot()):
                assert time.monotonic()<deadline; time.sleep(1)
            fresh_orders(); driver.state['phases'].append('RECONNECT_CURRENT_ORDERS200')
        elif case['case'] == 'malformed-server':
            if selection_start(driver.snapshot(),case['profileName'])=='orders':
                driver.cold();driver.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://settings','-p',soak.PACKAGE)
            driver.wait('View profile for '+case['profileName'])
            for _ in range(7):
                if 'Change Warehouse Server' in labels(driver.snapshot()): break
                driver.adb('shell','input','swipe','360','1050','360','450','400')
            driver.tap('Change Warehouse Server')
            for origin,message in malformed_origins():
                driver.fill_origin(origin);driver.tap('Check server')
                driver.wait('Server Unavailable');driver.wait(message)
                assert 'Use this server' not in labels(driver.snapshot()), 'Invalid discovery candidate appeared'
                driver.tap('OK')
                driver.state['phases'].append('MALFORMED_ORIGIN_REFUSED:'+origin);driver.save()
            driver.cold();driver.wait('Orders tab');fresh_orders()
            driver.selected_server(evidence,'https://backend-core.example.test',case['instanceId'])
            driver.state['phases'].append('SELECTION_SESSION_PRESERVED_COLD_READ')
        else:
            if selection_start(driver.snapshot(),case['profileName'])=='orders':
                driver.cold();driver.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','warehouse-fixture://settings','-p',soak.PACKAGE)
            driver.wait('View profile for '+case['profileName'])
            for _ in range(7):
                if 'Change Warehouse Server' in labels(driver.snapshot()): break
                driver.adb('shell','input','swipe','360','1050','360','450','400')
            driver.tap('Change Warehouse Server')
            same = case['case'] == 'same-server'
            target = 'https://backend-core.example.test' if same or returning else 'https://backend-switch.example.test'
            name = primary_name
            target_id = case['instanceId']
            if returning:
                assert case['instanceId'] != primary_id
                target_id = primary_id
            elif not same:
                secondary = json.loads((soak.private(c['secondaryBackendState'],True)/'public/instance.json').read_text())
                assert secondary['instanceId'] != case['instanceId']
                target_id = secondary['instanceId']
                name = transport(target,18444,c['secondaryCA'],secondary['instanceId'])
            driver.fill_origin(target); driver.tap('Check server'); driver.wait(name); driver.wait(target)
            driver.tap('Use this server')
            if not same:
                driver.wait('Change Warehouse Server')
                assert f'Changing to {name} will sign you out and discard unsaved forms. You will need to sign in again.' in labels(driver.snapshot())
                driver.tap('CANCEL' if case['case']=='cancel-switch' else 'CHANGE SERVER')
            if case['case'] in ['confirm-switch','switch-back']:
                driver.wait('Send OTP'); driver.cold(); driver.wait('Send OTP')
                assert 'Choose your warehouse server' not in labels(driver.snapshot())
                driver.selected_server(evidence,target,target_id)
                driver.state['phases'].append('NEW_ORIGIN_LOGIN_REQUIRED_COLD_PERSISTENCE')
            else:
                if same: driver.wait('Change Warehouse Server')
                else: driver.wait('Use this server')
                driver.cold(); driver.wait('Orders tab'); fresh_orders()
                driver.selected_server(evidence,'https://backend-core.example.test',case['instanceId'])
                driver.state['phases'].append('OLD_SESSION_PRESERVED_FRESH_COLD_READ')
        guard_command('after')
        disarmed_relay()
        driver.state['status']='PASS'
    except Exception as error:
        last=traceback.extract_tb(error.__traceback__)[-1];driver.state.update(exceptionType=type(error).__name__,failureSite=Path(last.filename).name+':'+str(last.lineno))
        driver.state.update(status='FAIL',reason='Navigation stopped; preserve evidence; no replay or login')
        raise
    finally:
        if network_touched and not network_restored:
            try:
                if rule_attempted and not rule_restored:
                    rows=driver.adb('shell','iptables','-S','OUTPUT')
                    if marker in rows:restore_fixture_loopback(driver.adb,uid,marker)
                    rule_restored=True
                if plane_attempted and not plane_restored:
                    current=driver.adb('shell','settings','get','global','airplane_mode_on');assert current in ['0','1']
                    if current=='1':airplane(driver.adb,'1','0')
                    plane_restored=True
                reconnect(driver.adb,radios,18443); driver.state['networkRestored']=True
            except Exception: driver.state.update(status='FAIL',networkRestored=False)
        driver.save(); os.close(fd)
    print(json.dumps({'status':'PASS','case':case['case'],'scope':'bounded owned-emulator navigation'}))


if __name__ == '__main__':
    try:
        assert len(sys.argv)==2
        main(sys.argv[1])
    except Exception as error:
        blocked=str(error).startswith('BLOCKED:')
        print(json.dumps({'status':'BLOCKED' if blocked else 'FAIL','category':'NAVIGATION_STOPPED_NO_REPLAY'}))
        sys.exit(2 if blocked else 1)
