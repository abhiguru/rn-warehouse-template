import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noActiveRuns, completedSoak, assertReleased, privateJSON, caseConfig,
  sessionPrecondition, sessionPostcondition } from './fixture-session-guards.mjs';
const hash = 'a'.repeat(64);
const ids = [...Array.from({ length: 9 }, (_, n) => `soak-${String(n + 1).padStart(2, '0')}`), 'final-native-session-business-reconciliation'];
const goodLedger = () => ({ schema: 1, planSHA256: hash, steps: ids.map(id => ({ id, status: 'PASS' })),
  checks: ids.map(id => ({ label: `after-${id}`, status: 'PASS' })) });
const before = () => ({ profile: { id: 'fictional', role: 'customer', active: true, enrollment_status: 'approved' },
  sessions: [{ id: 'native', expired: false }], otherAuthHash: 'unchanged-other-users', businessHash: 'unchanged-business', otpCount: 2 });
const after = () => ({ ...before(), profile: { ...before().profile, active: false, enrollment_status: 'disabled' }, sessions: [] });

test('active, starting or stopping fixture actors block session actions', () => {
  for (const role of ['overnight', 'prepare', 'autostart', 'final-gates'])
    for (const active of ['active', 'activating', 'deactivating', 'reloading'])
      assert.throws(() => noActiveRuns([{ unit: `warehouse-fixture-${role}-owned.service`, active }]), /ACTIVE_FIXTURE_RUN/);
  noActiveRuns([{ unit: 'warehouse-fixture-overnight-owned.service', active: 'inactive' }]);
  assert.throws(() => noActiveRuns(null));
  assert.throws(() => noActiveRuns([{}]));
  assert.throws(() => noActiveRuns([{ unit: 'warehouse-fixture-overnight-owned.service', active: 'unknown' }]));
});
test('nine blocks without the final aggregate or successful postconditions cannot release the emulator', () => {
  completedSoak(goodLedger(), hash);
  for (const status of ['RUNNING', 'VERIFYING', 'FAIL', 'TIMEOUT', 'INTERRUPTED']) {
    const ledger = goodLedger(); ledger.steps[4].status = status;
    assert.throws(() => completedSoak(ledger, hash));
  }
  const missing = goodLedger(); missing.steps.pop(); assert.throws(() => completedSoak(missing, hash));
  const unverified = goodLedger(); unverified.checks.pop(); assert.throws(() => completedSoak(unverified, hash));
  assert.throws(() => completedSoak(goodLedger(), 'b'.repeat(64)));
});
test('live actor rejection occurs before ledger access or any second external command', () => {
  let calls = 0;
  assert.throws(() => assertReleased({ priorRunLedger: '/does-not-exist' }, () => {
    calls++; return { status: 0, stdout: JSON.stringify([{ unit: 'warehouse-fixture-overnight-live.service', active: 'active' }]) };
  }), /ACTIVE_FIXTURE_RUN/);
  assert.equal(calls, 1);
});
test('private config rejects world-readable inputs and symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-session-guard-')); chmodSync(dir, 0o700);
  try {
    const path = join(dir, 'input.json'); writeFileSync(path, '{}', { mode: 0o600 });
    assert.deepEqual(privateJSON(path), {});
    chmodSync(path, 0o644); assert.throws(() => privateJSON(path)); chmodSync(path, 0o600);
    const link = join(dir, 'link.json'); symlinkSync(path, link); assert.throws(() => privateJSON(link));
    const base = { scope: 'isolated-fictional-session-case', case: 'revoked', backendCheckout: dir, backendState: dir,
      soakConfig: path, caseDirectory: join(dir, 'case'), fixtureGuardSHA256: hash,
      profileId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002',
      phone: '919888888874', profileName: 'Session Rehearsal Customer' };
    writeFileSync(path, JSON.stringify(base)); assert.equal(caseConfig(path).phone, base.phone);
    for (const phone of ['919888888871', '919888888872', '919888888873']) {
      writeFileSync(path, JSON.stringify({ ...base, phone })); assert.throws(() => caseConfig(path));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('natural refresh expiry is required; existing healthy sessions are never shortened', () => {
  sessionPrecondition(before(), 'revoked', 'native');
  assert.throws(() => sessionPrecondition(before(), 'expired', 'native'), /REFRESH_NOT_EXPIRED/);
  const expired = before(); expired.sessions[0].expired = true;
  sessionPrecondition(expired, 'expired', 'native');
  assert.throws(() => sessionPrecondition(expired, 'revoked', 'native'));
  assert.throws(() => sessionPrecondition(before(), 'revoked', 'other-native'));
  const ambiguous = before(); ambiguous.sessions.push({ id: 'second', expired: false });
  assert.throws(() => sessionPrecondition(ambiguous, 'revoked', 'native'));
});
test('revocation must remove sessions and preserve other accounts, business data and OTP count', () => {
  sessionPostcondition(before(), after(), 'revoked', 'native');
  for (const key of ['otherAuthHash', 'businessHash', 'otpCount']) {
    const changed = after(); changed[key] = 'changed';
    assert.throws(() => sessionPostcondition(before(), changed, 'revoked', 'native'));
  }
  assert.throws(() => sessionPostcondition(before(), before(), 'revoked', 'native'));
  assert.throws(() => sessionPostcondition(before(), { ...after(), sessions: before().sessions }, 'revoked', 'native'));
});
test('expired-session observation permits ordinary logout cleanup but rejects replacement sessions', () => {
  const expired = before(); expired.sessions[0].expired = true;
  sessionPostcondition(expired, expired, 'expired', 'native');
  sessionPostcondition(expired, { ...expired, sessions: [] }, 'expired', 'native');
  assert.throws(() => sessionPostcondition(expired, { ...expired, sessions: [{ id: 'new', expired: false }] }, 'expired', 'native'));
});

test('a vanished or stopped unit still needs the complete matching PASS ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-session-release-')); chmodSync(dir, 0o700);
  try {
    const path = join(dir, 'ledger.json'); writeFileSync(path, JSON.stringify(goodLedger()), { mode: 0o600 });
    const config = { priorRunUnit: 'warehouse-fixture-overnight-completed.service', priorRunLedger: path, priorPlanSHA256: hash };
    const execute = state => (_command, args) => ({ status: 0, stdout: args.includes('list-units') ? '[]' : state });
    for (const state of ['LoadState=not-found\nActiveState=inactive\nResult=success',
      'LoadState=loaded\nActiveState=inactive\nResult=success']) assertReleased(config, execute(state));
    assert.throws(() => assertReleased(config, execute('LoadState=loaded\nActiveState=failed\nResult=exit-code')));
    const partial = goodLedger(); partial.steps.pop(); writeFileSync(path, JSON.stringify(partial));
    assert.throws(() => assertReleased(config, execute('LoadState=not-found\nActiveState=inactive\nResult=success')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
