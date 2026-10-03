import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('native observer preserves structured nonsecret failure categories', () => {
  const r = spawnSync('python3', [fileURLToPath(new URL('./fixture-ui/test_fixture_observation.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
