import test from 'node:test';import assert from 'node:assert/strict';
import {bApprovalConfig,bApprovalBefore,bApprovalAfterLogin,bApprovalAfterCommit,bApprovalAfterLogout} from './fixture-b-approval-controls.mjs';
import {runBApproval} from './fixture-b-approval-run.mjs';
const c={scope:'isolated-fictional-b-approval',profileId:'34d9d337-ec2e-4bed-b555-0e8b63dd3aef',phone:'919888888873',customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971'};
const snapshot=()=>({target:{id:c.profileId,name:'Customer B',role:'customer',active:false,status:'disabled'},targetSessions:[],assignments:[{id:'retained-row',user_profile_id:c.profileId,customer_id:c.customerId,active:false,assigned_by:c.adminProfileId,assigned_at:'2026-10-01T00:00:00Z'}],admin:{id:c.adminProfileId,role:'admin',active:true},adminSessions:[{id:'old'}],adminHourly:0,adminDaily:0,adminOTPCount:20,targetOTPCount:3,businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),targetStaticHash:'c'.repeat(64),adminStaticHash:'d'.repeat(64)});
test('B approval refuses wrong identities, exhausted quotas and assignment expansion',()=>{
 for(const edit of [{phone:'919888888874'},{profileId:c.adminProfileId},{customerId:c.profileId},{origin:'https://foreign.example'}])assert.throws(()=>bApprovalConfig({...c,...edit}));
 const b=snapshot();bApprovalBefore(c,b);assert.throws(()=>bApprovalBefore(c,{...b,adminDaily:20}));
 const login={...b,adminSessions:[...b.adminSessions,{id:'new'}],adminHourly:1,adminDaily:1,adminOTPCount:21};assert.equal(bApprovalAfterLogin(c,b,login),'new');
 const approved={...login,target:{...b.target,active:true,status:'approved'},assignments:[{...b.assignments[0],active:true,assigned_at:'2026-10-02T00:00:00Z'}]};bApprovalAfterCommit(c,login,approved);
 assert.throws(()=>bApprovalAfterCommit(c,login,{...approved,businessHash:'f'.repeat(64)}));assert.throws(()=>bApprovalAfterCommit(c,login,{...approved,assignments:[...approved.assignments,b.assignments[0]]}));
 bApprovalAfterLogout(c,approved,{...approved,adminSessions:b.adminSessions},'new');assert.throws(()=>bApprovalAfterLogout(c,approved,{...approved,adminSessions:[]},'new'));
});
test('B approval refuses unavailable quota before requesting OTP and never replays uncertain request',async()=>{
 let calls=0;const records=[],state={otpAttempted:false,approvalAttempted:false};const cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};
 const deps={verifyOwnership:async()=>{},snapshot:async()=>({...snapshot(),adminDaily:20}),call:async()=>{calls++;throw Error();},record:async x=>records.push(x)};
 await assert.rejects(runBApproval(cfg,deps,state));assert.equal(calls,0);assert.equal(state.otpAttempted,false);
 deps.snapshot=async()=>snapshot();await assert.rejects(runBApproval(cfg,deps,state));assert.equal(calls,1);assert.equal(state.otpAttempted,true);await assert.rejects(runBApproval(cfg,deps,state));assert.equal(calls,1);assert.ok(records.some(x=>x.phase==='STOPPED_NO_REPLAY'));
});
test('lost B approval response preserves the attempt and refuses automatic cleanup or replay',async()=>{
 const b=snapshot(),login={...b,adminSessions:[...b.adminSessions,{id:'new'}],adminHourly:1,adminDaily:1,adminOTPCount:21};
 const snapshots=[b,login,login],calls=[],records=[],state={otpAttempted:false,approvalAttempted:false};
 const cfg={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};
 const deps={verifyOwnership:async()=>{},snapshot:async()=>snapshots.shift(),challenge:async()=> '123456',record:async x=>records.push(x),call:async(path)=>{
  calls.push(path);if(path.endsWith('/request'))return {success:true};
  if(path.endsWith('/verify'))return {success:true,data:{user:{id:c.adminProfileId,role:'admin',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};
  throw Error('Uncertain committed approval response');
 }};
 await assert.rejects(runBApproval(cfg,deps,state));assert.equal(state.approvalAttempted,true);assert.equal(calls.filter(x=>x.endsWith('/operator_review_enrollment')).length,1);assert.equal(calls.some(x=>x.endsWith('/logout_session')),false);
 await assert.rejects(runBApproval(cfg,deps,state));assert.equal(calls.length,3);assert.doesNotMatch(JSON.stringify(records),/123456|private-access|private-refresh/);
});
