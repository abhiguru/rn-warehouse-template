import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateFixtureTarget, validateSwitchingFixtureTarget, validateCertificateHorizon, validateReplacementFixtureTarget, validateIndependentFixtureKeys } from './prepare-emulator-fixture.mjs';
import { validateEntries, validateText } from './artifact-audit.mjs';

test('fixture certificate overlay rejects normal warehouse packages before parsing any certificate', () => {
  for (const id of ['in.gurucold.warehouse.test1', 'com.warehouse.manager']) {
    assert.throws(() => validateFixtureTarget(`applicationId "${id}"`, 'not a certificate'), /normal warehouse APK/);
    assert.throws(() => validateSwitchingFixtureTarget(`applicationId "${id}"`, 'not a certificate'), /normal warehouse APK/);
  }
});

test('optional switching trust uses independent certificates and separate exact domains', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-switching-overlay-test-'));
  try {
    const scripts = join(dir, 'scripts'), app = join(dir, 'android/app');
    mkdirSync(scripts); mkdirSync(join(app, 'src/main'), { recursive: true });
    for (const name of ['prepare-emulator-fixture.mjs', 'is-main.mjs']) copyFileSync(new URL(name, import.meta.url), join(scripts, name));
    writeFileSync(join(app, 'build.gradle'), 'applicationId "in.gurucold.warehouse.fixture"');
    writeFileSync(join(app, 'src/main/AndroidManifest.xml'), '<manifest><application android:name="fixture" /></manifest>');
    const cert = (name, domains) => {
      const path = join(dir, name+'.pem');
      const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-keyout', join(dir, name+'-key.pem'), '-out', path, '-subj', `/CN=${domains[0]}`,
        '-addext', 'subjectAltName='+domains.map(d => 'DNS:'+d).join(','), '-addext', 'basicConstraints=critical,CA:TRUE'], { stdio:'ignore' });
      assert.equal(r.status, 0); return path;
    };
    const primary = cert('primary', ['backend-core.example.test']);
    const switching = cert('switching', ['backend-switch.example.test']);
    const shared = cert('shared', ['backend-core.example.test', 'backend-switch.example.test']);
    const run = (ca, second, option) => spawnSync(process.execPath, [join(scripts, 'prepare-emulator-fixture.mjs'), ...(option ? [option] : [])], {
      env: { ...process.env, WAREHOUSE_FIXTURE_CA: ca, WAREHOUSE_SWITCH_FIXTURE_CA: second, WAREHOUSE_FIXTURE_MIN_VALID_HOURS:'12' }, encoding:'utf8' });
    assert.notEqual(run(shared, shared, '--check-certificate').status, 0, 'Same TLS key must not be reused across instances');
    assert.notEqual(run(primary, primary, '--check-certificate').status, 0, 'Primary hostname must not satisfy switching trust');
    assert.equal(run(primary, switching, '--check-certificate').status, 0);
    assert.equal(run(primary, switching).status, 0);
    const xml = readFileSync(join(app, 'src/main/res/xml/warehouse_fixture_network_security.xml'), 'utf8');
    assert.match(xml, /<domain includeSubdomains="false">backend-core\.example\.test<\/domain>\s*<trust-anchors><certificates src="@raw\/warehouse_fixture_ca"/);
    assert.match(xml, /<domain includeSubdomains="false">backend-switch\.example\.test<\/domain>\s*<trust-anchors><certificates src="@raw\/warehouse_switch_fixture_ca"/);
    assert.equal((xml.match(/cleartextTrafficPermitted="false"/g) || []).length, 3);
    assert.equal(readFileSync(join(app,'src/main/res/raw/warehouse_switch_fixture_ca.crt'),'utf8'),readFileSync(switching,'utf8'));
    assert.doesNotThrow(() => validateEntries(['res/raw/warehouse_switch_fixture_ca.crt']));
    assert.throws(() => validateText(readFileSync(join(dir,'switching-key.pem'),'utf8')));
    assert.notEqual(run(primary, switching).status, 0, 'Existing policy must not be overwritten');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated fixture certificate passes the unchanged artifact guard without permitting key files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-fixture-overlay-test-'));
  try {
    const scripts = join(dir, 'scripts');
    const app = join(dir, 'android/app');
    mkdirSync(scripts);
    mkdirSync(join(app, 'src/main'), { recursive: true });
    for (const name of ['prepare-emulator-fixture.mjs', 'is-main.mjs']) {
      copyFileSync(new URL(name, import.meta.url), join(scripts, name));
    }
    writeFileSync(join(app, 'build.gradle'), 'applicationId "in.gurucold.warehouse.fixture"');
    writeFileSync(join(app, 'src/main/AndroidManifest.xml'), '<manifest><application android:name="fixture" /></manifest>');
    const ca = join(dir, 'ca.pem');
    const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(dir, 'key.pem'), '-out', ca, '-days', '1',
      '-subj', '/CN=backend-core.example.test', '-addext', 'subjectAltName=DNS:backend-core.example.test',
      '-addext', 'basicConstraints=critical,CA:TRUE'], { stdio: 'ignore' });
    assert.equal(generated.status, 0);
    const run = () => spawnSync(process.execPath, [join(scripts, 'prepare-emulator-fixture.mjs')], {
      env: { ...process.env, WAREHOUSE_FIXTURE_CA: ca }, encoding: 'utf8',
    });
    assert.equal(run().status, 0);
    const crt = readFileSync(join(app, 'src/main/res/raw/warehouse_fixture_ca.crt'), 'utf8');
    assert.equal(crt, readFileSync(ca, 'utf8'));
    assert.ok(!existsSync(join(app, 'src/main/res/raw/warehouse_fixture_ca.pem')));
    assert.doesNotThrow(() => validateEntries(['res/raw/warehouse_fixture_ca.crt']));
    assert.doesNotThrow(() => validateText(crt));
    assert.throws(() => validateEntries(['res/raw/key.pem']));
    assert.throws(() => validateText(readFileSync(join(dir, 'key.pem'), 'utf8')));
    assert.notEqual(run().status, 0, 'Existing native trust policy must still be refused');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture trust requires the correct hostname and a currently valid CA', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-fixture-cert-test-'));
  const gradle = 'applicationId "in.gurucold.warehouse.fixture"';
  try {
    for (const domain of ['backend-core.example.test', 'wrong-fixture.example.test']) {
      const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'ca.pem'), '-days', '1',
        '-subj', `/CN=${domain}`, '-addext', `subjectAltName=DNS:${domain}`,
        '-addext', 'basicConstraints=critical,CA:TRUE'], { stdio: 'ignore' });
      assert.equal(result.status, 0);
      const pem = readFileSync(join(dir, 'ca.pem'));
      if (domain === 'backend-core.example.test') {
        assert.doesNotThrow(() => validateFixtureTarget(gradle, pem));
        assert.doesNotThrow(() => validateCertificateHorizon(pem, 12));
        assert.throws(() => validateCertificateHorizon(pem, 25), /expires before/);
        assert.throws(() => validateCertificateHorizon(pem, 1, Date.now() - 2 * 86400000), /not valid yet/);
        for (const invalid of [0, -1, NaN, Infinity, 169]) {
          assert.throws(() => validateCertificateHorizon(pem, invalid), /horizon/);
        }
        assert.throws(() => validateFixtureTarget(gradle, pem, Date.now() + 3 * 86400000));
      } else assert.throws(() => validateFixtureTarget(gradle, pem));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('replacement trust is optional, exact-host, independent and confined to the core domain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-replacement-overlay-test-'));
  const gradle = 'applicationId "in.gurucold.warehouse.fixture"';
  try {
    const scripts = join(dir, 'scripts'), app = join(dir, 'android/app');
    mkdirSync(scripts); mkdirSync(join(app, 'src/main'), { recursive: true });
    for (const name of ['prepare-emulator-fixture.mjs', 'is-main.mjs']) copyFileSync(new URL(name, import.meta.url), join(scripts, name));
    writeFileSync(join(app, 'build.gradle'), gradle);
    const manifest = join(app, 'src/main/AndroidManifest.xml');
    const original = '<manifest><application android:name="fixture" /></manifest>';
    writeFileSync(manifest, original);
    const cert = (name, domain, key) => {
      const path = join(dir, name+'.pem');
      const args = ['req', '-x509', ...(key ? ['-key', key] : ['-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, name+'-key.pem')]),
        '-days', '14', '-out', path, '-subj', `/CN=${domain}`, '-addext', `subjectAltName=DNS:${domain}`, '-addext', 'basicConstraints=critical,CA:TRUE'];
      assert.equal(spawnSync('openssl', args, { stdio: 'ignore' }).status, 0);
      return path;
    };
    const primary = cert('primary', 'backend-core.example.test');
    const switching = cert('switching', 'backend-switch.example.test');
    const replacement = cert('replacement', 'backend-core.example.test');
    const reused = cert('reused', 'backend-core.example.test', join(dir, 'primary-key.pem'));
    const wrong = cert('wrong', 'backend-switch.example.test');
    const wildcard = cert('wildcard', '*.example.test');
    const pem = readFileSync(replacement);
    assert.throws(() => validateReplacementFixtureTarget('applicationId "com.warehouse.manager"', pem), /normal warehouse APK/);
    assert.throws(() => validateReplacementFixtureTarget(gradle, readFileSync(wrong)));
    assert.throws(() => validateReplacementFixtureTarget(gradle, readFileSync(wildcard)), /exact fictional hostname/);
    assert.throws(() => validateReplacementFixtureTarget(gradle, pem, Date.now()+15*86400000));
    assert.throws(() => validateIndependentFixtureKeys([readFileSync(primary), readFileSync(reused)]), /independent TLS keys/);
    const run = ca => spawnSync(process.execPath, [join(scripts, 'prepare-emulator-fixture.mjs')], {
      env: { ...process.env, WAREHOUSE_FIXTURE_CA: primary, WAREHOUSE_SWITCH_FIXTURE_CA: switching,
        WAREHOUSE_REPLACEMENT_FIXTURE_CA: ca, WAREHOUSE_FIXTURE_MIN_VALID_HOURS: '72' }, encoding: 'utf8' });
    for (const invalid of [reused, switching, wrong, wildcard]) {
      assert.notEqual(run(invalid).status, 0);
      assert.equal(readFileSync(manifest, 'utf8'), original, 'Refusal must precede native mutation');
      assert.ok(!existsSync(join(app, 'src/main/res')));
    }
    assert.equal(run(replacement).status, 0);
    const xml = readFileSync(join(app, 'src/main/res/xml/warehouse_fixture_network_security.xml'), 'utf8');
    const domains = xml.match(/<domain-config[\s\S]*?<\/domain-config>/g);
    assert.equal(domains.length, 2);
    assert.match(domains[0], /backend-core\.example\.test/);
    assert.match(domains[0], /@raw\/warehouse_replacement_fixture_ca/);
    assert.ok(!domains[1].includes('warehouse_replacement_fixture_ca'));
    assert.ok(!xml.match(/includeSubdomains="true"|cleartextTrafficPermitted="true"/));
    assert.equal(readFileSync(join(app, 'src/main/res/raw/warehouse_replacement_fixture_ca.crt'), 'utf8'), pem.toString());
    assert.doesNotThrow(() => validateEntries(['res/raw/warehouse_replacement_fixture_ca.crt']));
    assert.notEqual(run(replacement).status, 0, 'Do not overwrite generated trust');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
