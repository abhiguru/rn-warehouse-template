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
