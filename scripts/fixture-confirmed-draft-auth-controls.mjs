import assert from 'node:assert/strict';
import {confirmedDraftReconcile} from './fixture-confirmed-draft-controls.mjs';
export function confirmedDraftAuthMode(c,secondary,replacement){
 if(Object.hasOwn(c,'confirmedDraftDestinationAuthentication'))assert.equal(typeof c.confirmedDraftDestinationAuthentication,'boolean');
 const enabled=c.confirmedDraftDestinationAuthentication===true;if(!enabled)return false;
 assert.equal(secondary,true);assert.equal(replacement,false);
 assert.equal(c.origin,'https://backend-switch.example.test');assert.equal(c.instanceId,'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
 assert.equal(c.phone,'919888888881');assert.equal(c.profileName,'Switch Demo Administrator');assert.equal(c.profileId,'8f5c3a24-ae9f-4cc8-952f-e42cfb5ddd29');
 assert.equal(c.role,'admin');assert.equal(c.expected,'authenticated');assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
 assert.ok(['customer','grn','dispatch','invoice'].includes(c.confirmedDraftKind));
 assert.ok(Number.isSafeInteger(c.expectedProcessPID)&&c.expectedProcessPID>0);
 for(const key of ['pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication','rejectedAuthentication','customerBApprovedAuthentication'])assert.notEqual(c[key],true);
 return true;
}
export function confirmedDraftAuthBefore(c,s){
 assert.equal(confirmedDraftAuthMode(c,true,false),true);
 assert.deepEqual(s.profile,{id:c.profileId,name:c.profileName,role:'admin',active:true,status:'approved'});
 assert.ok(Array.isArray(s.sessions));
 for(const key of ['businessHash','otherAuthHash','profileStaticHash','enrollmentHash','usersHash','consumedHash','authConfigHash'])assert.match(s[key],/^[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(s.otpVerified)&&s.otpVerified>=0);
 for(const key of ['hourly','daily'])assert.ok(Number.isSafeInteger(s.quota?.[key]??0)&&(s.quota?.[key]??0)>=0);
 assert.ok((s.quota?.hourly??0)<5&&(s.quota?.daily??0)<20,'ORDINARY_AUTH_QUOTA_EXHAUSTED');
}
export function confirmedDraftAuthAfter(c,b,a){
 confirmedDraftAuthBefore(c,b);
 for(const key of ['profile','businessHash','otherAuthHash','profileStaticHash','enrollmentHash','enrollmentTokenCount','targetAssignments','usersHash','consumedHash','authConfigHash'])assert.deepEqual(a[key],b[key],'UNRELATED_DESTINATION_AUTH_STATE_CHANGED');
 assert.equal(a.otpVerified,b.otpVerified+1);
 assert.equal(a.quota.hourly,(b.quota?.hourly??0)+1);assert.equal(a.quota.daily,(b.quota?.daily??0)+1);
 assert.equal(a.sessions.length,b.sessions.length+1);
 for(const row of b.sessions)assert.deepEqual(a.sessions.find(s=>s.id===row.id),row,'EXISTING_SESSION_CHANGED');
 const added=a.sessions.filter(row=>!b.sessions.some(s=>s.id===row.id));assert.equal(added.length,1);
 assert.match(added[0].id,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(added[0].rowSHA256,/^[a-f0-9]{64}$/);
 assert.ok(Number.isFinite(Date.parse(added[0].created))&&Number.isFinite(Date.parse(added[0].expires)));
 assert.equal(Date.parse(added[0].expires)-Date.parse(added[0].created),7*86400000,'ORDINARY_FIXED_SESSION_EXPIRY_REQUIRED');
 return added[0].id;
}

export function reconciledObservationFailure(c,confirmed,before,proof,native){
 assert.equal(c.confirmedObservationRecovery,true);
 assert.equal(native.status,'FAIL');assert.equal(native.exceptionType,'AssertionError');
 assert.equal(proof.diagnosticOnly,true);assert.equal(proof.originalAttemptStatus,'FAIL');
 assert.equal(proof.configSHA256,c.confirmedCaseSHA256);assert.equal(before.configSHA256,c.confirmedCaseSHA256);
 assert.equal(native.configSHA256,c.confirmedCaseSHA256);
 const events=proof.events;assert.ok(Array.isArray(events.source)&&Array.isArray(events.destination));
 for(const rows of Object.values(events))for(const e of rows){assert.equal(typeof e.authorizationPresent,'boolean');assert.equal(typeof e.credentialQueryPresent,'boolean');}
 const logout=events.source.filter(e=>e.path==='/rest/v1/rpc/logout_session');assert.equal(logout.length,1);assert.equal(logout[0].event,'complete');assert.equal(logout[0].method,'POST');
 const result=confirmedDraftReconcile(confirmed,before.snapshot,proof.snapshot,{...native,sourceLogoutCompletions:1,sourceLogoutStatus:logout[0].status,destinationAuthenticatedRequests:events.destination.filter(e=>e.authorizationPresent||e.credentialQueryPresent).length});
 assert.deepEqual(proof.result,result);return result;
}
