import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateFixtureTarget } from './prepare-emulator-fixture.mjs';

test('fixture certificate overlay rejects normal warehouse packages before parsing any certificate', () => {
  for (const id of ['in.gurucold.warehouse.test1', 'com.warehouse.manager']) {
    assert.throws(() => validateFixtureTarget(`applicationId "${id}"`, 'not a certificate'), /normal warehouse APK/);
  }
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
