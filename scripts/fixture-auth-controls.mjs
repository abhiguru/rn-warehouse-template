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
