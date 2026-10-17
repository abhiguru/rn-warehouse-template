// Ops review 2026-10-17, M12 / D24: the generated iOS Info.plist must not allow arbitrary
// loads or carry an http exception in a release build. Local networking is allowed only in a
// development build. No macOS is needed: `expo config --type introspect` evaluates the same
// config plugins that `expo prebuild` runs and prints the Info.plist they would write.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { isDevelopmentBuild, transportPolicy } = require('../plugins/with-ios-transport-policy.js');
const root = fileURLToPath(new URL('..', import.meta.url));

// Everything that can switch the development policy on, so a developer's shell cannot change
// what a test expects.
const SWITCHES = ['WAREHOUSE_IOS_LOCAL_NETWORKING', 'WAREHOUSE_IOS_USB_HOST', 'EAS_BUILD_PROFILE'];

function introspect(extraEnv = {}) {
  const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' };
  for (const name of SWITCHES) delete env[name];
  Object.assign(env, extraEnv);
  return spawnSync('npx', ['--no-install', 'expo', 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120000,
  });
}

function atsOf(extraEnv) {
  const result = introspect(extraEnv);
  assert.equal(result.status, 0, `expo config failed: ${result.stderr}`);
  const config = JSON.parse(result.stdout);
  return config.ios.infoPlist.NSAppTransportSecurity;
}

test('a release Info.plist forbids arbitrary loads and has no exception of any kind', () => {
  const ats = atsOf();
  assert.equal(ats.NSAllowsArbitraryLoads, false);
  // Exactly one key: no exception domains (Expo's template adds localhost), no local
  // networking, no web-content or media exemption.
  assert.deepEqual(ats, { NSAllowsArbitraryLoads: false });
});

test('the development switches allow local networking and nothing else', () => {
  for (const env of [
    { WAREHOUSE_IOS_LOCAL_NETWORKING: '1' },
    { WAREHOUSE_IOS_USB_HOST: '169.254.43.183:8081' },
    { EAS_BUILD_PROFILE: 'development' },
  ]) {
    const ats = atsOf(env);
    assert.deepEqual(ats, { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true }, JSON.stringify(env));
    assert.equal(ats.NSExceptionDomains, undefined, JSON.stringify(env));
  }
});

test('the EAS preview and production profiles stay on the release policy', () => {
  for (const profile of ['preview', 'production']) {
    assert.deepEqual(atsOf({ EAS_BUILD_PROFILE: profile }), { NSAllowsArbitraryLoads: false }, profile);
  }
});

test('a release profile refuses the development switches instead of building', () => {
  for (const profile of ['preview', 'production']) {
    const result = introspect({ EAS_BUILD_PROFILE: profile, WAREHOUSE_IOS_LOCAL_NETWORKING: '1' });
    assert.notEqual(result.status, 0, profile);
    assert.match(result.stderr, /must not allow cleartext local networking/, profile);
  }
});

test('the policy decision for each combination of switches', () => {
  assert.equal(isDevelopmentBuild({}), false);
  assert.equal(isDevelopmentBuild({ WAREHOUSE_IOS_LOCAL_NETWORKING: '' }), false);
  assert.equal(isDevelopmentBuild({ WAREHOUSE_IOS_LOCAL_NETWORKING: '0' }), false);
  assert.equal(isDevelopmentBuild({ WAREHOUSE_IOS_LOCAL_NETWORKING: '1' }), true);
  assert.equal(isDevelopmentBuild({ WAREHOUSE_IOS_USB_HOST: '169.254.43.183:8081' }), true);
  assert.equal(isDevelopmentBuild({ EAS_BUILD_PROFILE: 'development' }), true);
  assert.equal(isDevelopmentBuild({ EAS_BUILD_PROFILE: 'preview' }), false);
  assert.equal(isDevelopmentBuild({ EAS_BUILD_PROFILE: 'production' }), false);
  // A misspelt switch must not quietly give a development build without local networking.
  assert.throws(() => isDevelopmentBuild({ WAREHOUSE_IOS_LOCAL_NETWORKING: 'true' }), /must be 1/);
  assert.throws(
    () => isDevelopmentBuild({ EAS_BUILD_PROFILE: 'production', WAREHOUSE_IOS_USB_HOST: '169.254.43.183:8081' }),
    /"production" build profile/
  );
  assert.deepEqual(transportPolicy(false), { NSAllowsArbitraryLoads: false });
  assert.deepEqual(transportPolicy(true), { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true });
});

test('npm run ios, the local debug build, generates the development policy', () => {
  const { scripts } = require('../package.json');
  assert.match(scripts.ios, /^WAREHOUSE_IOS_LOCAL_NETWORKING=1 expo run:ios$/);
  // The USB helper's prebuild sets WAREHOUSE_IOS_USB_HOST, which is a development switch too.
  const usb = readFileSync(new URL('./ios-usb.mjs', import.meta.url), 'utf8');
  assert.match(usb, /prebuild[^]*WAREHOUSE_IOS_USB_HOST/);
});
