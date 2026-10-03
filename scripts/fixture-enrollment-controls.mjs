import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
export function enrollmentConfig(c) {
 assert.equal(c.scope,'isolated-fictional-enrollment-approval');
 assert.equal(c.phone,'919888888874');assert.equal(c.profileName,'New customer');assert.equal(c.customerName,'Backend Test Customer A');
 assert.match(c.profileId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 assert.match(c.fixtureGuardSHA256,/^[a-f0-9]{64}$/);
 for(const k of ['soakConfig','caseDirectory','otpSocket','pendingEvidence']) assert.ok(isAbsolute(c[k]));
 return c;
}
export function approvalPrecondition(s,c) {
 enrollmentConfig(c);assert.equal(s.profile?.id,c.profileId);assert.equal(s.profile?.name,c.profileName);assert.equal(s.profile?.role,'customer');assert.equal(s.profile?.active,false);assert.equal(s.profile?.status,'pending');assert.deepEqual(s.targetSessions,[]);assert.equal(s.targetAssignments,0);
 assert.ok(s.customer?.id && s.customer.name===c.customerName && s.customer.active===true);
 assert.equal(s.admin?.name,'Core Demo Administrator');assert.equal(s.admin?.active,true);assert.equal(s.admin?.role,'admin');assert.ok(s.adminHourly<5 && s.adminDaily<20);
}
export function approvalPostcondition(before,after,c) {
 approvalPrecondition(before,c);assert.equal(after.profile.id,c.profileId);assert.equal(after.profile.name,c.profileName);assert.equal(after.profile.status,'approved');assert.equal(after.profile.active,true);assert.equal(after.targetAssignments,1);assert.deepEqual(after.targetSessions,[]);
 for(const k of ['businessHash','otherAuthHash','targetOTPs','customer']) assert.deepEqual(after[k],before[k]);
 assert.equal(after.adminOTPs,before.adminOTPs+1);assert.deepEqual(after.adminSessions,before.adminSessions);
}
