import assert from 'node:assert/strict';
import {concurrencyReceiptPayload} from './fixture-dispatch-concurrency-prepare.mjs';
const admin='f94caa4f-0051-4660-920a-5f41aac86fa7';
function protectedState(b,a){for(const k of ['unrelatedRowsHash','unrelatedAuthHash','storageHash','adminStaticHash','nativeSessionPresent'])assert.deepEqual(a[k],b[k],k+' changed');assert.equal(a.nativeSessionPresent,true);}
export function verifyPreparationAuthentication(b,a,id){
 protectedState(b,a);for(const k of ['receipts','lots','movements','caches'])assert.deepEqual(a[k],b[k]);
 assert.equal(a.verifiedOTPs,b.verifiedOTPs+1);assert.equal(a.quota.hourly,b.quota.hourly+1);assert.equal(a.quota.daily,b.quota.daily+1);
 assert.deepEqual(a.adminSessions.filter(s=>s.id!==id),b.adminSessions);assert.equal(a.adminSessions.filter(s=>s.id===id).length,1);
}
export function verifyPreparedReceipt(c,b,a,response){
 concurrencyReceiptPayload(c);protectedState(b,a);assert.equal(a.authHash,b.authHash);assert.equal(b.receiptAbsent,true);assert.equal(a.receiptAbsent,false);assert.equal(a.receipts.length,1);assert.equal(a.lots.length,1);assert.equal(a.caches.length,1);assert.equal(a.movements.length,0);
 const g=a.receipts[0],l=a.lots[0],k=a.caches[0];assert.equal(g.gr_no,'FXQ993');assert.equal(g.customer_id,c.customerId);assert.equal(g.created_by,admin);assert.equal(g.deleted_at,null);assert.equal(l.gr_id,g.id);assert.equal(l.item_id,c.itemId);assert.equal(l.qty,3);assert.equal(l.stock,3);assert.equal(l.rack,'TEST CONCURRENCY');
 assert.equal(k.idempotency_key,c.idempotencyKey);assert.equal(k.rpc_function,'save_grn');assert.equal(k.created_by,admin);assert.deepEqual(k.response,response);assert.equal(response.success,true);assert.equal(response.data.grn_id,g.id);assert.equal(response.data.items_created,1);assert.equal(response.data.images_saved,0);assert.deepEqual(response.data.item_ids,[l.id]);
}
export function verifyPreparationCleanup(b,a,id){
 protectedState(b,a);for(const k of ['receipts','lots','movements','caches','verifiedOTPs','quota'])assert.deepEqual(a[k],b[k]);assert.ok(b.adminSessions.some(s=>s.id===id));assert.deepEqual(a.adminSessions,b.adminSessions.filter(s=>s.id!==id));
}
