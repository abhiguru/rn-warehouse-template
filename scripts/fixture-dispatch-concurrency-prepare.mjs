import assert from 'node:assert/strict';
export function concurrencyReceiptPayload(c){
 assert.equal(c.scope,'isolated-fictional-dispatch-concurrency-preparation');assert.equal(c.record,'FXQ993');assert.equal(c.customerId,'a823809c-bdb6-11f1-b1be-47a66d90b06d');
 assert.match(c.itemId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.ok(Number.isFinite(Date.parse(c.date)));assert.match(c.idempotencyKey,/^fixture-concurrency-receipt-[a-f0-9-]{16,60}$/);
 return {p_gr_no:c.record,p_date:c.date,p_customer_id:c.customerId,p_customer_name:'Backend Test Customer A',p_pricing_mode:'MONTHLY',p_idempotency_key:c.idempotencyKey,p_items:[{item_id:c.itemId,item_name:'Backend Test Potatoes',packaging:'Bag',qty:3,weight:10,rack:'TEST CONCURRENCY'}]};
}
export async function prepareConcurrencyReceipt(c,d,state){
 const payload=concurrencyReceiptPayload(c);assert.equal(state.receiptAttempts,0);assert.equal(state.authAttempts,0);assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();
 const before=await d.snapshot();assert.equal(before.receiptAbsent,true);assert.equal(before.adminActive,true);assert.equal(before.adminRole,'admin');assert.ok(before.quota.hourly<5&&before.quota.daily<20);assert.equal(before.nativeSessionPresent,true);await d.evidence('before',before);
 state.authAttempts=1;await d.record({phase:'ONE_ORDINARY_ADMIN_AUTHENTICATION_ATTEMPT'});
 const credentials=await d.authenticate(); // Credentials are never serialized or logged.
 const authenticated=await d.snapshot();await d.verifyAuthentication(before,authenticated,credentials.sessionId);await d.evidence('authenticated',authenticated);
 assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();state.receiptAttempts=1;await d.record({phase:'ONE_FRESH_RECEIPT_WRITE_ATTEMPT',record:c.record});
 let response;
 try{response=await d.receipt(payload,credentials.access);}catch(error){await d.evidence('uncertain-after',await d.snapshot());await d.record({phase:'UNCERTAIN_WRITE_STOPPED_NO_REPLAY_OR_CLEANUP'});throw error;}
 const after=await d.snapshot();await d.evidence('after-write',after);assert.equal(response.status,200);assert.equal(response.body.success,true);await d.verifyReceipt(authenticated,after,response.body);
 state.receiptReconciled=true;await d.record({phase:'FRESH_THREE_UNIT_RECEIPT_RECONCILED'});
 // Cleanup is allowed only after independent success and protected-state reconciliation.
 assert.equal(state.receiptReconciled,true);await d.logout(credentials.refresh);const final=await d.snapshot();await d.verifyCleanup(after,final,credentials.sessionId);await d.evidence('final',final);await d.record({phase:'ONLY_NEW_API_SESSION_REMOVED',status:'PASS'});
 return {status:'PASS',scope:'ordinary API fixture preparation only; no native receipt acceptance',receiptId:after.receiptId,lotId:after.lotId};
}
