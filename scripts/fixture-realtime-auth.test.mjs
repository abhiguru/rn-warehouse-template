import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateRealtimeCaller } from './fixture-realtime-auth.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config=()=>({scope:'isolated-fictional-native-realtime',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',callerPhone:'919888888872',orderId:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',record:'FXC701',quantities:[1,2],manualRefreshDuringObservation:false,sessionId:id(1),stockLineId:id(2),customerId:id(3),callerProfileId:id(4),soakConfig:'/private/ui',caseDirectory:'/private/new',prerequisiteEvidence:'/private/proof',otpSocket:'/private/socket'});
function harness(mutate=()=>{}) {
 const c=config(),before={nativeProfile:{id:c.profileId,role:'customer',active:true,name:'New customer'},nativeSessionPresent:true,callerProfile:{id:c.callerProfileId,role:'customer',active:true,name:'Customer A'},stock:{id:c.stockLineId,customerId:c.customerId,record:c.record,stock:8,qty:8},cart:{id:c.orderId,customerId:c.customerId,status:'OPEN',revisions:[]},items:[],businessHash:'a'.repeat(64),otherAuthHash:'b'.repeat(64),cartStaticHash:'c'.repeat(64),authExceptCallerHash:'d'.repeat(64),callerStaticProfileHash:'e'.repeat(64),callerQuota:{daily:3,hourly:0},callerVerifiedOTPs:2,callerSessions:[{id:id(8),rowHash:'f'.repeat(64)}]};
 const after=globalThis.structuredClone(before);after.callerQuota={daily:4,hourly:1};after.callerVerifiedOTPs=3;after.callerSessions.push({id:id(9),rowHash:'1'.repeat(64)});mutate(after,before);
 const records=[],calls=[],state={otpAttempted:false};let reads=0;
 const deps={snapshot:async()=>globalThis.structuredClone(reads++===0?before:after),record:async x=>records.push(x),challenge:async()=> '123456',call:async(path,body)=>{calls.push({path,body});assert.equal(state.otpAttempted,true);assert.equal(records[0].phase,'ONE_ORDINARY_CALLER_OTP_REQUEST_ATTEMPT');return path.endsWith('/request')?{success:true}:{success:true,data:{user:{id:c.callerProfileId,name:'Customer A',role:'customer',active:true},session:{access_token:'private-access',refresh_token:'private-refresh'}}};}};
 return {c,deps,state,records,calls};
}
test('ordinary caller authentication records only attempt and owned session identifier',async()=>{
 const h=harness(),result=await authenticateRealtimeCaller(h.c,h.deps,h.state);
 assert.equal(result.access,'private-access');assert.equal(result.refresh,'private-refresh');assert.equal(result.sessionId,id(9));
 assert.deepEqual(h.calls.map(x=>x.path),['/functions/v1/operator-otp/request','/functions/v1/operator-otp/verify']);
 assert.deepEqual(h.records,[{phase:'ONE_ORDINARY_CALLER_OTP_REQUEST_ATTEMPT'},{phase:'ORDINARY_CALLER_AUTHENTICATED',sessionId:id(9)}]);
 assert.doesNotMatch(JSON.stringify(h.records),/123456|private-access|private-refresh/);
 await assert.rejects(authenticateRealtimeCaller(h.c,h.deps,h.state));assert.equal(h.calls.length,2);
});
test('quota exhaustion refuses authentication before recording an attempt',async()=>{
 for(const quota of [{hourly:5,daily:3},{hourly:0,daily:20}]){const h=harness((a,b)=>{b.callerQuota=quota;});await assert.rejects(authenticateRealtimeCaller(h.c,h.deps,h.state),/QUOTA_EXHAUSTED/);assert.equal(h.state.otpAttempted,false);assert.deepEqual(h.calls,[]);}
});
test('failed request consumes the attempt and cannot be replayed',async()=>{
 const h=harness();let requests=0;h.deps.call=async()=>{requests++;throw new Error('transport failed');};
 await assert.rejects(authenticateRealtimeCaller(h.c,h.deps,h.state),/transport failed/);assert.equal(h.state.otpAttempted,true);
 await assert.rejects(authenticateRealtimeCaller(h.c,h.deps,h.state));assert.equal(requests,1);
});
test('authentication refuses changed native/business state, altered prior sessions or multiple new sessions',async()=>{
 for(const mutate of [a=>a.nativeSessionPresent=false,a=>a.businessHash='9'.repeat(64),a=>a.authExceptCallerHash='9'.repeat(64),a=>a.callerStaticProfileHash='9'.repeat(64),a=>a.callerSessions[0].rowHash='9'.repeat(64),a=>a.callerSessions.push({id:id(10),rowHash:'2'.repeat(64)}),a=>a.callerVerifiedOTPs++,a=>a.callerQuota.daily++]){
  const h=harness(mutate);await assert.rejects(authenticateRealtimeCaller(h.c,h.deps,h.state));assert.equal(h.records.length,1);assert.equal(h.state.otpAttempted,true);
 }
});
test('malformed challenge and wrong authenticated identity never produce an authenticated ledger row',async()=>{
 const malformed=harness();malformed.deps.challenge=async()=> 'not-an-otp';await assert.rejects(authenticateRealtimeCaller(malformed.c,malformed.deps,malformed.state));assert.equal(malformed.calls.length,1);
 const wrong=harness(),call=wrong.deps.call;wrong.deps.call=async(...args)=>{const reply=await call(...args);if(reply.data)reply.data.user.id=id(11);return reply;};await assert.rejects(authenticateRealtimeCaller(wrong.c,wrong.deps,wrong.state));assert.equal(wrong.records.length,1);
});
