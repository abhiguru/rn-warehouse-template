import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { httpOrigin, validatePublicConfig } from '../src/config/bootstrapValidation.ts';
export { validatePublicConfig };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const envPath = new URL('../.env', import.meta.url);
    const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const line = env.match(/^EXPO_PUBLIC_CONFIG_API_URL\s*=\s*(.*?)\s*$/m)?.[1];
    const configured = process.env.EXPO_PUBLIC_CONFIG_API_URL || line?.replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '') || 'http://localhost:18000';
    const url = { origin: httpOrigin(configured) };
    const response = await fetch(`${url.origin}/functions/v1/get-public-config`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}; check backend readiness and migrations.`);
    validatePublicConfig(await response.json(), url.origin);
    console.log('Public bootstrap configuration is reachable. No Docker credentials were inspected or .env values changed.');
    console.log('This checks bootstrap only; login and warehouse API tests are still required.');
  } catch (error) {
    console.error(`Backend check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
