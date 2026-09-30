import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateFixtureTarget } from './prepare-emulator-fixture.mjs';
import { validateEntries, validateText } from './artifact-audit.mjs';

test('fixture certificate overlay rejects normal warehouse packages before parsing any certificate', () => {
  for (const id of ['in.gurucold.warehouse.test1', 'com.warehouse.manager']) {
    assert.throws(() => validateFixtureTarget(`applicationId "${id}"`, 'not a certificate'), /normal warehouse APK/);
  }
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
        assert.throws(() => validateFixtureTarget(gradle, pem, Date.now() + 3 * 86400000));
      } else assert.throws(() => validateFixtureTarget(gradle, pem));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
