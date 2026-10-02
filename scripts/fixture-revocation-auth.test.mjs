import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateRevocationAdministrator} from './fixture-revocation-auth.mjs';
import {runRevocation} from './fixture-revocation-run.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const c={scope:'isolated-fictional-native-revocation',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',phone:'919888888874',adminProfileId:'f94caa4f-0051-4660-920a-5f41aac86fa7',adminPhone:'919888888871',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',sessionId:id(1),soakConfig:'/private/ui',caseDirectory:'/private/new',otpSocket:'/private/otp.sock'};
const before=()=>({profile:{id:c.profileId,name:c.profileName,role:'customer',active:true,status:'approved'},targetSessions:[{id:id(1),expired:false}],assignments:[{id:id(2),active:true}],admin:{id:c.adminProfileId,role:'admin',active:true},adminStaticHash:'a'.repeat(64),adminQuota:{hourly:0,daily:0},adminSessions:[],adminOTPCount:20,targetOTPCount:7,businessHash:'b'.repeat(64),otherAuthHash:'c'.repeat(64)});
function transport(lostDisable=false){
 let current=before(),disables=0,native=0;const records=[];
 const deps={snapshot:async()=>globalThis.structuredClone(current),record:async x=>records.push(x),challenge:async()=> '123456',verifyDependencies:async()=>{},nativeColdLogin:async()=>{native++;},call:async(path)=>{
  if(path.endsWith('/request'))return {success:true};
  if(path.endsWith('/verify')){current={...current,adminQuota:{hourly:1,daily:1},adminOTPCount:21,adminSessions:[{id:id(3)}]};return {success:true,data:{user:{id:c.adminProfileId,name:'Core Demo Administrator',role:'admin',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};}
  if(path.endsWith('/check_session'))return null;
  if(path.endsWith('/operator_review_enrollment')){disables++;current={...current,profile:{...current.profile,active:false,status:'disabled'},targetSessions:[],assignments:current.assignments.map(x=>({...x,active:false}))};if(lostDisable)throw new Error('lost committed response');return {success:true,data:{status:'disabled'}};}
  if(path.endsWith('/logout_session')){current={...current,adminSessions:[]};return true;}
  throw new Error('Unexpected transport');
 }};return {deps,records,counts:()=>({disables,native})};
}
test('bounded revocation reconciles supported changes, owned admin logout and native restoration',async()=>{
 const t=transport(),state={otpAttempted:false,disableAttempted:false};const result=await runRevocation({...c,deadlineUTC:new Date(Date.now()+60000).toISOString()},t.deps,state);
 assert.equal(result.status,'PASS');assert.deepEqual(t.counts(),{disables:1,native:1});assert.doesNotMatch(JSON.stringify(t.records),/private-access|private-refresh|123456/);
});
test('lost committed disable stops before cleanup/native and cannot be replayed',async()=>{
 const t=transport(true),state={otpAttempted:false,disableAttempted:false},config={...c,deadlineUTC:new Date(Date.now()+60000).toISOString()};
 await assert.rejects(runRevocation(config,t.deps,state));assert.deepEqual(t.counts(),{disables:1,native:0});assert.equal(state.disableAttempted,true);
 await assert.rejects(runRevocation(config,t.deps,state));assert.deepEqual(t.counts(),{disables:1,native:0});
});
test('pending dependency closure stops before ordinary authentication',async()=>{
 const t=transport(),state={otpAttempted:false,disableAttempted:false};t.deps.verifyDependencies=async()=>{throw new Error('pending workflow');};
 await assert.rejects(runRevocation({...c,deadlineUTC:new Date(Date.now()+60000).toISOString()},t.deps,state));assert.equal(state.otpAttempted,false);assert.equal(state.disableAttempted,false);assert.deepEqual(t.counts(),{disables:0,native:0});
});
test('revocation admin authenticates once with in-memory credentials and sanitized records',async()=>{
 const b=before(),after={...b,adminQuota:{hourly:1,daily:1},adminOTPCount:21,adminSessions:[{id:id(3)}]};let snapshots=0;const records=[],calls=[];
 const deps={snapshot:async()=>snapshots++?after:b,record:async x=>records.push(x),challenge:async()=> '123456',call:async(path,body)=>{calls.push({path,body});return path.endsWith('/request')?{success:true}:{success:true,data:{user:{id:c.adminProfileId,name:'Core Demo Administrator',role:'admin',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};}};
 const state={otpAttempted:false};const result=await authenticateRevocationAdministrator(c,deps,state);assert.equal(result.sessionId,id(3));assert.equal(result.access,'private-access');assert.equal(calls.length,2);
 assert.doesNotMatch(JSON.stringify(records),/private-access|private-refresh|123456|otp_code|access_token/);
 await assert.rejects(authenticateRevocationAdministrator(c,deps,state));assert.equal(calls.length,2);
});
test('exhausted quota makes no request; uncertain request cannot be replayed',async()=>{
 let calls=0;const state={otpAttempted:false};const deps={snapshot:async()=>({...before(),adminQuota:{hourly:0,daily:20}}),record:async()=>{},call:async()=>{calls++;throw new Error('lost response');}};
 await assert.rejects(authenticateRevocationAdministrator(c,deps,state));assert.equal(calls,0);assert.equal(state.otpAttempted,false);
 deps.snapshot=async()=>before();await assert.rejects(authenticateRevocationAdministrator(c,deps,state));assert.equal(calls,1);assert.equal(state.otpAttempted,true);
 await assert.rejects(authenticateRevocationAdministrator(c,deps,state));assert.equal(calls,1);
});
