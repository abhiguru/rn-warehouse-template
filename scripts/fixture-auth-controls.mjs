import assert from 'node:assert/strict';
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
