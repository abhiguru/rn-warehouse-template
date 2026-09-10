import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function validatePublicConfig(json, expectedUrl) {
  const config = json?.data;
  if (!json?.success || !config?.anonKey || !config?.supabaseUrl) throw new Error('Backend has not returned a complete public configuration.');
  if (new URL(config.supabaseUrl).origin !== new URL(expectedUrl).origin) {
    throw new Error('Backend SUPABASE_PUBLIC_URL must match the device-reachable EXPO_PUBLIC_CONFIG_API_URL.');
  }
  // Classify the PUBLIC key, not a signature check or user authentication.
  const payload = JSON.parse(Buffer.from(config.anonKey.split('.')[1], 'base64url').toString());
  if (payload.role !== 'anon' || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error('Expected a non-expired anon key, never a service-role key.');
  const check = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (/service.?key|service.?role|jwt.?secret|password/i.test(key)) throw new Error('Public response contains a private configuration field.');
      check(nested);
    }
  };
  check(config);
  return config;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const envPath = new URL('../.env', import.meta.url);
    const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const line = env.match(/^EXPO_PUBLIC_CONFIG_API_URL\s*=\s*(.*?)\s*$/m)?.[1];
    const configured = process.env.EXPO_PUBLIC_CONFIG_API_URL || line?.replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '') || 'http://localhost:18000';
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Configure an HTTP(S) origin without credentials, a path, or query parameters.');
    }
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
