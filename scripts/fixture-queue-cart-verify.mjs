import assert from 'node:assert/strict';
import {queueCartPayload} from './fixture-queue-cart-prepare.mjs';
function protectedState(b,a){for(const k of ['unrelatedRowsHash','unrelatedAuthHash','storageHash','customerStaticHash','nativeSessionPresent','recordAbsent','lot'])assert.deepEqual(a[k],b[k],k+' changed');assert.equal(a.nativeSessionPresent,true);}
export function verifyPreparationAuthentication(b,a,id){
 protectedState(b,a);for(const k of ['order','items'])assert.deepEqual(a[k],b[k]);assert.equal(a.verifiedOTPs,b.verifiedOTPs+1);assert.equal(a.quota.hourly,b.quota.hourly+1);assert.equal(a.quota.daily,b.quota.daily+1);assert.deepEqual(a.customerSessions.filter(s=>s.id!==id),b.customerSessions);assert.equal(a.customerSessions.filter(s=>s.id===id).length,1);
}
export function verifyPreparedCart(c,b,a,response){
 queueCartPayload(c);protectedState(b,a);assert.equal(a.authHash,b.authHash);assert.equal(b.items.length,0);assert.equal(a.items.length,1);assert.equal(response.success,true);const item=a.items[0];assert.match(item.id,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.equal(item.order_id,c.cartId);assert.equal(item.grn_items_id,c.lotId);assert.equal(item.grns_id,'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97');assert.equal(item.requested_quantity,2);assert.equal(item.fulfilled_quantity,0);assert.equal(item.item_status,'pending');
 const strip=o=>{const x={...o};delete x.updated_at;delete x.updated_by;return x;};assert.deepEqual(strip(a.order),strip(b.order));assert.equal(a.order.status,'OPEN');assert.equal(a.order.updated_by,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');
}
export function verifyPreparationCleanup(b,a,id){
 protectedState(b,a);for(const k of ['order','items','verifiedOTPs','quota'])assert.deepEqual(a[k],b[k]);assert.ok(b.customerSessions.some(s=>s.id===id));assert.deepEqual(a.customerSessions,b.customerSessions.filter(s=>s.id!==id));
}
