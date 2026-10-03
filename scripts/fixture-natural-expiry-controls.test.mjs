import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalExpiryAppointment,naturalExpiryExecution} from './fixture-natural-expiry-controls.mjs';
const c={scope:'isolated-fictional-dedicated-natural-expiry',artifactSHA256:'a'.repeat(64),sessionId:'00000000-0000-4000-8000-000000000001'};
const proof=()=>({finalFreeze:{status:'PASS',artifactSHA256:c.artifactSHA256},artifactAudit:{status:'PASS',sha256:c.artifactSHA256},device:{avd:'DedicatedExpiry_API30',installedAPKHash:c.artifactSHA256,sdk:30,abi:'x86_64',createdOnlyForNaturalExpiry:true,authenticatedStateCloned:false,originalDisposableAVD:false,pdfReaderInstalled:false,cleanlyStopped:true,stoppedAtUTC:'2026-10-03T10:01:00Z'},preservation:{status:'PASS',avd:'DedicatedExpiry_API30',storageSHA256:'b'.repeat(64)},session:{id:c.sessionId,ordinaryAuthentication:true,timestampManipulated:false,refreshAfterStop:false,logoutAfterStop:false,issuedAtUTC:'2026-10-03T10:00:00Z',expiresAtUTC:'2026-10-10T10:00:00Z'},serverNowUTC:'2026-10-03T10:02:00Z',certificateExpiresAtUTC:'2026-10-15T16:00:00Z'});
test('expiry appointment derives real expiry plus ten minutes and one-hour deadline',()=>{
 const a=naturalExpiryAppointment(c,proof());assert.equal(a.notBeforeUTC,'2026-10-10T10:10:00.000Z');assert.equal(a.deadlineUTC,'2026-10-10T11:10:00.000Z');
 for(const change of [x=>x.finalFreeze.status='PENDING',x=>x.device.authenticatedStateCloned=true,x=>x.device.pdfReaderInstalled=true,x=>x.session.timestampManipulated=true,x=>x.session.refreshAfterStop=true,x=>x.device.cleanlyStopped=false,x=>x.certificateExpiresAtUTC='2026-10-10T10:59:00Z']){const p=proof();change(p);assert.throws(()=>naturalExpiryAppointment(c,p));}
});
test('expiry execution refuses early/late checks, ownership conflicts and unexpired server sessions',()=>{
 const a=naturalExpiryAppointment(c,proof()),current={serverNowUTC:a.notBeforeUTC,ownershipMatches:true,competingRun:false,artifactMatches:true,bindingsMatch:true,session:{id:c.sessionId,expiresAtUTC:'2026-10-10T10:00:00Z'},certificateExpiresAtUTC:'2026-10-15T16:00:00Z'};naturalExpiryExecution(a,current);
 for(const edit of [{serverNowUTC:'2026-10-10T10:09:59Z'},{serverNowUTC:a.deadlineUTC},{competingRun:true},{ownershipMatches:false},{artifactMatches:false},{bindingsMatch:false},{session:{...current.session,expiresAtUTC:'2026-10-10T11:00:00Z'}}])assert.throws(()=>naturalExpiryExecution(a,{...current,...edit}));
});

test('expiry execution rejects earlier changed expiry and tampered appointment windows',()=>{
 const a=naturalExpiryAppointment(c,proof()),current={serverNowUTC:a.notBeforeUTC,ownershipMatches:true,competingRun:false,artifactMatches:true,bindingsMatch:true,session:{id:c.sessionId,expiresAtUTC:a.sessionExpiresAtUTC},certificateExpiresAtUTC:'2026-10-15T16:00:00Z'};
 assert.throws(()=>naturalExpiryExecution(a,{...current,session:{...current.session,expiresAtUTC:'2026-10-09T10:00:00Z'}}));
 assert.throws(()=>naturalExpiryExecution({...a,notBeforeUTC:'2026-10-10T10:00:00Z'},current));
 assert.throws(()=>naturalExpiryExecution({...a,deadlineUTC:'2026-10-10T12:10:00Z'},current));
});
