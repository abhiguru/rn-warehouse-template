import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function revocationConfig(c) {
 assert.equal(c.scope,'isolated-fictional-native-revocation');
 assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');assert.equal(c.phone,'919888888874');
 assert.equal(c.adminProfileId,'f94caa4f-0051-4660-920a-5f41aac86fa7');assert.equal(c.adminPhone,'919888888871');
 assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');assert.match(c.sessionId,uuid);
 for(const key of ['soakConfig','caseDirectory','otpSocket'])assert.ok(isAbsolute(c[key]));
 assert.ok(!Object.hasOwn(c,'adminSessionFile'),'No token files permitted');return c;
}
export function revocationBefore(c,s) {
 revocationConfig(c);assert.deepEqual(s.profile,{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'});
 assert.ok(s.targetSessions.some(x=>x.id===c.sessionId&&x.expired===false),'Actual native session required');
 assert.ok(s.assignments.length>0&&s.assignments.every(x=>x.active===true),'Existing assigned reserved customer required');
 assert.equal(s.admin.id,c.adminProfileId);assert.equal(s.admin.role,'admin');assert.equal(s.admin.active,true);
 assert.ok(Number.isSafeInteger(s.adminQuota.hourly)&&s.adminQuota.hourly>=0&&s.adminQuota.hourly<5);
 assert.ok(Number.isSafeInteger(s.adminQuota.daily)&&s.adminQuota.daily>=0&&s.adminQuota.daily<20,'Natural administrator quota required');
 for(const key of ['businessHash','otherAuthHash','adminStaticHash'])assert.match(s[key],/^[a-f0-9]{64}$/);
}
export function revocationAfterLogin(c,before,after) {
 revocationBefore(c,before);
 for(const key of ['profile','targetSessions','assignments','admin','adminStaticHash','businessHash','otherAuthHash','targetOTPCount'])assert.deepEqual(after[key],before[key]);
 assert.equal(after.adminOTPCount,before.adminOTPCount+1);
 assert.equal(after.adminQuota.hourly,before.adminQuota.hourly+1);assert.equal(after.adminQuota.daily,before.adminQuota.daily+1);
 for(const old of before.adminSessions)assert.deepEqual(after.adminSessions.find(x=>x.id===old.id),old,'Old administrator sessions preserved');
 const added=after.adminSessions.filter(x=>!before.adminSessions.some(y=>y.id===x.id));assert.equal(added.length,1);assert.match(added[0].id,uuid);return added[0].id;
}
export function revocationAfterDisable(c,baseline,after) {
 revocationConfig(c);assert.deepEqual(after.profile,{...baseline.profile,active:false,status:'disabled'});assert.deepEqual(after.targetSessions,[]);
 assert.deepEqual(after.assignments,baseline.assignments.map(x=>({...x,active:false})),'Keep assignment rows and metadata');
 for(const key of ['admin','adminStaticHash','adminSessions','adminQuota','adminOTPCount','targetOTPCount','businessHash','otherAuthHash'])assert.deepEqual(after[key],baseline[key],'Unexpected disable side effect');
}
export function revocationAfterAdminLogout(c,disabled,after,sessionId) {
 revocationConfig(c);assert.match(sessionId,uuid);assert.equal(disabled.adminSessions.filter(x=>x.id===sessionId).length,1);
 assert.deepEqual(after,{...disabled,adminSessions:disabled.adminSessions.filter(x=>x.id!==sessionId)},'Only the new administrator session may be logged out');
}
