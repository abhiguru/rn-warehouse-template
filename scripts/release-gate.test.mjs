import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

// The gate also compares the tag with the version in app.json. A fixture says which version the "build" carries, so the
// shape tests below do not depend on the real one.
const fixtures = mkdtempSync(join(tmpdir(), 'release-gate-'));
after(() => rmSync(fixtures, { recursive: true, force: true }));
function appConfig(version) {
  const path = join(fixtures, `app-${version}.json`);
  writeFileSync(path, JSON.stringify({ expo: { version } }));
  return path;
}
const versionOf = name => name.replace(/^v/, '').replace(/-.*$/, '');

function gate(name, type = 'tag', extraEnv = {}) {
  extraEnv = { RELEASE_APP_CONFIG: appConfig(versionOf(name) || '0.0.0'), ...extraEnv };
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
    assert.match(result.stdout, /the release is created later in this run by the sign job/);
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

test('refuses a tag that differs from the version app.json carries, and says what to do', () => {
  for (const [name, carried] of [['v0.7.0', '0.6.0'], ['v0.6.0', '0.6.1'], ['v1.0.0-rc.1', '0.9.0'], ['v0.6.0-demo', '0.6.0.1']]) {
    const result = gate(name, 'tag', { RELEASE_APP_CONFIG: appConfig(carried) });
    assert.notEqual(result.status, 0, `${name} with app.json ${carried} must be refused`);
    assert.match(result.stderr, /Refusing release: tag .* but .*expo\.version.* says '/);
    assert.match(result.stderr, /Bump the version/);
  }
});

test('accepts a tag, or a prerelease of it, that names the version app.json carries', () => {
  for (const name of ['v0.6.0', 'v0.6.0-rc.1', 'v0.6.0-demo']) {
    const result = gate(name, 'tag', { RELEASE_APP_CONFIG: appConfig('0.6.0') });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test('refuses when the version cannot be read', () => {
  const missing = gate('v0.6.0', 'tag', { RELEASE_APP_CONFIG: join(fixtures, 'does-not-exist.json') });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cannot read expo\.version/);
  const noVersion = join(fixtures, 'no-version.json');
  writeFileSync(noVersion, JSON.stringify({ expo: {} }));
  assert.notEqual(gate('v0.6.0', 'tag', { RELEASE_APP_CONFIG: noVersion }).status, 0);
});

test('with the real app.json: the tag of its own version passes, the next one is refused', () => {
  const { version } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  const [major, minor, patch] = version.split('.').map(Number);
  const real = name => gate(name, 'tag', { RELEASE_APP_CONFIG: '' });
  assert.equal(real(`v${version}`).status, 0);
  assert.notEqual(real(`v${major}.${minor}.${patch + 1}`).status, 0);
});

// WH-140 (owner, 2026-11-07): only going public is gated by the legal review, never a release tag. The tag gate does
// not read the flag; check-legal-reviewed.mjs (npm run check:legal, the make-public step) does, and release.yml reads
// the same constant with grep before it attaches the neutral APK. The three must agree.
const legalFile = (line, name) => {
  const path = join(fixtures, name);
  writeFileSync(path, `${line}\n`);
  return path;
};
const checkLegal = file => spawnSync('node', ['scripts/check-legal-reviewed.mjs', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
const workflowGrep = file => {
  const yml = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const pattern = /grep -Eq '(\^export const LEGAL_TEXT_REVIEWED[^']*)' src\/constants\/legal\.ts/.exec(yml)?.[1];
  assert.ok(pattern, 'release.yml reads the flag with grep -Eq');
  return spawnSync('grep', ['-Eq', pattern, file]).status === 0;
};

test('a release tag is not gated by the legal review: check-release.sh never reads the flag', () => {
  const script = readFileSync(new URL('check-release.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /check-legal-reviewed|LEGAL_TEXT_REVIEWED|check:legal/);
  assert.equal(gate('v0.8.0').status, 0, 'a tag passes whatever the flag says');
});

test('check-legal-reviewed refuses everything but a literal true, and release.yml reads the flag the same way', () => {
  const cases = [
    ['export const LEGAL_TEXT_REVIEWED = true;', true],
    ['export const LEGAL_TEXT_REVIEWED: boolean = true;', true],
    ['export const LEGAL_TEXT_REVIEWED = false;', false],
    ['export const LEGAL_TEXT_REVIEWED = !false;', false],
    ['// export const LEGAL_TEXT_REVIEWED = true;', false],
    ['  export const LEGAL_TEXT_REVIEWED = true;', false],
    ['const LEGAL_TEXT_REVIEWED = true;', false],
    ['export const OTHER = true;', false],
  ];
  cases.forEach(([line, reviewed], index) => {
    const file = legalFile(line, `legal-${index}.ts`);
    const result = checkLegal(file);
    assert.equal(result.status === 0, reviewed, `${line}: ${result.stderr}${result.stdout}`);
    assert.equal(workflowGrep(file), reviewed, `release.yml disagrees on: ${line}`);
    if (!reviewed) assert.match(result.stderr, /Refusing release: /);
  });
  assert.match(checkLegal(legalFile('export const LEGAL_TEXT_REVIEWED = true;', 'legal-ok.ts')).stdout, /recorded/);
  assert.equal(checkLegal(join(fixtures, 'no-such-file.ts')).status, 1, 'an unreadable file counts as not reviewed');
  assert.match(checkLegal(legalFile('export const OTHER = 1;', 'legal-none.ts')).stderr, /was not found/);
});

test('the flag in the repository is one literal true or false, which both readers can see', () => {
  const source = readFileSync(new URL('../src/constants/legal.ts', import.meta.url), 'utf8');
  assert.match(source, /^export const LEGAL_TEXT_REVIEWED = (?:true|false);$/m, 'one literal flag');
});
