import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
import {bApprovalConfig,bApprovalAfterLogout} from './fixture-b-approval-controls.mjs';
const digest=/^[a-f0-9]{64}$/;
export function bRejectionConfig(c){
 assert.equal(c.scope,'isolated-fictional-b-rejection');bApprovalConfig({...c,scope:'isolated-fictional-b-approval'});
 assert.equal(c.artifactSHA256,'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7');bRejectionClosure(c);return c;
}
export function bRejectionClosure(c){
 const x=c.workflowClosure;assert.equal(x.profileId,c.profileId);assert.equal(x.artifactSHA256,c.artifactSHA256);assert.equal(x.noDependentWorkRemaining,true);
 const groups=['reciprocal-receipt','reciprocal-invoice','private-documents','realtime-isolation'];assert.deepEqual(x.groups.map(v=>v.group).sort(),groups.sort());
 for(const row of x.groups){assert.ok(['PASS','BLOCKED'].includes(row.status));assert.ok(Array.isArray(row.evidence)&&row.evidence.length>0&&row.evidence.length<=4);for(const e of row.evidence){assert.ok(isAbsolute(e.path));assert.match(e.sha256,digest);}
  if(row.status==='BLOCKED'){assert.equal(row.attempts,3);assert.equal(row.noFurtherAttempts,true);assert.equal(row.writesReconciled,true);}
 }
 return x;
}
function unchanged(b,a,keys){for(const k of keys)assert.deepEqual(a[k],b[k],'Rejection changed preserved '+k);}
export function bRejectionBefore(c,s){
 bRejectionConfig(c);assert.deepEqual(s.target,{id:c.profileId,name:'Customer B',role:'customer',active:true,status:'approved'});assert.deepEqual(s.targetSessions,[]);
 assert.equal(s.assignments.length,1);assert.equal(s.assignments[0].user_profile_id,c.profileId);assert.equal(s.assignments[0].customer_id,c.customerId);assert.equal(s.assignments[0].active,true);
 assert.deepEqual(s.admin,{id:c.adminProfileId,role:'admin',active:true});for(const k of ['businessHash','otherAuthHash','targetStaticHash','adminStaticHash'])assert.match(s[k],digest);
 for(const k of ['targetOTPCount','adminOTPCount','adminHourly','adminDaily'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>=0);assert.ok(s.adminHourly<5&&s.adminDaily<20,'Ordinary administrator quota exhausted');assert.ok(Array.isArray(s.adminSessions));
}
export function bRejectionAfterLogin(c,b,a){
 bRejectionBefore(c,b);unchanged(b,a,['target','targetSessions','assignments','admin','targetStaticHash','adminStaticHash','targetOTPCount','businessHash','otherAuthHash']);
 assert.equal(a.adminOTPCount,b.adminOTPCount+1);assert.equal(a.adminHourly,b.adminHourly+1);assert.equal(a.adminDaily,b.adminDaily+1);
 const old=new Set(b.adminSessions.map(x=>x.id));assert.equal(old.size,b.adminSessions.length);assert.equal(new Set(a.adminSessions.map(x=>x.id)).size,a.adminSessions.length);const added=a.adminSessions.filter(x=>!old.has(x.id));assert.equal(added.length,1);assert.deepEqual(a.adminSessions.filter(x=>old.has(x.id)),b.adminSessions);return added[0].id;
}
export function bRejectionAfterCommit(c,b,a){
 bRejectionConfig(c);assert.deepEqual(a.target,{...b.target,active:false,status:'rejected'});
 unchanged(b,a,['targetSessions','admin','adminSessions','targetStaticHash','adminStaticHash','targetOTPCount','adminOTPCount','adminHourly','adminDaily','businessHash','otherAuthHash']);
 assert.deepEqual(a.assignments,b.assignments.map(x=>({...x,active:false})));
}
export function bRejectionAfterLogout(c,b,a,id){bRejectionConfig(c);bApprovalAfterLogout({...c,scope:'isolated-fictional-b-approval'},b,a,id);}
