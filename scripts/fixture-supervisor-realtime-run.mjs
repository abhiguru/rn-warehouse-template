import assert from 'node:assert/strict';
import { supervisorConfig, claimSupervisorWrite, reconcileSupervisorNote, supervisorReconnectProof } from './fixture-supervisor-realtime-controls.mjs';
import { authenticateSupervisorAccount, logoutSupervisorAccount } from './fixture-supervisor-realtime-auth.mjs';
import { supervisorIsolationEvidence } from './fixture-realtime-isolation-wire.mjs';

// The live adapter owns exact source/artifact bindings, TLS, actor locking,
// private snapshots, and actual native evidence. No repair or replay occurs here.
export async function runSupervisorRealtime(c,d,state){
 supervisorConfig(c);assert.equal(state.status,'RUNNING');assert.deepEqual(state.writes,[]);
 const credentials={},channels=[];
 try{
  await d.verifyOwnership();const original=await d.snapshot();
  assert.equal(original.nativeSupervisorSessionPresent,true);
  for(const role of ['A','B'])assert.notEqual(original.carts[role].note,c['marker'+role],'Marker already consumed');
  await d.evidence('original-notes-and-state',original);state.oldNotesPreserved=true;
  const ready=await d.native('before');assert.equal(ready.status,'PASS');assert.equal(ready.role,'supervisor');assert.equal(ready.artifactSHA256,c.artifactSHA256);assert.equal(ready.ordersHTTPStatus,200);assert.equal(ready.foreignContent,false);
  state.nativeSupervisorReady=true;await d.record({phase:'ACTUAL_NATIVE_SUPERVISOR_READY'});
  for(const role of ['A','supervisor','admin'])credentials[role]=await authenticateSupervisorAccount(c,role,d,state);
  const authenticated=await d.snapshot();state.authenticationReconciled=true;
  await d.evidence('fully-authenticated-baseline',authenticated);
  for(const role of ['A','supervisor','admin'])channels.push(await d.join(role,credentials[role].access));
  let previous=authenticated;
  for(const role of ['A','B']){
   if(role==='B'&&c.supervisorReconnect===true){
    const cycle=supervisorReconnectProof(c,await d.native('cycle'));await d.evidence('native-network-cycle',cycle);
   }
   await d.verifyOwnership();const claim=claimSupervisorWrite(c,state,role,channels.map(x=>x.evidence()));
   await d.record({phase:'NOTE_WRITE_CLAIMED_NO_REPLAY',...claim});
   const response=await d.patch(claim.cartId,claim.marker,credentials.admin.access);
   assert.equal(response.status,204);
   const after=await d.snapshot();const proof=reconcileSupervisorNote(c,authenticated,previous,after,role);
   await d.evidence('after-note-'+role,after);await d.record({phase:'NOTE_WRITE_RECONCILED',...proof});previous=after;
  }
  // The adapter must observe continuously for a bounded interval, with live
  // subscriptions and positive controls. A timer alone is not negative evidence.
  const observation=await d.observe(channels);
  assert.equal(observation.status,'PASS');assert.ok(observation.durationMs>=10000&&observation.durationMs<=60000);assert.equal(observation.continuousLiveChecks,true);
  const wire=supervisorIsolationEvidence(channels);await d.evidence('wire-isolation',wire);
  const native=await d.native('after');assert.equal(native.status,'PASS');assert.equal(native.role,'supervisor');assert.equal(native.artifactSHA256,c.artifactSHA256);assert.equal(native.foreignContent,false);assert.equal(native.ownEventRefetchObserved,true);assert.equal(native.manualRefresh,false);
  const final=await d.snapshot();assert.deepEqual(final,previous,'State changed during native/wire observation');
  // Re-check channels after native observation, before accepting negative proof.
  supervisorIsolationEvidence(channels);await d.evidence('accepted-state',final);
  state.acceptanceReconciled=true;await d.record({phase:'WIRE_SQL_STORAGE_NATIVE_GATES_PASS'});
  for(const channel of channels)channel.close();
  for(const role of ['A','supervisor','admin'])await logoutSupervisorAccount(c,role,credentials[role],d,state);
  await d.verifyOwnership();const result={status:'PASS',scope:'A/supervisor/admin Realtime with actual native supervisor and independent state reconciliation',wire,native,notesPreserved:true,newAPISessionsRemoved:true,nativeSessionPreserved:true};
  await d.evidence('final-acceptance',result);return result;
 }catch(error){await d.record({phase:'REALTIME_ISOLATION_STOPPED_NO_REPLAY_OR_AUTOMATIC_CLEANUP',exceptionType:error.name});throw error;}
 finally{for(const channel of channels)channel.close();for(const role of Object.keys(credentials))credentials[role]=undefined;}
}
