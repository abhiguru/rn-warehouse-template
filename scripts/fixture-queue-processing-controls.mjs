import assert from 'node:assert/strict';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function queueConfig(c){
 const exact={scope:'isolated-fictional-native-queue-processing',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',role:'supervisor',cartId:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',customerName:'Backend Test Customer A',sourceReceipt:'FXC701',sourceGRNId:'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97',lotId:'a248cdd4-bdf3-11f1-97a9-efb90ed37151',orderItemId:'5e4bceea-be36-11f1-a453-ebff20c7e341',record:'FXQ992',quantity:2,expectedStock:8,artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',orderProvenance:'preserved ordinary API fixture; native customer creation not accepted'};
 for(const[k,v]of Object.entries(exact))assert.equal(c[k],v,`Queue binding mismatch: ${k}`);
 assert.match(c.sessionId,UUID);return c;
}
export function queueBefore(c,s){
 queueConfig(c);assert.deepEqual(s.profile,{id:c.profileId,role:c.role,active:true,status:'approved'});assert.equal(s.nativeSessionPresent,true);assert.equal(s.recordAbsent,true);
 assert.equal(s.order.id,c.cartId);assert.equal(s.order.customer_id,c.customerId);assert.equal(s.order.status,'OPEN');assert.equal(s.order.deleted_at,null);
 assert.equal(s.items.length,1);const i=s.items[0];assert.equal(i.id,c.orderItemId);assert.equal(i.order_id,c.cartId);assert.equal(i.grn_items_id,c.lotId);assert.equal(i.grns_id,c.sourceGRNId);assert.equal(i.requested_quantity,c.quantity);assert.equal(i.fulfilled_quantity,0);assert.equal(i.item_status,'pending');
 assert.equal(s.lots.length,1);assert.equal(s.lots[0].id,c.lotId);assert.equal(s.lots[0].gr_id,c.sourceGRNId);assert.equal(s.lots[0].qty,8);assert.equal(s.lots[0].stock,c.expectedStock);
 return {status:'PASS',scope:'queue fixture precondition only; submission not authorized'};
}
export function queuePreparationUnchanged(c,b,a){queueBefore(c,b);queueBefore(c,a);assert.deepEqual(a,b,'Queue preparation changed protected state; stop without submission');return{status:'PASS',scope:'queue preparation only; no native dispatch acceptance'};}
