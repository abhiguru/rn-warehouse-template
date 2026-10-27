import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkAndroidSDK, checkReactNativePins, readReactNativeVersions, reactNativeVersionsFile, PinMismatchError, MissingReactNativeVersionsError } from './check-android-sdk.mjs';
function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'warehouse-sdk-check-')); t.after(()=>rmSync(root,{recursive:true}));
  const file=(p,text='',mode=0o600)=>{mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),text,{mode});};
  for(const v of ['27.1.12297006','27.0.12077973']) {file(`ndk/${v}/source.properties`,`Pkg.Revision = ${v}\n`);file(`ndk/${v}/toolchains/llvm/prebuilt/linux-x86_64/bin/clang`,'',0o700);}
  for(const v of ['36.0.0','35.0.0']) {file(`build-tools/${v}/source.properties`,`Pkg.Revision=${v}`);file(`build-tools/${v}/aapt2`,'',0o700);}
  file('platforms/android-36/source.properties','AndroidVersion.ApiLevel=36');file('platforms/android-36/android.jar');
  file('cmake/3.22.1/source.properties','Pkg.Revision=3.22.1');file('cmake/3.22.1/bin/cmake','',0o700);file('platform-tools/adb','',0o700);
  return root;
}
test('SDK preflight accepts both explicitly installed NDKs without invoking ADB', t=>{
  assert.equal(checkAndroidSDK(fixture(t)).status,'PASS');
});
test('missing Worklets NDK and wrong revisions fail before Gradle', t=>{
  const root=fixture(t);rmSync(join(root,'ndk/27.0.12077973/source.properties'));
  assert.throws(()=>checkAndroidSDK(root));writeFileSync(join(root,'ndk/27.0.12077973/source.properties'),'Pkg.Revision=27.1.12297006');
  assert.throws(()=>checkAndroidSDK(root),/SDK revision mismatch/);
});
test('metadata alone and relative roots cannot satisfy SDK preflight', t=>{
  const root=fixture(t);chmodSync(join(root,'ndk/27.0.12077973/toolchains/llvm/prebuilt/linux-x86_64/bin/clang'),0o600);
  assert.throws(()=>checkAndroidSDK(root));assert.throws(()=>checkAndroidSDK('relative'));
});

function toml(t, { compileSdk = '36', buildTools = '36.0.0', ndkVersion = '27.1.12297006' } = {}) {
  const root=mkdtempSync(join(tmpdir(),'warehouse-rn-toml-')); t.after(()=>rmSync(root,{recursive:true}));
  const file=join(root,'libs.versions.toml');
  writeFileSync(file,`[versions]\n# Android versions\nminSdk = "24"\ncompileSdk = "${compileSdk}"\nbuildTools = "${buildTools}"\nndkVersion = "${ndkVersion}"\n\n[libraries]\ncompileSdk = "not-a-version"\n`);
  return file;
}
test('the pins match React Native\'s own toolchain versions (the installed react-native and a fixture)', t=>{
  assert.doesNotThrow(()=>checkReactNativePins(reactNativeVersionsFile));
  assert.doesNotThrow(()=>checkReactNativePins(toml(t)));
  assert.deepEqual(readReactNativeVersions(toml(t,{ndkVersion:'28.0.1'})).ndkVersion,'28.0.1');
  assert.equal(checkAndroidSDK(fixture(t),{reactNativeVersions:toml(t)}).status,'PASS');
});
test('a pin that differs from React Native fails with both values named', t=>{
  for (const [override, pinned, rn] of [
    [{compileSdk:'37'}, '36', '37'],
    [{buildTools:'37.0.0'}, '36.0.0 and 35.0.0', '37.0.0'],
    [{ndkVersion:'28.0.1'}, '27.1.12297006 and 27.0.12077973', '28.0.1'],
  ]) {
    const file=toml(t,override);
    assert.throws(()=>checkReactNativePins(file),error=>error instanceof PinMismatchError&&error.message.includes(`CI pins`)&&error.message.includes(pinned)&&error.message.includes(`React Native uses ${rn}`));
    assert.throws(()=>checkAndroidSDK(fixture(t),{reactNativeVersions:file}),PinMismatchError);
  }
});
test('a toml without the keys fails instead of passing silently', t=>{
  const root=mkdtempSync(join(tmpdir(),'warehouse-rn-toml-')); t.after(()=>rmSync(root,{recursive:true}));
  const file=join(root,'libs.versions.toml'); writeFileSync(file,'[versions]\nminSdk = "24"\n');
  assert.throws(()=>checkReactNativePins(file),/no compileSdk/);
});
test('a missing React Native toml fails with an instruction instead of the generic message', t=>{
  const root=mkdtempSync(join(tmpdir(),'warehouse-rn-toml-')); t.after(()=>rmSync(root,{recursive:true}));
  const absent=join(root,'gradle','libs.versions.toml');
  assert.throws(()=>checkReactNativePins(absent),error=>error instanceof MissingReactNativeVersionsError&&error.message==="React Native's libs.versions.toml not found; run npm ci first");
  assert.throws(()=>checkAndroidSDK(fixture(t),{reactNativeVersions:absent}),MissingReactNativeVersionsError);
});
