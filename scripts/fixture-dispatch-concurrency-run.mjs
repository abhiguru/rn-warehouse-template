import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {reconcileNativeRenewal} from './fixture-native-renewal-controls.mjs';
import {concurrencyConfig,concurrencyStockProof,concurrencyTransportProof} from './fixture-dispatch-concurrency-controls.mjs';
export async function runDispatchConcurrency(c,d,state){
 concurrencyConfig(c);assert.equal(state.nativeAttempts,0);assert.equal(state.competitorAttempts,0);assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();
 const initial=await d.snapshot();assert.equal(initial.stock,3);assert.equal(initial.nativeRecordCount,0);assert.equal(initial.competitorRecordCount,0);assert.equal(initial.lotBound,true);assert.equal(initial.nativeSessionPresent,true);await d.evidence('initial',initial);
 const credentials=await d.authenticate();const before=await d.snapshot();await d.verifyAuthentication(initial,before,credentials.sessionId);await d.evidence('authenticated',before);
 const preparationStartedUTC=new Date().toISOString();await d.native('prepare');const prepared=await d.snapshot();
 if(!isDeepStrictEqual(prepared,before)){assert.equal(typeof d.renewalProof,'function','Independent native renewal proof required');const proof=await d.renewalProof(before,prepared,preparationStartedUTC,new Date().toISOString());reconcileNativeRenewal(before,prepared,proof);await d.evidence('prepared-renewal',proof);}
 await d.evidence('prepared',prepared);
 const baseline=await d.transportBaseline();await d.verifyOwnership();assert.ok(Date.now()<Date.parse(c.deadlineUTC));state.nativeAttempts=1;await d.record({phase:'ONE_NATIVE_DISPATCH_SUBMISSION_ATTEMPT'});
 // Attach a rejection handler immediately; coordinator still observes the actual result below.
 const native=d.native('submit');native.catch(()=>{});
 try{
 const held=await d.waitForHold(baseline);assert.equal(held.event,'dispatch-request-delay-start');assert.equal(held.delayMs,5000);assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();state.competitorAttempts=1;await d.record({phase:'ONE_ORDINARY_API_COMPETITOR_DISPATCH_ATTEMPT'});
 let response;
 try{response=await d.competitor(credentials.access);}catch(error){await d.evidence('uncertain-after',await d.snapshot());await d.record({phase:'UNCERTAIN_COMPETITOR_STOPPED_NO_REPLAY_OR_CLEANUP'});throw error;}
 await d.evidence('competitor-response',{status:response.status,success:response.body?.success,dispatchId:response.body?.dispatch_id});assert.equal(response.status,200);assert.equal(response.body.success,true);
 const ui=await native;assert.equal(ui.status,'NATIVE_ERROR_OBSERVED');assert.equal(ui.submissionAttempts,1);
 const events=await d.transportEvents(baseline);concurrencyTransportProof(c,events);await d.evidence('transport',events);
 const after=await d.snapshot();await d.evidence('after',after);concurrencyStockProof(c,prepared,after);await d.verifyCompetitorResponse(after,response.body);state.reconciled=true;await d.record({phase:'NATIVE_ERROR_AND_SINGLE_COMPETITOR_COMMIT_RECONCILED'});
 await d.cleanupNative();const cold=await d.snapshot();assert.deepEqual(cold,after,'Native cold cleanup changed protected backend state');await d.evidence('cold',cold);
 await d.logout(credentials.refresh);const final=await d.snapshot();await d.verifyCleanup(cold,final,credentials.sessionId);await d.evidence('final',final);await d.record({phase:'ONLY_NEW_API_SESSION_REMOVED',status:'PASS'});
 return {status:'PASS',scope:'one genuine native stale-stock rejection and one API competitor commit; no retry'};
 }catch(error){
 // The native adapter is independently bounded; do not leave an actor running
 // while reporting a stopped case or starting independent work.
 await native.catch(()=>{});await d.evidence('stopped-after',await d.snapshot());
 await d.record({phase:'RACE_STOPPED_PRESERVE_EVIDENCE_NO_REPLAY_OR_CLEANUP',exceptionType:error.name});throw error;}
}
