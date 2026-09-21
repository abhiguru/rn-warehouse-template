import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMain } from './is-main.mjs';
import { probe, readEnv, root, supportedNode } from './doctor-common.mjs';
import { httpOrigin, validatePublicConfig } from '../src/config/bootstrapValidation.ts';

export async function doctor({ backendOnly = false } = {}) {
  if (!supportedNode()) throw new Error('Node.js 22.18+ required.');
  if (!probe('npm', ['--version']).ok) throw new Error('npm is unavailable.');
  if (!existsSync(resolve(root, 'node_modules/expo/package.json'))) throw new Error('Dependencies missing; run npm ci.');
  const env = readEnv(resolve(root, '.env'));
  const origin = httpOrigin(process.env.EXPO_PUBLIC_CONFIG_API_URL || env.EXPO_PUBLIC_CONFIG_API_URL || 'http://localhost:18000');
  if (!backendOnly) {
    if (!probe('java', ['-version']).ok) throw new Error('JDK unavailable; install JDK 17 for Android builds.');
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk || !existsSync(resolve(sdk, 'platforms/android-36/android.jar'))) throw new Error('Android SDK platform 36 missing; configure ANDROID_HOME.');
    // Do not run `adb devices`: it can start a daemon. Read existing port reversals
    // only when explicitly requested by the developer outside this read-only check.
    if (!existsSync(resolve(sdk, 'platform-tools/adb'))) throw new Error('Android platform-tools missing.');
  }
  const response = await fetch(`${origin}/functions/v1/get-public-config`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`Bootstrap returned HTTP ${response.status}.`);
  validatePublicConfig(await response.json(), origin);
  return 'Prerequisites and host bootstrap passed. Use adb reverse for Android API and Metro ports; device connectivity requires an actual device check. No files or services changed.';
}

if (isMain(import.meta.url)) {
  try { console.log(await doctor({ backendOnly: process.argv.includes('--backend-only') })); }
  catch (error) { console.error(`Doctor: ${error.message}`); process.exitCode = 1; }
}
