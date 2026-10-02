// Reconciliation for a real different-origin switch. This is not draft acceptance.
import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
const hash=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function confirmedHelperWindow(p,uptimeSeconds,remainingSeconds){
 assert.equal(p.RuntimeMaxUSec,'12h','UNCHANGED_HELPER_CAP_REQUIRED');
 assert.ok(Number.isFinite(uptimeSeconds)&&uptimeSeconds>0);
 assert.ok(Number.isFinite(remainingSeconds)&&remainingSeconds>0&&remainingSeconds<=600);
 const start=Number(p.ActiveEnterTimestampMonotonic)/1000000;
 assert.ok(Number.isFinite(start)&&start>0&&start<=uptimeSeconds,'ACTUAL_HELPER_START_REQUIRED');
 assert.ok(start+43200-uptimeSeconds>remainingSeconds+60,'FRESH_HELPER_WINDOW_REQUIRED');
}
export function confirmedDraftConfig(c){
 assert.equal(c.scope,'isolated-fictional-confirmed-draft-switch');
 assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
 if(Object.hasOwn(c,'confirmedDraftSwitchBack'))assert.equal(typeof c.confirmedDraftSwitchBack,'boolean');
 const returning=c.confirmedDraftSwitchBack===true;
 assert.equal(c.origin,returning?'https://backend-switch.example.test':'https://backend-core.example.test');
 assert.equal(c.instanceId,returning?'c7ee3314-4dee-4361-81df-7821cdcb1b4a':'b0ec3933-5258-4bd5-87f4-d57b13a78971');
 assert.equal(c.targetOrigin,returning?'https://backend-core.example.test':'https://backend-switch.example.test');
 assert.equal(c.targetInstanceId,returning?'b0ec3933-5258-4bd5-87f4-d57b13a78971':'c7ee3314-4dee-4361-81df-7821cdcb1b4a');
 assert.equal(c.profileId,returning?'8f5c3a24-ae9f-4cc8-952f-e42cfb5ddd29':'947136fa-997b-4a83-819d-1b8bd3ecba68');
 if(returning)assert.ok(['grn','invoice'].includes(c.draftKind));
 assert.match(c.sessionId,uuid);
 assert.ok(['customer','grn','dispatch','invoice'].includes(c.draftKind));
 for(const k of ['backendCheckout','backendState','targetBackendCheckout','targetBackendState','soakConfig','caseDirectory'])assert.ok(isAbsolute(c[k]),'ABSOLUTE_OWNED_PATH_REQUIRED');
 assert.notEqual(c.backendState,c.targetBackendState,'INDEPENDENT_WAREHOUSE_STATE_REQUIRED');
 for(const k of ['fixtureGuardSHA256','targetFixtureGuardSHA256'])assert.match(c[k],hash);
 return c;
}
export function confirmedDraftBefore(c,before){
 confirmedDraftConfig(c);
 for(const side of ['source','destination']){
  assert.equal(before[side]?.instanceId,c[side==='source'?'instanceId':'targetInstanceId']);
  for(const k of ['businessHash','authExceptNativeHash','storageHash'])assert.match(before[side][k],hash);
 }
 assert.deepEqual(before.source.profile,{id:c.profileId,role:c.confirmedDraftSwitchBack===true?'admin':'supervisor',active:true,status:'approved'});
 assert.equal(before.source.nativeSessionId,c.sessionId);
 assert.equal(before.source.nativeSessionUnexpired,true);
 for(const k of ['nativeSessionIssuedUTC','nativeSessionExpiryUTC'])assert.ok(Number.isFinite(Date.parse(before.source[k])),'ACTUAL_SESSION_DATES_REQUIRED');
 assert.match(before.source.nativeSessionHash,hash);
 assert.ok(Number.isSafeInteger(before.source.nativeHistoryCount)&&before.source.nativeHistoryCount>=0);
}
export function confirmedDraftReconcile(c,before,after,native){
 confirmedDraftBefore(c,before);
 assert.equal(native.artifactSHA256,c.artifactSHA256);
 assert.equal(native.confirmationAttempts,1);
 assert.equal(native.businessSubmitAttempts,0);
 assert.equal(native.otpRequests,0);
 assert.equal(native.destinationLoginAttempts,0,'RECONCILE_BEFORE_DESTINATION_AUTHENTICATION');
 assert.equal(native.destinationLoginRequired,true);
 assert.equal(native.postConfirmationColdLaunchAttempts,0,'PRESERVE_DRAFT_CAUSAL_EVIDENCE');
 assert.ok(Number.isSafeInteger(native.draftProcessPID)&&native.draftProcessPID>0);
 assert.equal(native.destinationProcessPID,native.draftProcessPID,'SAME_PROCESS_REQUIRED_BEFORE_DESTINATION_AUTHENTICATION');
 assert.deepEqual(native.selection,{origin:c.targetOrigin,instanceId:c.targetInstanceId});
 assert.equal(native.oldCredentialStoragePresent,false);
 assert.equal(native.destinationAuthenticatedRequests,0,'OLD_CREDENTIAL_FORWARDING');
 assert.equal(native.sourceLogoutCompletions,1);
 assert.equal(native.sourceLogoutStatus,200);
 for(const k of ['instanceId','profile','businessHash','authExceptNativeHash','storageHash'])assert.deepEqual(after.source[k],before.source[k],'SOURCE_PROTECTED_STATE_CHANGED');
 assert.equal(after.source.nativeSessionId,null,'OLD_SESSION_SURVIVED');
 assert.equal(after.source.nativeSessionHash,null);
 assert.equal(after.source.nativeSessionIssuedUTC,null);
 assert.equal(after.source.nativeSessionExpiryUTC,null);
 assert.equal(after.source.nativeSessionUnexpired,false);
 assert.equal(after.source.nativeHistoryCount,0,'OLD_ROTATION_HISTORY_SURVIVED');
 assert.deepEqual(after.destination,before.destination,'DESTINATION_CHANGED_BEFORE_LOGIN');
 return {status:'PASS',scope:'confirmed-switch-pre-authentication-reconciliation-only',draftAcceptance:'NOT_TESTED',requiredNext:'Ordinary destination login and exact empty-draft UI checks in the preserved process, then cold persistence and independently reconciled authentication'};
}
