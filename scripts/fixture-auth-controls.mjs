import { staffFixtureArtifact } from './fixture-current-candidate.mjs';
import assert from 'node:assert/strict';
export function disabledAuthenticationMode(c, secondary, replacement) {
 if (Object.hasOwn(c, 'disabledAuthentication')) assert.equal(typeof c.disabledAuthentication, 'boolean');
 const enabled = c.disabledAuthentication === true;
 if (enabled) {
  assert.equal(secondary, false); assert.equal(replacement, false);
  assert.equal(c.phone, '919888888873'); assert.equal(c.profileName, 'Customer B');
  assert.equal(c.profileId, '34d9d337-ec2e-4bed-b555-0e8b63dd3aef');
  assert.equal(c.existingEnrollmentTokenCount, 1);
  assert.equal(c.role, 'customer'); assert.equal(c.expected, 'disabled');
  for (const key of ['pendingReadOnly', 'approvedEnrollmentExit', 'customerReadOnly', 'rejectedAuthentication']) assert.notEqual(c[key], true);
 }
 return enabled;
}
export function pendingReadOnlyMode(c,secondary,replacement) {
 if(Object.hasOwn(c,'pendingReadOnly')) assert.equal(typeof c.pendingReadOnly,'boolean');
 const enabled=c.pendingReadOnly===true;
 if(enabled) {assert.equal(replacement,false);assert.equal(secondary,false);assert.equal(c.phone,'919888888874');assert.equal(c.profileName,'New customer');assert.equal(c.expected,'pending');}
 return enabled;
}

export function approvedEnrollmentExitMode(c,secondary,replacement) {
 if(Object.hasOwn(c,'approvedEnrollmentExit')) assert.equal(typeof c.approvedEnrollmentExit,'boolean');
 const enabled=c.approvedEnrollmentExit===true;
 if(enabled) {assert.equal(c.pendingReadOnly===true,false);assert.equal(replacement,false);assert.equal(secondary,false);assert.equal(c.phone,'919888888874');assert.equal(c.profileName,'New customer');assert.equal(c.expected,'authenticated');}
 return enabled;
}

export function customerReadOnlyMode(c,secondary,replacement) {
 if(Object.hasOwn(c,'customerReadOnly')) assert.equal(typeof c.customerReadOnly,'boolean');
 const enabled=c.customerReadOnly===true;
 if(enabled) {assert.equal(c.pendingReadOnly===true,false);assert.equal(c.approvedEnrollmentExit===true,false);assert.equal(replacement,false);assert.equal(secondary,false);assert.equal(c.phone,'919888888874');assert.equal(c.profileName,'New customer');assert.equal(c.role,'customer');assert.equal(c.expected,'authenticated');assert.match(c.nativeSessionId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);}
 return enabled;
}

export function rejectedAuthenticationMode(c, secondary, replacement) {
 if (Object.hasOwn(c,'rejectedAuthentication')) assert.equal(typeof c.rejectedAuthentication,'boolean');
 const enabled=c.rejectedAuthentication===true;
 if(enabled){
  assert.equal(secondary,false);assert.equal(replacement,false);
  assert.equal(c.phone,'919888888873');assert.equal(c.profileName,'Customer B');
  assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');
  assert.equal(c.role,'customer');assert.equal(c.expected,'rejected');
  assert.equal(c.existingEnrollmentTokenCount,1);
  for(const key of ['pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication']) assert.notEqual(c[key],true);
 }
 return enabled;
}

export function approvedBAuthenticationMode(c,secondary,replacement){
 if(Object.hasOwn(c,'customerBApprovedAuthentication'))assert.equal(typeof c.customerBApprovedAuthentication,'boolean');const enabled=c.customerBApprovedAuthentication===true;
 if(!secondary&&!replacement&&c.phone==='919888888873'&&c.expected==='authenticated')assert.equal(enabled,true,'FIXED_APPROVED_B_MODE_REQUIRED');
 if(enabled){assert.equal(secondary,false);assert.equal(replacement,false);assert.equal(c.kind,'native-approved-customer-b-login');assert.equal(c.phone,'919888888873');assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.profileName,'Customer B');assert.equal(c.customerId,'a8246002-bdb6-11f1-b1bf-07b1deb5bca2');assert.equal(c.role,'customer');assert.equal(c.expected,'authenticated');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');for(const k of ['pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication','rejectedAuthentication'])assert.notEqual(c[k],true);}
 return enabled;
}
export function approvedBAuthenticationBefore(c,s){
 assert.equal(approvedBAuthenticationMode(c,false,false),true);assert.deepEqual(s.profile,{id:c.profileId,name:'Customer B',role:'customer',active:true,status:'approved'});assert.deepEqual(s.sessions,[]);
 assert.deepEqual(s.targetAssignments,[{userProfileId:c.profileId,customerId:c.customerId,active:true}]);for(const k of ['businessHash','otherAuthHash','profileStaticHash','enrollmentHash'])assert.match(s[k],/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(s.enrollmentTokenCount)&&s.enrollmentTokenCount>=0);assert.ok(Number.isSafeInteger(s.otpVerified)&&s.otpVerified>=0);
 for(const k of ['hourly','daily'])assert.ok(Number.isSafeInteger(s.quota?.[k]??0)&&(s.quota?.[k]??0)>=0);assert.ok((s.quota?.hourly??0)<5&&(s.quota?.daily??0)<20,'ORDINARY_AUTH_QUOTA_EXHAUSTED');
}
export function approvedBAuthenticationAfter(c,b,a){
 approvedBAuthenticationBefore(c,b);for(const k of ['profile','businessHash','otherAuthHash','profileStaticHash','enrollmentHash','enrollmentTokenCount','targetAssignments'])assert.deepEqual(a[k],b[k]);assert.equal(a.otpVerified,b.otpVerified+1);assert.equal(a.quota.hourly,(b.quota?.hourly??0)+1);assert.equal(a.quota.daily,(b.quota?.daily??0)+1);assert.equal(a.sessions.length,1);const row=a.sessions[0];assert.match(row.id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);assert.match(row.rowSHA256,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(row.created))&&Number.isFinite(Date.parse(row.expires))&&Date.parse(row.expires)>Date.parse(row.created));return row.id;
}

export function approvedAAuthenticationMode(c,secondary,replacement) {
 if(Object.hasOwn(c,'customerAApprovedAuthentication')) assert.equal(typeof c.customerAApprovedAuthentication,'boolean');
 const enabled=c.customerAApprovedAuthentication===true;
 if(!secondary&&!replacement&&c.phone==='919888888872'&&c.expected==='authenticated'&&c.genuineAReadOnly!==true) assert.equal(enabled,true,'FIXED_APPROVED_A_MODE_REQUIRED');
 if(enabled) {
  assert.equal(secondary,false);assert.equal(replacement,false);
  assert.equal(c.kind,'native-approved-customer-a-login');assert.equal(c.phone,'919888888872');
  assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');assert.equal(c.profileName,'Customer A');
  assert.equal(c.customerId,'a823809c-bdb6-11f1-b1be-47a66d90b06d');assert.equal(c.role,'customer');assert.equal(c.expected,'authenticated');
  assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
  for(const k of ['pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication','rejectedAuthentication','customerBApprovedAuthentication','confirmedDraftDestinationAuthentication']) assert.notEqual(c[k],true);
 }
 return enabled;
}
export function approvedAAuthenticationBefore(c,s) {
 assert.equal(approvedAAuthenticationMode(c,false,false),true);
 assert.deepEqual(s.profile,{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'});
 assert.deepEqual(s.targetAssignments,[{userProfileId:c.profileId,customerId:c.customerId,active:true}]);
 assert.ok(Array.isArray(s.sessions));assert.equal(new Set(s.sessions.map(x=>x.id)).size,s.sessions.length);
 for(const row of s.sessions){assert.match(row.id,/^[a-f0-9-]{36}$/);assert.match(row.rowSHA256,/^[a-f0-9]{64}$/);}
 for(const k of ['businessHash','otherAuthHash','profileStaticHash','enrollmentHash','usersHash','consumedHash','authConfigHash'])assert.match(s[k],/^[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(s.otpVerified)&&s.otpVerified>=0);
 for(const k of ['hourly','daily'])assert.ok(Number.isSafeInteger(s.quota?.[k]??0)&&(s.quota?.[k]??0)>=0);
 assert.ok((s.quota?.hourly??0)<5&&(s.quota?.daily??0)<20,'ORDINARY_AUTH_QUOTA_EXHAUSTED');
}
export function approvedAAuthenticationAfter(c,b,a) {
 approvedAAuthenticationBefore(c,b);
 for(const k of ['profile','targetAssignments','businessHash','otherAuthHash','profileStaticHash','enrollmentHash','enrollmentTokenCount','usersHash','consumedHash','authConfigHash'])assert.deepEqual(a[k],b[k]);
 assert.equal(a.otpVerified,b.otpVerified+1);assert.equal(a.quota.hourly,(b.quota?.hourly??0)+1);assert.equal(a.quota.daily,(b.quota?.daily??0)+1);
 for(const old of b.sessions)assert.deepEqual(a.sessions.find(x=>x.id===old.id),old,'EXISTING_SESSION_CHANGED');
 const added=a.sessions.filter(x=>!b.sessions.some(old=>old.id===x.id));assert.equal(a.sessions.length,b.sessions.length+1);assert.equal(added.length,1);
 const row=added[0];assert.match(row.id,/^[a-f0-9-]{36}$/);assert.match(row.rowSHA256,/^[a-f0-9]{64}$/);
 assert.ok(Number.isFinite(Date.parse(row.created))&&Number.isFinite(Date.parse(row.expires))&&Date.parse(row.expires)>Date.parse(row.created));return row.id;
}

export function genuineAReadOnlyMode(c,secondary,replacement){
 if(Object.hasOwn(c,'genuineAReadOnly'))assert.equal(typeof c.genuineAReadOnly,'boolean');
 const enabled=c.genuineAReadOnly===true;
 if(enabled){
  approvedAAuthenticationMode({...c,customerAApprovedAuthentication:true,kind:'native-approved-customer-a-login'},secondary,replacement);
  assert.equal(c.kind,'native-genuine-a-read-controls');assert.notEqual(c.customerAApprovedAuthentication,true);assert.equal(c.noAutomaticRetry,true);
  assert.match(c.nativeSessionId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
 }
 return enabled;
}

export function currentStaffAuthenticationMode(c,secondary,replacement){
 if(Object.hasOwn(c,'currentStaffAuthentication'))assert.equal(typeof c.currentStaffAuthentication,'boolean');
 const enabled=c.currentStaffAuthentication===true;
 if(enabled){
  assert.equal(secondary,false);assert.equal(replacement,false);assert.equal(c.kind,'native-current-staff-login');assert.equal(c.phone,'919888888874');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');assert.equal(c.role,'staff');assert.equal(c.expected,'authenticated');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');assert.equal(c.noAutomaticRetry,true);staffFixtureArtifact(c);
  for(const k of ['pendingReadOnly','approvedEnrollmentExit','customerReadOnly','disabledAuthentication','rejectedAuthentication','customerAApprovedAuthentication','customerBApprovedAuthentication','genuineAReadOnly','confirmedDraftDestinationAuthentication'])assert.notEqual(c[k],true);
 }
 return enabled;
}
export function currentStaffAuthenticationBefore(c,s){
 assert.equal(currentStaffAuthenticationMode(c,false,false),true);assert.deepEqual(s.profile,{id:c.profileId,name:c.profileName,role:'staff',active:true,status:'approved'});assert.deepEqual(s.sessions,[]);assert.ok((s.quota?.hourly??0)<5&&(s.quota?.daily??0)<20,'ORDINARY_AUTH_QUOTA_EXHAUSTED');
}
export function currentStaffAuthenticationAfter(c,b,a){
 currentStaffAuthenticationBefore(c,b);
 for(const k of ['profile','profileStaticHash','businessHash','otherAuthHash','targetAssignments','enrollmentHash','enrollmentTokenCount','usersHash','consumedHash','authConfigHash'])assert.deepEqual(a[k],b[k]);
 assert.equal(a.otpVerified,b.otpVerified+1);assert.equal(a.quota.hourly,(b.quota?.hourly??0)+1);assert.equal(a.quota.daily,(b.quota?.daily??0)+1);assert.equal(a.sessions.length,1);assert.match(a.sessions[0].id,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(a.sessions[0].rowSHA256,/^[a-f0-9]{64}$/);return a.sessions[0].id;
}
