import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkAndroidSDK } from './check-android-sdk.mjs';
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
