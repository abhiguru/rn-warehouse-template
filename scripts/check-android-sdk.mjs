import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sdkPackages = ['platform-tools', 'platforms;android-36', 'build-tools;36.0.0',
  'build-tools;35.0.0', 'ndk;27.1.12297006', 'ndk;27.0.12077973', 'cmake;3.22.1'];
export function checkAndroidSDK(root) {
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
  catch { console.error('Android SDK prerequisite check failed. Install and verify the pinned packages in docs/OPERATOR_INSTALL_NOTES.md before Gradle; preserve SDK-manager failures.'); process.exitCode=1; }
}
