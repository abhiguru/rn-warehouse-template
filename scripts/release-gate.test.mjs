import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function gate(name, type = 'tag', extraEnv = {}) {
  const result = spawnSync('bash', ['scripts/check-release.sh'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, GITHUB_REF_NAME: name, GITHUB_REF_TYPE: type, ...extraEnv },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

test('accepts any semantic version tag, with or without a prerelease suffix', () => {
  for (const name of ['v1.0.0', 'v0.3.0', 'v10.2.33-rc.1', 'v0.2.2-demo']) {
    const result = gate(name);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.match(result.stdout, new RegExp(`Release gate passed for tag ${name.replace(/\./g, '\\.')}`));
    assert.match(result.stdout, /publishes the release manually/);
  }
});

test('rejects tags that are not semantic versions', () => {
  for (const name of ['release-1', 'v1.0', '1.0.0', 'v1.0.0.0', '', 'v1.0.0-', 'v1.0.0+build', 'V1.0.0', 'v1.0.0 ']) {
    const result = gate(name);
    assert.notEqual(result.status, 0, `${name} must be refused`);
    assert.match(result.stderr, /Refusing release/);
  }
});

test('rejects branch refs even when the branch is named like a version', () => {
  for (const type of ['branch', '', undefined]) {
    const env = type === undefined ? { GITHUB_REF_TYPE: '' } : {};
    assert.notEqual(gate('v1.0.0', type ?? '', env).status, 0);
  }
  assert.notEqual(gate('v0.2.2-demo', 'branch').status, 0);
});

test('keeps the character classes byte-exact regardless of the caller locale', () => {
  // 'v1.0.0-é' contains a non-ASCII letter; a widened [A-Za-z] under a
  // non-C collation could admit it.
  const result = gate('v1.0.0-é', 'tag', { LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' });
  assert.notEqual(result.status, 0);
});
