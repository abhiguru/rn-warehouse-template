// The app's own version is what the facility's gate compares with `minimumClientVersion` (docs/API_CONTRACT.md in the
// backend, "Which app builds a release supports"). It must be a real version that moves with every release build:
// a build that still said 0.1.0 would be refused by, or wrongly accepted at, the first facility that raises its minimum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const expo = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const git = (...args) => {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};

/** The android versionCode of MAJOR.MINOR.PATCH: MAJOR*10000 + MINOR*100 + PATCH (0.6.0 is 600). */
export const versionCodeOf = version => {
  const [major, minor, patch] = version.split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
};

test('the version is MAJOR.MINOR.PATCH and package.json says the same', () => {
  assert.match(expo.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, expo.version);
});

test('the android versionCode follows the version', () => {
  assert.equal(expo.android.versionCode, versionCodeOf(expo.version));
});

// A reminder for a maintainer's own checkout, which has the tags: once commits follow a release tag, the next release build must
// carry a higher version. Skipped where the tags are not there (CI checks out without them, so CI never evaluates this one) and on
// the tagged commit itself. The rule that guards a release is scripts/check-release.sh, which the release workflow runs: the
// tag must name the version in app.json (scripts/release-gate.test.mjs).
test('the version differs from the newest release tag once commits follow it', t => {
  const tag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', '--exclude', '*-*');
  if (!tag) return t.skip('no release tag in this checkout');
  if (git('rev-parse', 'HEAD') === git('rev-list', '-n', '1', tag)) return t.skip('this is the tagged commit');
  assert.notEqual(expo.version, tag.replace(/^v/, ''), `app.json still says ${expo.version}, the version of ${tag}: bump it`);
});
