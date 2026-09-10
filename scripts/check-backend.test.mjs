import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicConfig } from './check-backend.mjs';

const url = 'http://192.0.2.10:18000';
const config = (role = 'anon') => ({ success: true, data: { supabaseUrl: url, anonKey: `header.${Buffer.from(JSON.stringify({ role, exp: 9999999999 })).toString('base64url')}.signature` } });
test('accepts public config without copying or inspecting Docker keys', () => assert.equal(validatePublicConfig(config(), url).supabaseUrl, url));
test('rejects a localhost URL returned to a physical device', () => assert.throws(() => validatePublicConfig(config(), 'http://localhost:18000')));
test('rejects service-role keys and private fields', () => {
  assert.throws(() => validatePublicConfig(config('service_role'), url));
  const value = config(); value.data.apiKeys = { serviceKey: 'must-not-be-public' };
  assert.throws(() => validatePublicConfig(value, url));
});
test('rejects incomplete bootstrap instead of reporting success', () => assert.throws(() => validatePublicConfig({ success: false }, url)));
