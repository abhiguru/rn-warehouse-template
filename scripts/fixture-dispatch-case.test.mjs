import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('native dispatch case requires exact confirmation and loss proof before one retry', () => {
  const r = spawnSync('python3', [fileURLToPath(new URL('./fixture-ui/test_dispatch_case_controls.py', import.meta.url))], { encoding:'utf8', timeout:10000 });
  assert.equal(r.status, 0, r.stderr);
});
