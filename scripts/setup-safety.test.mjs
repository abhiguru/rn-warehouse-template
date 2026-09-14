import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, statSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('environment creation preserves existing bytes, permissions and symlink targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-mobile-setup-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(new URL('./create-env.mjs', import.meta.url), join(root, 'scripts/create-env.mjs'));
    copyFileSync(new URL('../.env.example', import.meta.url), join(root, '.env.example'));
    const run = () => spawnSync(process.execPath, [join(root, 'scripts/create-env.mjs')]);
    assert.equal(run().status, 0);
    assert.equal(statSync(join(root, '.env')).mode & 0o777, 0o600);
    const bytes = readFileSync(join(root, '.env'));
    chmodSync(join(root, '.env'), 0o640);
    assert.equal(run().status, 0);
    assert.deepEqual(readFileSync(join(root, '.env')), bytes);
    assert.equal(statSync(join(root, '.env')).mode & 0o777, 0o640);
    rmSync(join(root, '.env'));
    symlinkSync(join(root, '.env.example'), join(root, '.env'));
    assert.equal(run().status, 0);
    assert.deepEqual(readFileSync(join(root, '.env.example')), bytes);
  } finally { rmSync(root, { recursive: true }); }
});
