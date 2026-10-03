import { staffFixtureArtifact } from './fixture-current-candidate.mjs';
import assert from 'node:assert/strict';
export function rolePreparation(c){assert.equal(c.scope,'isolated-fictional-role-preparation');assert.equal(c.phone,'919888888874');assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');const roles={'prepare-staff':{before:'customer',after:'staff'},'restore-customer':{before:'staff',after:'customer'},'prepare-supervisor':{before:'customer',after:'supervisor'},'restore-supervisor-customer':{before:'supervisor',after:'customer'},'prepare-supervisor-staff':{before:'supervisor',after:'staff'},'restore-staff-supervisor':{before:'staff',after:'supervisor'}};assert.ok(Object.hasOwn(roles,c.action));if(['prepare-supervisor-staff','restore-staff-supervisor'].includes(c.action)){assert.equal(c.currentStaffControls,true);staffFixtureArtifact(c);assert.equal(c.noAutomaticRetry,true);}return roles[c.action];}
export function roleBefore(c,s){const roles=rolePreparation(c);for(const key of ['targetOtherFieldsHash','targetAssignmentsHash','otherAuthHash','businessHash'])assert.match(s[key],/^[a-f0-9]{64}$/);for(const key of ['adminHourly','adminDaily','targetOTPs','adminOTPs'])assert.ok(Number.isSafeInteger(s[key])&&s[key]>=0);roleSessionRecords(s.adminSessions);assert.deepEqual(s.target,{id:c.profileId,name:c.profileName,role:roles.before,active:true,status:'approved'});assert.deepEqual(s.targetSessions,[]);assert.ok(s.adminHourly<5&&s.adminDaily<20);assert.equal(s.admin.active,true);assert.equal(s.admin.role,'admin');}
export function roleAfter(c,b,a){roleBefore(c,b);const roles=rolePreparation(c);assert.deepEqual(a.target,{...b.target,role:roles.after});for(const key of ['targetSessions','targetOtherFieldsHash','targetAssignmentsHash','otherAuthHash','businessHash','admin','adminSessions','targetOTPs'])assert.deepEqual(a[key],b[key]);assert.equal(a.adminOTPs,b.adminOTPs+1);}

export function roleAuthenticated(c,b,a){
 roleBefore(c,b);for(const key of ['target','targetSessions','targetOtherFieldsHash','targetAssignmentsHash','otherAuthHash','businessHash','admin','targetOTPs'])assert.deepEqual(a[key],b[key]);
 assert.equal(a.adminOTPs,b.adminOTPs+1);roleSessionRecords(a.adminSessions);
 const old=new Set(b.adminSessions.map(x=>x.id));assert.equal(old.size,b.adminSessions.length);assert.equal(new Set(a.adminSessions.map(x=>x.id)).size,a.adminSessions.length);
 assert.deepEqual(a.adminSessions.filter(x=>old.has(x.id)),b.adminSessions);const fresh=a.adminSessions.filter(x=>!old.has(x.id));assert.equal(fresh.length,1);return fresh[0].id;
}
export function roleCommitted(c,b,authenticated,committed){
 const sessionId=roleAuthenticated(c,b,authenticated);const roles=rolePreparation(c);
 assert.deepEqual(committed.target,{...b.target,role:roles.after});
 for(const key of ['targetSessions','targetOtherFieldsHash','targetAssignmentsHash','otherAuthHash','businessHash','admin','adminSessions','targetOTPs','adminOTPs'])assert.deepEqual(committed[key],authenticated[key]);
 return sessionId;
}

export function roleSessionRecords(rows){
 assert.ok(Array.isArray(rows));const ids=new Set();
 for(const row of rows){assert.match(row.id,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);assert.ok(!ids.has(row.id));ids.add(row.id);assert.match(row.rowSHA256,/^[a-f0-9]{64}$/);assert.ok(typeof row.issuedAt==='string'&&typeof row.expiresAt==='string'&&Number.isFinite(Date.parse(row.issuedAt))&&Number.isFinite(Date.parse(row.expiresAt))&&Date.parse(row.expiresAt)>Date.parse(row.issuedAt));}
}
