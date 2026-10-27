import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const sdkPackages = ['platform-tools', 'platforms;android-36', 'build-tools;36.0.0',
  'build-tools;35.0.0', 'ndk;27.1.12297006', 'ndk;27.0.12077973', 'cmake;3.22.1'];

// The toolchain versions React Native itself builds with. A pin that CI installs but React Native does not use
// (or the reverse) is the first thing that breaks on a React Native bump, so it is checked here rather than in Gradle.
export const reactNativeVersionsFile = fileURLToPath(new URL('../node_modules/react-native/gradle/libs.versions.toml', import.meta.url));
export class PinMismatchError extends Error {}
export class MissingReactNativeVersionsError extends Error {}
export function readReactNativeVersions(file = reactNativeVersionsFile) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') throw new MissingReactNativeVersionsError("React Native's libs.versions.toml not found; run npm ci first");
    throw error;
  }
  const versions = text.split(/\r?\n/).reduce((state, line) => {
    const section = line.match(/^\s*\[(.+)\]\s*$/);
    if (section) return { ...state, inVersions: section[1] === 'versions' };
    const entry = line.match(/^\s*([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/);
    if (state.inVersions && entry) state.values[entry[1]] = entry[2];
    return state;
  }, { inVersions: false, values: {} }).values;
  for (const key of ['compileSdk', 'buildTools', 'ndkVersion']) {
    assert.ok(versions[key], `${file} has no ${key} in [versions]`);
  }
  return versions;
}
export function checkReactNativePins(file = reactNativeVersionsFile) {
  const rn = readReactNativeVersions(file);
  const pinned = name => sdkPackages.filter(entry => entry.startsWith(name)).map(entry => entry.slice(name.length));
  const compare = (label, rnValue, pins) => {
    if (!pins.includes(rnValue)) {
      throw new PinMismatchError(`CI pins ${label} ${pins.join(' and ')} but React Native uses ${rnValue} (libs.versions.toml); update sdkPackages in scripts/check-android-sdk.mjs and the CI/Gradle pins together.`);
    }
  };
  compare('platforms;android-', rn.compileSdk, pinned('platforms;android-'));
  compare('build-tools;', rn.buildTools, pinned('build-tools;'));
  compare('ndk;', rn.ndkVersion, pinned('ndk;'));
}
export function checkAndroidSDK(root, { reactNativeVersions = reactNativeVersionsFile } = {}) {
  checkReactNativePins(reactNativeVersions);
  assert.ok(typeof root === 'string' && isAbsolute(root), 'Set an absolute ANDROID_HOME or ANDROID_SDK_ROOT');
  const property = (dir, name, expected) => {
    const text = readFileSync(resolve(root, dir, 'source.properties'), 'utf8');
    const values = Object.fromEntries(text.split(/\r?\n/).filter(line => line.includes('=')).map(line => {
      const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at+1).trim()];
    }));
    assert.equal(values[name], expected, `SDK revision mismatch: ${dir}`);
  };
  for (const v of ['27.1.12297006','27.0.12077973']) {
    property('ndk/'+v, 'Pkg.Revision', v);
    accessSync(resolve(root,'ndk',v,'toolchains/llvm/prebuilt/linux-x86_64/bin/clang'), constants.X_OK);
  }
  for (const v of ['36.0.0','35.0.0']) {
    property('build-tools/'+v,'Pkg.Revision',v);
    accessSync(resolve(root,'build-tools',v,'aapt2'), constants.X_OK);
  }
  property('platforms/android-36','AndroidVersion.ApiLevel','36');
  accessSync(resolve(root,'platforms/android-36/android.jar'), constants.R_OK);
  property('cmake/3.22.1','Pkg.Revision','3.22.1');
  accessSync(resolve(root,'cmake/3.22.1/bin/cmake'), constants.X_OK);
  accessSync(resolve(root,'platform-tools/adb'), constants.X_OK);
  return { status:'PASS', scope:'Linux x86_64 Android SDK file/revision preflight', packages:sdkPackages };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(checkAndroidSDK(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT))); }
  catch (error) {
    if (error instanceof PinMismatchError || error instanceof MissingReactNativeVersionsError) console.error(error.message);
    console.error('Android SDK prerequisite check failed. Install and verify the pinned packages listed in README.md (Quickstart) before Gradle; preserve SDK-manager failures.');
    process.exitCode=1;
  }
}
