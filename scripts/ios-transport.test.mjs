// Ops review 2026-10-17, M12 / D24: the generated iOS Info.plist must not allow arbitrary
// loads or carry an http exception in a release build. Local networking is allowed only in a
// development build. No macOS is needed: `expo config --type introspect` evaluates the same
// config plugins that `expo prebuild` runs and prints the Info.plist they would write.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('the generated Xcode project gets a Release-only guard phase, once', () => {
  // Not built: there is no Xcode here. This checks the project file the plugin would write.
  const xcode = require('xcode');
  const { addReleaseGuardPhase, GUARD_PHASE_NAME } = require('../plugins/with-ios-transport-policy.js');
  const fixture = fileURLToPath(
    new URL('../node_modules/react-native-safe-area-context/ios/RNSafeAreaContext.xcodeproj/project.pbxproj', import.meta.url)
  );
  const project = xcode.project(fixture).parseSync();
  const guards = () =>
    Object.values(project.hash.project.objects.PBXShellScriptBuildPhase || {}).filter(
      phase => typeof phase === 'object' && phase.name === `"${GUARD_PHASE_NAME}"`
    );
  assert.equal(guards().length, 0);
  addReleaseGuardPhase(project);
  addReleaseGuardPhase(project);
  assert.equal(guards().length, 1);
  // The project file stores the script as one quoted string with escaped quotes.
  const script = guards()[0].shellScript.slice(1, -1).replace(/\\"/g, '"');
  // It is valid shell (the Xcode build cannot be run here, but the syntax can be).
  assert.equal(spawnSync('sh', ['-n', '-c', script]).status, 0);
  assert.match(script, /\$CONFIGURATION" = "Release"/);
  assert.match(script, /NSAppTransportSecurity:NSAllowsLocalNetworking/);
  assert.match(script, /NSAppTransportSecurity:NSAllowsArbitraryLoads/);
  assert.match(script, /exit 1/);
  // The phase belongs to the app target's build phases.
  const target = project.getFirstTarget();
  const listed = project.pbxNativeTargetSection()[target.uuid].buildPhases.map(phase => phase.comment);
  assert.ok(listed.includes(GUARD_PHASE_NAME));
  // The written project file still parses.
  assert.ok(xcode.project(fixture).parseSync() && project.writeSync().includes('PlistBuddy'));
});

// Ops review 2026-10-18, N1: the Release guard let a build pass when it could not read the built
// Info.plist. It runs here against a stand-in for PlistBuddy (a shell script that looks a key up
// in a "key=value" text file), because there is no macOS here.
function runGuard({ plist, configuration = 'Release', standIn = true }) {
  const xcode = require('xcode');
  const { addReleaseGuardPhase, GUARD_PHASE_NAME } = require('../plugins/with-ios-transport-policy.js');
  const project = xcode.project(
    fileURLToPath(new URL('../node_modules/react-native-safe-area-context/ios/RNSafeAreaContext.xcodeproj/project.pbxproj', import.meta.url))
  ).parseSync();
  addReleaseGuardPhase(project);
  const phase = Object.values(project.hash.project.objects.PBXShellScriptBuildPhase).find(
    entry => typeof entry === 'object' && entry.name === `"${GUARD_PHASE_NAME}"`
  );
  const directory = mkdtempSync(join(tmpdir(), 'ios-guard-'));
  try {
    const buddy = join(directory, standIn ? 'PlistBuddy' : 'no-such-PlistBuddy');
    if (standIn) {
      writeFileSync(buddy, '#!/bin/sh\nkey="${2#Print :}"\ngrep -m1 "^$key=" "$3" | cut -d= -f2-\ngrep -q "^$key=" "$3"\n');
      chmodSync(buddy, 0o755);
    }
    if (plist !== undefined) writeFileSync(join(directory, 'Info.plist'), plist);
    const script = phase.shellScript.slice(1, -1).replace(/\\"/g, '"').replace('/usr/libexec/PlistBuddy', buddy);
    return spawnSync('sh', ['-c', script], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, CONFIGURATION: configuration, TARGET_BUILD_DIR: directory, INFOPLIST_PATH: 'Info.plist' },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const CLEAN = 'CFBundleIdentifier=com.example.test\nNSAppTransportSecurity:NSAllowsArbitraryLoads=false\n';

test('the Release guard passes a clean Info.plist and ignores other configurations', () => {
  assert.equal(runGuard({ plist: CLEAN }).status, 0);
  assert.equal(runGuard({ configuration: 'Debug' }).status, 0);
});

test('the Release guard fails when the built Info.plist is missing or cannot be parsed', () => {
  const missing = runGuard({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing or unreadable/);
  const garbled = runGuard({ plist: 'not a plist\n' });
  assert.equal(garbled.status, 1);
  assert.match(garbled.stderr, /cannot be parsed/);
});

test('the Release guard fails when PlistBuddy itself is missing', () => {
  const result = runGuard({ plist: CLEAN, standIn: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PlistBuddy is missing/);
});

test('the Release guard fails on local networking, arbitrary loads and exception domains', () => {
  for (const [extra, message] of [
    ['NSAppTransportSecurity:NSAllowsLocalNetworking=true', /NSAllowsLocalNetworking/],
    ['NSAppTransportSecurity:NSExceptionDomains=Dict', /NSExceptionDomains/],
  ]) {
    const result = runGuard({ plist: `${CLEAN}${extra}\n` });
    assert.equal(result.status, 1, extra);
    assert.match(result.stderr, message);
  }
  const arbitrary = runGuard({ plist: 'CFBundleIdentifier=com.example.test\nNSAppTransportSecurity:NSAllowsArbitraryLoads=true\n' });
  assert.equal(arbitrary.status, 1);
  assert.match(arbitrary.stderr, /NSAllowsArbitraryLoads/);
});
