import assert from 'node:assert/strict';
const digest=/^[a-f0-9]{64}$/;
export function bApprovalConfig(c){
 assert.equal(c.scope,'isolated-fictional-b-approval');
 assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');assert.equal(c.phone,'919888888873');
 assert.equal(c.customerId,'a8246002-bdb6-11f1-b1bf-07b1deb5bca2');
 assert.equal(c.adminProfileId,'f94caa4f-0051-4660-920a-5f41aac86fa7');assert.equal(c.adminPhone,'919888888871');
 assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');return c;
}
function unchanged(b,a,keys){for(const k of keys)assert.deepEqual(a[k],b[k],'Approval changed preserved '+k);}
export function bApprovalBefore(c,s){
 bApprovalConfig(c);assert.deepEqual(s.target,{id:c.profileId,name:'Customer B',role:'customer',active:false,status:'disabled'});
 assert.deepEqual(s.targetSessions,[]);assert.equal(s.assignments.length,1);const assignment=s.assignments[0];assert.equal(assignment.user_profile_id,c.profileId);assert.equal(assignment.customer_id,c.customerId);assert.equal(assignment.active,false);
 assert.deepEqual(s.admin,{id:c.adminProfileId,role:'admin',active:true});
 for(const key of ['businessHash','otherAuthHash','targetStaticHash','adminStaticHash'])assert.match(s[key],digest);
 for(const key of ['targetOTPCount','adminOTPCount','adminHourly','adminDaily'])assert.ok(Number.isSafeInteger(s[key])&&s[key]>=0);
 assert.ok(s.adminHourly<5&&s.adminDaily<20,'Ordinary administrator quota exhausted');assert.ok(Array.isArray(s.adminSessions));
}
export function bApprovalAfterLogin(c,b,a){
 bApprovalBefore(c,b);unchanged(b,a,['target','targetSessions','assignments','admin','targetStaticHash','adminStaticHash','targetOTPCount','businessHash','otherAuthHash']);
 assert.equal(a.adminOTPCount,b.adminOTPCount+1);assert.equal(a.adminHourly,b.adminHourly+1);assert.equal(a.adminDaily,b.adminDaily+1);
 const old=new Set(b.adminSessions.map(x=>x.id)),added=a.adminSessions.filter(x=>!old.has(x.id));assert.equal(added.length,1);assert.deepEqual(a.adminSessions.filter(x=>old.has(x.id)),b.adminSessions);return added[0].id;
}
export function bApprovalAfterCommit(c,b,a){
 bApprovalConfig(c);assert.deepEqual(a.target,{...b.target,active:true,status:'approved'});
 unchanged(b,a,['targetSessions','admin','adminSessions','targetStaticHash','adminStaticHash','targetOTPCount','adminOTPCount','adminHourly','adminDaily','businessHash','otherAuthHash']);
 assert.equal(a.assignments.length,1);const expected={...b.assignments[0],active:true,assigned_by:c.adminProfileId,assigned_at:a.assignments[0].assigned_at};assert.equal(typeof expected.assigned_at,'string');assert.ok(Number.isFinite(Date.parse(expected.assigned_at)));assert.deepEqual(a.assignments[0],expected);
}
export function bApprovalAfterLogout(c,b,a,id){bApprovalConfig(c);unchanged(b,a,['target','targetSessions','assignments','admin','targetStaticHash','adminStaticHash','targetOTPCount','adminOTPCount','adminHourly','adminDaily','businessHash','otherAuthHash']);assert.deepEqual(a.adminSessions,b.adminSessions.filter(x=>x.id!==id));assert.equal(b.adminSessions.length-a.adminSessions.length,1);}
