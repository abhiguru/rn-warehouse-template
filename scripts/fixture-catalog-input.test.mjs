import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('native catalog input waits for controlled updates and refuses replay or other records', () => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./fixture-ui/test_catalog_input.py', import.meta.url))], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 4 tests/);
});
