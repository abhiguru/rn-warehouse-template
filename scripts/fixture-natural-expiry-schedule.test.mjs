import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalExpiryScheduleSpec,installNaturalExpirySchedule} from './fixture-natural-expiry-schedule.mjs';
const c={scope:'isolated-fictional-dedicated-natural-expiry',artifactSHA256:'a'.repeat(64),sessionId:'00000000-0000-4000-8000-000000000001',runId:'vm-expiry01',executor:'/private/runtime/scripts/fixture-ui/natural-expiry-api30.py',configuration:'/private/expiry.json',log:'/private/expiry.log',executorSHA256:'c'.repeat(64),configurationSHA256:'d'.repeat(64)};
const proof=()=>({finalFreeze:{status:'PASS',artifactSHA256:c.artifactSHA256},artifactAudit:{status:'PASS',sha256:c.artifactSHA256},device:{avd:'DedicatedExpiry_API30',installedAPKHash:c.artifactSHA256,sdk:30,abi:'x86_64',createdOnlyForNaturalExpiry:true,authenticatedStateCloned:false,originalDisposableAVD:false,pdfReaderInstalled:false,cleanlyStopped:true,stoppedAtUTC:'2026-10-03T10:01:00Z'},preservation:{status:'PASS',avd:'DedicatedExpiry_API30',storageSHA256:'b'.repeat(64)},session:{id:c.sessionId,ordinaryAuthentication:true,timestampManipulated:false,refreshAfterStop:false,logoutAfterStop:false,issuedAtUTC:'2026-10-03T10:00:00Z',expiresAtUTC:'2026-10-10T10:00:00Z'},serverNowUTC:'2026-10-03T10:02:00Z',certificateExpiresAtUTC:'2026-10-15T16:00:00Z'});

const verified=()=>({executorSHA256:c.executorSHA256,configurationSHA256:c.configurationSHA256,privateOwnedPaths:true,bindingsMatch:true,existingUnit:false,existingLog:false,competingRun:false,nowUTC:'2026-10-03T10:02:00Z'});
test('one-shot units retain actual expiry appointment and one-hour cap',()=>{
 const s=naturalExpiryScheduleSpec(c,proof(),verified());
 assert.ok(s.timer.includes('OnCalendar=2026-10-10 10:10:00.000 UTC'));assert.match(s.timer,/Persistent=false/);assert.match(s.service,/RuntimeMaxSec=3600/);assert.match(s.service,/Restart=no/);assert.match(s.service,/UMask=0077/);assert.equal(s.externalAlerts,false);
});
test('scheduler refuses unfrozen artifacts, occupied evidence and changed bindings',()=>{
 for(const patch of [{existingUnit:true},{existingLog:true},{competingRun:true},{bindingsMatch:false},{privateOwnedPaths:false},{executorSHA256:'e'.repeat(64)},{nowUTC:'2026-10-10T10:10:00Z'}])assert.throws(()=>naturalExpiryScheduleSpec(c,proof(),{...verified(),...patch}));
 for(const patch of [{executor:'/tmp/uncontrolled.py'},{configuration:'relative'},{runId:'bad\nExecStart=foo'}])assert.throws(()=>naturalExpiryScheduleSpec({...c,...patch},proof(),verified()));
 const p=proof();p.finalFreeze.status='PENDING';assert.throws(()=>naturalExpiryScheduleSpec(c,p,verified()));
});
test('exclusive preparation precedes timer start and failure never restarts',()=>{
 const spec=naturalExpiryScheduleSpec(c,proof(),verified()),events=[];
 const io={createPrivateExclusive:(name)=>events.push(name),createPrivateLogExclusive:()=>events.push('log'),verifyUnits:()=>events.push('verify'),daemonReload:()=>events.push('reload'),startTimer:()=>events.push('start'),timerState:()=>({active:true,waiting:true,nextElapseUTC:spec.appointment.notBeforeUTC})};
 assert.equal(installNaturalExpirySchedule(spec,io).status,'SCHEDULED');assert.deepEqual(events,[spec.serviceUnit,spec.timerUnit,'log','verify','reload','start']);
 events.length=0;assert.throws(()=>installNaturalExpirySchedule(spec,{...io,verifyUnits:()=>{throw Error('unit refused');}}));assert.equal(events.includes('start'),false);
 assert.throws(()=>installNaturalExpirySchedule(spec,{...io,timerState:()=>({active:true,waiting:true,nextElapseUTC:'2026-10-10T10:00:00Z'})}));
});

test('timer retains fractional server expiry rather than advancing the check',()=>{
 const p=proof();p.session.expiresAtUTC='2026-10-10T10:00:00.342Z';const s=naturalExpiryScheduleSpec(c,p,verified());assert.ok(s.timer.includes('OnCalendar=2026-10-10 10:10:00.342 UTC'));assert.equal(s.appointment.notBeforeUTC,'2026-10-10T10:10:00.342Z');
});
