import assert from 'node:assert/strict';
const hash=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function instant(value){assert.equal(typeof value,'string');const time=Date.parse(value);assert.ok(Number.isFinite(time));return time;}

export function naturalExpiryAppointment(c,proof) {
 assert.equal(c.scope,'isolated-fictional-dedicated-natural-expiry');assert.match(c.artifactSHA256,hash);assert.match(c.sessionId,uuid);
 assert.equal(proof.finalFreeze.status,'PASS');assert.equal(proof.finalFreeze.artifactSHA256,c.artifactSHA256);
 assert.equal(proof.artifactAudit.status,'PASS');assert.equal(proof.artifactAudit.sha256,c.artifactSHA256);
 assert.equal(proof.device.installedAPKHash,c.artifactSHA256);
 assert.equal(proof.device.sdk,30);assert.equal(proof.device.abi,'x86_64');assert.equal(proof.device.createdOnlyForNaturalExpiry,true);
 assert.equal(proof.device.authenticatedStateCloned,false);assert.equal(proof.device.originalDisposableAVD,false);
 assert.equal(proof.device.pdfReaderInstalled,false);assert.equal(proof.device.cleanlyStopped,true);
 assert.equal(proof.preservation.status,'PASS');assert.equal(proof.preservation.avd,proof.device.avd);assert.match(proof.preservation.storageSHA256,hash);
 assert.equal(proof.session.id,c.sessionId);assert.equal(proof.session.ordinaryAuthentication,true);assert.equal(proof.session.timestampManipulated,false);
 assert.equal(proof.session.refreshAfterStop,false);assert.equal(proof.session.logoutAfterStop,false);
 const issued=instant(proof.session.issuedAtUTC),stopped=instant(proof.device.stoppedAtUTC),expires=instant(proof.session.expiresAtUTC),observed=instant(proof.serverNowUTC);
 assert.ok(issued<=stopped&&stopped<=observed&&observed<expires,'Preserved unexpired dedicated session required');
 const scheduled=expires+600000,deadline=scheduled+3600000;
 assert.ok(instant(proof.certificateExpiresAtUTC)>deadline,'Certificate must cover the actual appointment');
 return {status:'PREPARED',sessionId:c.sessionId,sessionExpiresAtUTC:new Date(expires).toISOString(),avd:proof.device.avd,notBeforeUTC:new Date(scheduled).toISOString(),deadlineUTC:new Date(deadline).toISOString(),maximumExecutionSeconds:3600};
}

export function naturalExpiryExecution(appointment,current) {
 assert.equal(appointment.status,'PREPARED');assert.equal(appointment.maximumExecutionSeconds,3600);
 const expires=instant(appointment.sessionExpiresAtUTC);
 assert.equal(instant(appointment.notBeforeUTC),expires+600000,'Appointment must retain expiry plus ten minutes');
 assert.equal(instant(appointment.deadlineUTC),expires+4200000,'Appointment must retain its one-hour deadline');
 assert.equal(instant(current.session.expiresAtUTC),expires,'Session expiry changed after preservation');
 const now=instant(current.serverNowUTC);assert.ok(now>=instant(appointment.notBeforeUTC),'Do not shorten natural expiry');
 assert.ok(now<instant(appointment.deadlineUTC),'One bounded appointment; no indefinite retries');
 assert.equal(current.ownershipMatches,true);assert.equal(current.competingRun,false);assert.equal(current.artifactMatches,true);assert.equal(current.bindingsMatch,true);
 assert.equal(current.session.id,appointment.sessionId);assert.ok(instant(current.session.expiresAtUTC)<=now,'Actual server expiry required');
 assert.ok(instant(current.certificateExpiresAtUTC)>instant(appointment.deadlineUTC));return {status:'PASS',scope:'dedicated natural-expiry execution gates only'};
}
