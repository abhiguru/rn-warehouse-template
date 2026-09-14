import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicConfig } from './check-backend.mjs';

const url = 'http://192.0.2.10:18000';
const config = (role = 'anon') => ({ success: true, data: { supabaseUrl: url, environment: 'development', version: '0.1.0', maintenanceMode: false, urls: { publicConfig: `${url}/functions/v1/get-public-config`, fullConfig: `${url}/functions/v1/get-config` }, anonKey: `header.${Buffer.from(JSON.stringify({ role, exp: 9999999999 })).toString('base64url')}.signature` } });
test('accepts public config without copying or inspecting Docker keys', () => assert.equal(validatePublicConfig(config(), url).supabaseUrl, url));
test('rejects a localhost URL returned to a physical device', () => assert.throws(() => validatePublicConfig(config(), 'http://localhost:18000')));
test('rejects service-role keys and private fields', () => {
  assert.throws(() => validatePublicConfig(config('service_role'), url));
  const value = config(); value.data.apiKeys = { serviceKey: 'must-not-be-public' };
  assert.throws(() => validatePublicConfig(value, url));
});
test('rejects incomplete bootstrap instead of reporting success', () => assert.throws(() => validatePublicConfig({ success: false }, url)));

test('rejects invalid origins, expired keys, malformed shapes and private envelope fields', () => {
  for (const origin of ['ftp://localhost', 'http://user:pass@localhost', 'http://localhost/path', 'http://localhost?key=private', 'not a URL']) assert.throws(() => validatePublicConfig(config(), origin));
  for (const change of [ { maintenanceMode: 'false' }, { featureFlags: { printing: 'yes' } }, { urls: { publicConfig: 'http://other.example', fullConfig: url + '/functions/v1/get-config' } }, { anonKey: 'invalid' }, { anonKey: `header.${Buffer.from(JSON.stringify({ role: 'anon', exp: 1 })).toString('base64url')}.signature` } ]) assert.throws(() => validatePublicConfig({ success: true, data: { ...config().data, ...change } }, url));
  assert.throws(() => validatePublicConfig({ ...config(), debug: { JWT_SECRET: 'fixture-private-field' } }, url));
});
