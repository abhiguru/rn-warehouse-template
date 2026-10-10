import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Review 2026-10-10, M9-4: expo-updates, a runtime version, EAS channels and
// the in-app prompt are all in place, so one `updates.url` line would make
// every installed app run whatever is published to its channel. Remote code is
// off by an explicit setting, and may only be turned on signed.
export function updatesProblems(expo) {
  const updates = expo.updates;
  if (!updates || typeof updates !== 'object') return ['app.json has no "updates" block; say "enabled": false'];
  if (updates.enabled === false && updates.url === undefined) return [];
  const problems = [];
  if (typeof updates.codeSigningCertificate !== 'string' || !updates.codeSigningCertificate) problems.push('updates.codeSigningCertificate is required');
  if (!updates.codeSigningMetadata?.keyid || !updates.codeSigningMetadata?.alg) problems.push('updates.codeSigningMetadata needs keyid and alg');
  if (!['NEVER', 'ON_ERROR_RECOVERY'].includes(updates.checkAutomatically)) problems.push('updates.checkAutomatically must be NEVER or ON_ERROR_RECOVERY');
  return problems;
}

test('over-the-air updates are off in app.json, by an explicit setting', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.deepEqual(updatesProblems(expo), []);
  assert.deepEqual(expo.updates, { enabled: false });
});

test('turning updates on is refused without code signing and a manual check', () => {
  const url = 'https://u.expo.dev/00000000-0000-4000-8000-000000000000';
  const signed = { url, codeSigningCertificate: './certs/updates.pem', codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' }, checkAutomatically: 'ON_ERROR_RECOVERY' };
  assert.equal(updatesProblems({}).length, 1);
  assert.equal(updatesProblems({ updates: { url } }).length, 3);
  assert.equal(updatesProblems({ updates: { enabled: true } }).length, 3);
  // A url beside "enabled": false is one edit away from on, so it is held to the same rule.
  assert.equal(updatesProblems({ updates: { enabled: false, url } }).length, 3);
  assert.deepEqual(updatesProblems({ updates: signed }), []);
  assert.deepEqual(updatesProblems({ updates: { ...signed, checkAutomatically: 'ON_LOAD' } }), ['updates.checkAutomatically must be NEVER or ON_ERROR_RECOVERY']);
  assert.deepEqual(updatesProblems({ updates: { ...signed, codeSigningMetadata: { keyid: 'main' } } }), ['updates.codeSigningMetadata needs keyid and alg']);
});
