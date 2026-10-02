import assert from 'node:assert/strict';
import {realtimeAfter,claimRealtimeWrite} from './fixture-realtime-controls.mjs';

// Native readiness owns the actor lock. All returned credentials remain in process memory.
export async function runRealtime(c,d,state) {
 let caller,previous;
 try {
  const ready=await d.receive();assert.equal(ready.window,'foreground');assert.equal(ready.status,'READY');
  caller=await d.authenticate();previous=caller.baseline;
  state.ordinaryCallerAuthentication=true;state.baselineSQLValidated=true;await d.save(state);
  for(const [index,phase] of ['added','edited'].entries()) {
   const currentReady=index===0?ready:await d.receive();
   state=claimRealtimeWrite(state,phase,currentReady);await d.save(state);
   const since=new Date().toISOString();
   const rpc=phase==='added'?'add_item_to_order':'update_order_item_quantity';
   const body=phase==='added'?{p_order_id:c.orderId,p_grn_item_id:c.stockLineId,p_quantity:1}:{p_order_item_id:previous.items[0].id,p_new_quantity:2};
   let transportFailure;
   try {await d.call('/rest/v1/rpc/'+rpc,body,caller.access);}
   catch {transportFailure=true;}
   // Reconcile independently even after a lost response; never issue a replay.
   const after=await d.snapshot();await d.evidence(phase,after);
   realtimeAfter(c,caller.baseline,previous,after,phase);
   previous=after;
   if(transportFailure)throw new Error('WRITE_RESPONSE_UNCERTAIN_RECONCILED_NO_REPLAY');
   await d.send({status:'COMMITTED',phase,since,quantity:index+1,sqlReconciled:true});
   const delivered=await d.receive();
   assert.deepEqual(delivered,{status:'DELIVERED',phase,manualRefreshUsed:false});
   state.writes[index]={phase,status:'RECONCILED_AND_NATIVE_DELIVERED'};
   previous=after;await d.save(state);
  }
  assert.deepEqual(await d.receive(),{status:'PASS',scope:'native-realtime-foreground-and-reconnect'});
  await d.waitNative();state.nativePASS=true;await d.save(state);
 } catch(error) {
  state.status='FAIL';state.category='REALTIME_STOPPED_PRESERVE_AND_RECONCILE';
  await d.save(state);throw error;
 } finally {
  // Close input and let the bounded child restore its own networking before logout.
  await d.stopNative();
  if(caller) {
   state.callerLogoutAttempted=true;await d.save(state);
   assert.equal(await d.call('/rest/v1/rpc/logout_session',{p_refresh_token:caller.refresh}),true);
   const final=await d.snapshot();await d.evidence('cleanup',final);
   for(const key of ['nativeProfile','nativeSessionPresent','callerProfile','stock','cart','items','businessHash','otherAuthHash','cartStaticHash'])assert.deepEqual(final[key],previous?.[key]??caller.baseline[key],'CALLER_LOGOUT_CHANGED_UNRELATED_STATE');
   // Ordinary logout revokes/removes only this newly issued caller session.
   assert.deepEqual(final.callerSessions.filter(s=>s.id!==caller.sessionId),caller.baseline.callerSessions.filter(s=>s.id!==caller.sessionId));
   const own=final.callerSessions.find(s=>s.id===caller.sessionId);
   assert.equal(own,undefined,'CALLER_LOGOUT_NOT_OBSERVED');
   state.callerLoggedOut=true;caller=undefined;await d.save(state);
  }
 }
 if(state.nativePASS&&state.callerLoggedOut){state.status='PASS';await d.save(state);}
 return state;
}
