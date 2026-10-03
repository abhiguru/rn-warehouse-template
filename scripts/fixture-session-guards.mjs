// Additional guards for disruptive native session checks after a completed soak.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export function privateJSON(path) {
  assert.ok(isAbsolute(path) && realpathSync(path) === resolve(path), 'PRIVATE_PATH_REQUIRED');
  for (const name of [path, dirname(path)]) {
    const st = lstatSync(name);
    assert.ok(!st.isSymbolicLink() && st.uid === process.getuid() && (st.mode & 0o077) === 0,
      'PRIVATE_OWNERSHIP_REQUIRED');
  }
  assert.ok(lstatSync(path).isFile() && lstatSync(path).size < 1024 * 1024, 'PRIVATE_FILE_REQUIRED');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function noActiveRuns(units) {
  assert.ok(Array.isArray(units), 'UNIT_INVENTORY_REQUIRED');
  assert.ok(units.every(u => typeof u?.unit === 'string' && typeof u?.active === 'string'), 'UNIT_INVENTORY_REQUIRED');
  assert.ok(!units.some(u => /^warehouse-fixture-(overnight|prepare|autostart|final-gates)-/.test(u.unit)
    && !['inactive', 'failed'].includes(u.active)), 'ACTIVE_FIXTURE_RUN');
}

export function completedSoak(ledger, expectedHash) {
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  assert.equal(ledger.schema, 1, 'SOAK_SCHEMA_REQUIRED');
  assert.equal(ledger.planSHA256, expectedHash, 'SOAK_PLAN_MISMATCH');
  const ids = Array.from({ length: 9 }, (_, n) => `soak-${String(n + 1).padStart(2, '0')}`);
  ids.push('final-native-session-business-reconciliation');
  assert.deepEqual(ledger.steps?.map(s => s.id), ids, 'COMPLETE_SOAK_REQUIRED');
  assert.ok(ledger.steps.every(s => s.status === 'PASS'), 'SOAK_NOT_PASS');
  assert.ok(ledger.checks?.length && ledger.checks.every(s => s.status === 'PASS'), 'SOAK_VERIFY_REQUIRED');
  // The plan writes a PASS postcondition row after each successful run.
  for (const id of ids) assert.ok(ledger.checks.some(s => s.label === `after-${id}` && s.status === 'PASS'),
    'SOAK_POSTCONDITION_REQUIRED');
}

export function assertReleased(c, execute = spawnSync) {
  const list = execute('systemctl', ['--user', 'list-units', '--all', '--type=service', '--output=json', '--no-pager'],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(list.status, 0, 'UNIT_INVENTORY_FAILED');
  noActiveRuns(JSON.parse(list.stdout));
  assert.match(c.priorRunUnit, /^warehouse-fixture-overnight-[a-z0-9][a-z0-9-]{0,39}\.service$/);
  const shown = execute('systemctl', ['--user', 'show', c.priorRunUnit,
    '--property=LoadState,ActiveState,Result'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(shown.status, 0, 'RUN_STATUS_FAILED');
  const props = Object.fromEntries(shown.stdout.trim().split('\n').map(s => s.split('=')));
  assert.ok(props.LoadState === 'not-found' || (props.ActiveState === 'inactive' && props.Result === 'success'),
    'RUN_NOT_RELEASED');
  completedSoak(privateJSON(c.priorRunLedger), c.priorPlanSHA256);
}

export function caseConfig(path) {
  const c = privateJSON(path);
  assert.equal(c.scope, 'isolated-fictional-session-case');
  assert.ok(['revoked', 'expired'].includes(c.case), 'SESSION_CASE_REQUIRED');
  for (const name of ['backendCheckout', 'backendState', 'soakConfig', 'caseDirectory']) assert.ok(isAbsolute(c[name]));
  for (const name of ['profileId', 'sessionId']) assert.match(c[name], /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.match(c.fixtureGuardSHA256, /^[a-f0-9]{64}$/);
  // Reserve an account never used by the administrator soak or core A/B fixtures.
  assert.equal(c.phone, '919888888874');
  assert.equal(c.profileName, 'Session Rehearsal Customer');
  return c;
}

export function sessionPrecondition(snapshot, kind, sessionId) {
  assert.equal(snapshot.profile?.role, 'customer', 'CUSTOMER_REQUIRED');
  assert.equal(snapshot.profile?.active, true, 'ACTIVE_CUSTOMER_REQUIRED');
  assert.equal(snapshot.profile?.enrollment_status, 'approved', 'APPROVED_CUSTOMER_REQUIRED');
  assert.equal(snapshot.sessions.length, 1, 'ONE_NATIVE_SESSION_REQUIRED');
  assert.equal(snapshot.sessions[0].id, sessionId, 'NATIVE_SESSION_MISMATCH');
  assert.equal(snapshot.sessions[0].expired, kind === 'expired',
    kind === 'expired' ? 'REFRESH_NOT_EXPIRED' : 'UNEXPIRED_SESSION_REQUIRED');
}

export function sessionPostcondition(before, after, kind, sessionId) {
  assert.equal(after.otherAuthHash, before.otherAuthHash, 'OTHER_ACCOUNTS_CHANGED');
  assert.equal(after.businessHash, before.businessHash, 'BUSINESS_DATA_CHANGED');
  assert.equal(after.otpCount, before.otpCount, 'NEW_OTP_REQUEST');
  assert.equal(after.profile.id, before.profile.id, 'PROFILE_CHANGED');
  if (kind === 'revoked') {
    assert.equal(after.profile.active, false, 'DISABLE_NOT_CONFIRMED');
    assert.equal(after.profile.enrollment_status, 'disabled', 'DISABLE_NOT_CONFIRMED');
    assert.equal(after.sessions.length, 0, 'SESSIONS_NOT_REVOKED');
  } else {
    assert.ok(after.sessions.length <= 1 && after.sessions.every(s => s.id === sessionId && s.expired === true),
      'EXPIRED_SESSION_REPLACED');
    assert.deepEqual(after.profile, before.profile, 'EXPIRED_PROFILE_CHANGED');
  }
}
