import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function gate(name, type = 'tag') {
  const result = spawnSync('bash', ['scripts/check-release.sh'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, GITHUB_REF_NAME: name, GITHUB_REF_TYPE: type },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

test('allows exactly the reviewed v0.2.2-demo tag', () => {
  const result = gate('v0.2.2-demo');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /source-only prerelease gate passed/);
});

test('rejects historical, arbitrary demo, and production tags', () => {
  for (const name of ['v0.2.1-demo', 'v0.2.0-demo', 'v0.2.2', 'v0.2.3-demo', 'v1.0.0', '']) {
    assert.notEqual(gate(name).status, 0);
  }
});

test('rejects a branch named v0.2.2-demo', () => {
  assert.notEqual(gate('v0.2.2-demo', 'branch').status, 0);
});
