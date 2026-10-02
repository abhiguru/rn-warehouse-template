import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function realtimeConfig(c) {
  assert.equal(c.scope,'isolated-fictional-native-realtime');
  assert.equal(c.origin,'https://backend-core.example.test');
  assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');
  assert.equal(c.callerPhone,'919888888872');
  assert.equal(c.orderId,'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0');
  assert.equal(c.record,'FXC701');
  assert.deepEqual(c.quantities,[1,2]);
  assert.equal(c.manualRefreshDuringObservation,false);
  for(const k of ['sessionId','stockLineId','customerId','callerProfileId'])assert.match(c[k],uuid);
  for(const k of ['soakConfig','caseDirectory','prerequisiteEvidence','otpSocket'])assert.ok(isAbsolute(c[k]));
  return c;
}

export function realtimeBefore(c,s) {
  realtimeConfig(c);
  assert.deepEqual(s.nativeProfile,{id:c.profileId,role:'customer',active:true,name:'New customer'});
  assert.equal(s.nativeSessionPresent,true);
  assert.deepEqual(s.callerProfile,{id:c.callerProfileId,role:'customer',active:true,name:'Customer A'});
  assert.equal(s.stock.id,c.stockLineId);assert.equal(s.stock.customerId,c.customerId);
  assert.equal(s.stock.record,'FXC701');assert.equal(s.stock.stock,8);assert.equal(s.stock.qty,8);
  assert.equal(s.cart.id,c.orderId);assert.equal(s.cart.customerId,c.customerId);assert.equal(s.cart.status,'OPEN');
  assert.ok(Array.isArray(s.cart.revisions));assert.deepEqual(s.items,[]);
  for(const k of ['businessHash','otherAuthHash','cartStaticHash'])assert.match(s[k],/^[a-f0-9]{64}$/);
}

export function realtimeAfter(c,before,previous,after,phase) {
  realtimeBefore(c,before);
  const quantity=phase==='added'?1:phase==='edited'?2:undefined;
  assert.ok(quantity!==undefined,'Only the two bounded successful transitions are accepted');
  for(const k of ['nativeProfile','nativeSessionPresent','callerProfile','stock','businessHash','otherAuthHash','cartStaticHash'])
    assert.deepEqual(after[k],before[k],'UNRELATED_REALTIME_STATE_CHANGED');
  for(const k of ['id','customerId','status'])assert.equal(after.cart[k],before.cart[k]);
  assert.equal(after.items.length,1);
  const item=after.items[0];assert.match(item.id,uuid);assert.equal(item.stockLineId,c.stockLineId);
  assert.equal(item.quantity,quantity);assert.equal(item.fulfilled,0);
  if(phase==='edited') {
    assert.equal(previous.items.length,1);assert.equal(previous.items[0].quantity,1);
    assert.equal(item.id,previous.items[0].id,'Fresh line must not be replaced');
  } else assert.deepEqual(previous.items,[]);
  assert.equal(after.cart.revisions.length,previous.cart.revisions.length+1);
  assert.deepEqual(after.cart.revisions.slice(0,-1),previous.cart.revisions,'Preserve every existing revision');
  const revision=after.cart.revisions.at(-1);
  assert.equal(revision.by,c.callerProfileId);assert.equal(revision.action,'UPDATE');
  assert.equal(revision.cart_items.length,1);assert.equal(revision.cart_items[0].quantity,quantity);
  return item.id;
}

// The caller persists the returned ledger before sending the HTTP request.
// Any attempted write remains consumed even if transport or UI evidence fails.
export function claimRealtimeWrite(ledger,phase,ready) {
  assert.equal(ledger.ordinaryCallerAuthentication,true);
  assert.equal(ledger.baselineSQLValidated,true);
  assert.equal(ledger.status,'RUNNING');
  assert.ok(Array.isArray(ledger.writes));
  assert.equal(ready.status,'READY');assert.equal(ready.manualRefreshUsed,false);
  if(phase==='added') {
    assert.equal(ready.window,'foreground');assert.equal(ledger.writes.length,0);
  } else {
    assert.equal(phase,'edited');assert.equal(ready.window,'reconnected');
    assert.equal(ready.ownedNetworkRestored,true);
    assert.equal(ledger.writes.length,1);
    assert.deepEqual(ledger.writes[0],{phase:'added',status:'RECONCILED_AND_NATIVE_DELIVERED'});
  }
  return {...ledger,writes:[...ledger.writes,{phase,status:'ATTEMPTED_NO_REPLAY'}]};
}
