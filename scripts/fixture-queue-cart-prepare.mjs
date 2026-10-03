import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function queueCartPayload(c){
 assert.equal(c.scope,'isolated-fictional-queue-cart-preparation');assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');assert.match(c.nativeSessionId,uuid);
 assert.equal(c.cartId,'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0');assert.equal(c.customerId,'a823809c-bdb6-11f1-b1be-47a66d90b06d');assert.equal(c.lotId,'a248cdd4-bdf3-11f1-97a9-efb90ed37151');assert.equal(c.quantity,2);assert.equal(c.expectedStock,6);assert.equal(c.record,'FXQ996');
 return {p_order_id:c.cartId,p_grn_item_id:c.lotId,p_quantity:2};
}
export async function prepareQueueCart(c,d,state){
 const payload=queueCartPayload(c);assert.equal(state.cartAttempts,0);assert.equal(state.authAttempts,0);assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();
 const b=await d.snapshot();assert.equal(b.recordAbsent,true);assert.equal(b.customerActive,true);assert.equal(b.customerRole,'customer');assert.equal(b.nativeSessionPresent,true);assert.equal(b.items.length,0);assert.equal(b.order.id,c.cartId);assert.equal(b.order.status,'OPEN');assert.equal(b.lot.stock,6);assert.ok(b.quota.hourly<5&&b.quota.daily<20);await d.evidence('before',b);
 state.authAttempts=1;await d.record({phase:'ONE_ORDINARY_CUSTOMER_AUTHENTICATION_ATTEMPT'});const credentials=await d.authenticate();const authenticated=await d.snapshot();await d.verifyAuthentication(b,authenticated,credentials.sessionId);await d.evidence('authenticated',authenticated);
 assert.ok(Date.now()<Date.parse(c.deadlineUTC));await d.verifyOwnership();state.cartAttempts=1;await d.record({phase:'ONE_FRESH_CART_ADD_ATTEMPT'});let response;
 try{response=await d.cart(payload,credentials.access);}catch(error){await d.evidence('uncertain-after',await d.snapshot());await d.record({phase:'UNCERTAIN_CART_STOPPED_NO_REPLAY_OR_CLEANUP'});throw error;}
 const after=await d.snapshot();await d.evidence('after-write',after);assert.equal(response.status,200);assert.equal(response.body.success,true);await d.verifyCart(authenticated,after,response.body);state.cartReconciled=true;await d.record({phase:'FRESH_CART_ITEM_RECONCILED'});
 await d.logout(credentials.refresh);const final=await d.snapshot();await d.verifyCleanup(after,final,credentials.sessionId);await d.evidence('final',final);
 return {status:'PASS',scope:'fictional-ordinary-cart-preparation-for-APK10-queue',artifactSHA256:c.artifactSHA256,cartId:c.cartId,orderItemId:after.items[0].id,lotId:c.lotId,quantity:2,expectedStock:6,protectedStateReconciled:true,ordinaryAuthentication:true,onlyNewAPISessionLoggedOut:true,nativeCartCreationAccepted:false};
}
