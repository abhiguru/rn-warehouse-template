// Dedicated expiry appointment only; not invoked by installation or normal APKs.
import assert from 'node:assert/strict';
import {isAbsolute,basename} from 'node:path';
import {naturalExpiryAppointment} from './fixture-natural-expiry-controls.mjs';
const hash=/^[a-f0-9]{64}$/;
function unitArgument(value){assert.equal(typeof value,'string');assert.ok(!/[\r\n\0]/.test(value));return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%').replaceAll('$','$$')+'"';}
export function naturalExpiryScheduleSpec(c,proof,verified){
 const appointment=naturalExpiryAppointment(c,proof);
 assert.match(c.runId,/^[a-z0-9][a-z0-9-]{0,39}$/);
 for(const key of ['executor','configuration','log'])assert.ok(isAbsolute(c[key])&&!/[\r\n\0]/.test(c[key]));
 assert.equal(basename(c.executor),'natural-expiry-api30.py');
 for(const key of ['executorSHA256','configurationSHA256'])assert.match(c[key],hash);
 assert.equal(verified.executorSHA256,c.executorSHA256);assert.equal(verified.configurationSHA256,c.configurationSHA256);
 assert.equal(verified.privateOwnedPaths,true);assert.equal(verified.bindingsMatch,true);
 assert.equal(verified.existingUnit,false);assert.equal(verified.existingLog,false);assert.equal(verified.competingRun,false);
 assert.ok(Date.parse(verified.nowUTC)<Date.parse(appointment.notBeforeUTC),'No late installation or automatic retry');
 const base='warehouse-fixture-natural-expiry-'+c.runId;
 const calendar=appointment.notBeforeUTC.replace('T',' ').replace(/Z$/,' UTC');
 const service='[Unit]\nDescription=Owned dedicated natural session expiry acceptance\n\n[Service]\nType=exec\nRestart=no\nUMask=0077\nKillMode=control-group\nRuntimeMaxSec=3600\nTimeoutStopSec=20\nStandardOutput=append:'+c.log.replaceAll('%','%%')+'\nStandardError=append:'+c.log.replaceAll('%','%%')+'\nExecStart=/usr/bin/python3 -B '+unitArgument(c.executor)+' '+unitArgument(c.configuration)+'\n';
 const timer='[Unit]\nDescription=One owned natural expiry appointment\n\n[Timer]\nOnCalendar='+calendar+'\nAccuracySec=1\nRandomizedDelaySec=0\nPersistent=false\nUnit='+base+'.service\n';
 return {appointment,serviceUnit:base+'.service',timerUnit:base+'.timer',service,timer,externalAlerts:false,automaticRetry:false};
}
// Caller must verify private paths/hashes immediately before this invocation.
// Generated units are exclusive-created; errors never trigger recovery/retry.
export function installNaturalExpirySchedule(spec,io){
 assert.equal(spec.appointment.status,'PREPARED');assert.equal(spec.automaticRetry,false);
 io.createPrivateExclusive(spec.serviceUnit,spec.service);
 io.createPrivateExclusive(spec.timerUnit,spec.timer);
 io.createPrivateLogExclusive();
 io.verifyUnits([spec.serviceUnit,spec.timerUnit]);
 io.daemonReload();io.startTimer(spec.timerUnit);
 const state=io.timerState(spec.timerUnit);
 assert.equal(state.active,true);assert.equal(state.waiting,true);
 assert.equal(Date.parse(state.nextElapseUTC),Date.parse(spec.appointment.notBeforeUTC));
 return {status:'SCHEDULED',timerUnit:spec.timerUnit,serviceUnit:spec.serviceUnit,notBeforeUTC:spec.appointment.notBeforeUTC,deadlineUTC:spec.appointment.deadlineUTC,oneHourMaximum:true,externalAlerts:false};
}
