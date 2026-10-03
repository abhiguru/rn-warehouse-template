import assert from 'node:assert/strict';
import { CURRENT_FIXTURE_SHA256, staffFixtureArtifact } from './fixture-current-candidate.mjs';
export function currentAdministratorMode(c, secondary, replacement) {
  if (Object.hasOwn(c, 'currentAdministratorAuthentication')) assert.equal(typeof c.currentAdministratorAuthentication, 'boolean');
  if (c.currentAdministratorAuthentication !== true) return false;
  assert.equal(secondary, false); assert.equal(replacement, false);
  assert.equal(c.kind, 'native-current-administrator-login');
  assert.equal(c.phone, '919888888871');
  assert.equal(c.profileId, 'f94caa4f-0051-4660-920a-5f41aac86fa7');
  assert.equal(c.profileName, 'Core Demo Administrator');
  assert.equal(c.role, 'admin'); assert.equal(c.expected, 'authenticated');
  assert.equal(c.noAutomaticRetry, true); assert.ok([1, 2, 3].includes(c.nativeAttempt));
  assert.equal(c.artifactSHA256, CURRENT_FIXTURE_SHA256); staffFixtureArtifact(c);
  for (const key of ['currentStaffAuthentication','pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication','rejectedAuthentication','customerAApprovedAuthentication','customerBApprovedAuthentication','genuineAReadOnly','confirmedDraftDestinationAuthentication']) assert.notEqual(c[key], true);
  return true;
}
export function currentAdministratorBefore(c, s) {
  assert.equal(currentAdministratorMode(c, false, false), true);
  assert.deepEqual(s.profile, {id:c.profileId,name:c.profileName,role:'admin',active:true,status:'approved'});
  assert.ok(Array.isArray(s.sessions)); assert.equal(new Set(s.sessions.map(x=>x.id)).size, s.sessions.length);
  for (const row of s.sessions) { assert.match(row.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/); assert.match(row.rowSHA256,/^[a-f0-9]{64}$/); }
  assert.ok((s.quota?.hourly??0)<5 && (s.quota?.daily??0)<20, 'ORDINARY_AUTH_QUOTA_EXHAUSTED');
}
export function currentAdministratorAfter(c, b, a) {
  currentAdministratorBefore(c, b);
  for (const key of ['profile','profileStaticHash','businessHash','otherAuthHash','targetAssignments','enrollmentHash','enrollmentTokenCount','usersHash','consumedHash','authConfigHash']) assert.deepEqual(a[key],b[key]);
  assert.equal(a.otpVerified,b.otpVerified+1);
  assert.equal(a.quota.hourly,(b.quota?.hourly??0)+1); assert.equal(a.quota.daily,(b.quota?.daily??0)+1);
  assert.deepEqual(a.sessions.filter(x=>b.sessions.some(y=>y.id===x.id)),b.sessions,'EXISTING_ADMINISTRATOR_SESSIONS_CHANGED');
  const added=a.sessions.filter(x=>!b.sessions.some(y=>y.id===x.id));assert.equal(added.length,1);
  assert.equal(a.sessions.length,b.sessions.length+1);assert.match(added[0].rowSHA256,/^[a-f0-9]{64}$/);
  return added[0].id;
}
