import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function queueConfig(c){
 if(Object.hasOwn(c,'currentArtifactQueue'))assert.equal(typeof c.currentArtifactQueue,'boolean');
 const current=c.currentArtifactQueue===true;
 if(current){assert.match(c.orderItemId,UUID);assert.ok(isAbsolute(c.preparationProof));assert.match(c.preparationProofSHA256,/^[a-f0-9]{64}$/);}
 const exact={scope:'isolated-fictional-native-queue-processing',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',role:'supervisor',cartId:'ce9cb158-bdb6-11f1-8391-8b2b4fd918b0',customerId:'a823809c-bdb6-11f1-b1be-47a66d90b06d',customerName:'Backend Test Customer A',sourceReceipt:'FXC701',sourceGRNId:'a2489c56-bdf3-11f1-97a8-8b3d06ae4c97',lotId:'a248cdd4-bdf3-11f1-97a9-efb90ed37151',orderItemId:current?c.orderItemId:'5e4bceea-be36-11f1-a453-ebff20c7e341',record:current?'FXQ996':'FXQ992',quantity:2,expectedStock:current?6:8,artifactSHA256:current?'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69':'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',orderProvenance:'preserved ordinary API fixture; native customer creation not accepted'};
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

const protectedTables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items','storage.objects'];
function rowMaps(s){assert.deepEqual(Object.keys(s.protectedRows).sort(),[...protectedTables].sort());const maps={};for(const t of protectedTables){maps[t]={};assert.ok(Array.isArray(s.protectedRows[t])&&s.protectedRows[t].length<=10000);for(const r of s.protectedRows[t]){assert.match(r.id,UUID);assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(maps[t],r.id));maps[t][r.id]=r.sha256;}}return maps;}
function sameExcept(a,b,fields){const x={...a},y={...b};for(const k of fields){delete x[k];delete y[k];}assert.deepEqual(x,y);}
export function queueCommitReconciled(c,b,a){
 queueBefore(c,b);assert.deepEqual(b.dispatches,[]);assert.deepEqual(b.dispatchLines,[]);assert.deepEqual(b.movements,[]);assert.deepEqual(b.caches,[]);
 assert.deepEqual(a.profile,b.profile);assert.equal(a.nativeSessionPresent,true);assert.equal(a.authHash,b.authHash);assert.equal(a.storageHash,b.storageHash);assert.equal(a.recordAbsent,false);
 assert.equal(a.dispatches.length,1);assert.equal(a.dispatchLines.length,1);assert.equal(a.movements.length,1);assert.equal(a.caches.length,1);
 const d=a.dispatches[0],l=a.dispatchLines[0],m=a.movements[0],k=a.caches[0];for(const r of[d,l,m,k])assert.match(r.id,UUID);
 assert.equal(d.disp_no,c.record);assert.equal(d.customer_id,c.customerId);assert.equal(d.source_order_id,c.cartId);assert.equal(d.source_order_no,b.order.order_no);assert.equal(d.created_by,c.profileId);assert.equal(d.updated_by,c.profileId);assert.equal(d.deleted_at,null);assert.equal(d.deleted_by,null);
 assert.equal(l.disp_id,d.id);assert.equal(l.gr_id,c.sourceGRNId);assert.equal(l.gr_trl_id,c.lotId);assert.equal(l.disp_qty,2);
 assert.equal(m.reference_id,d.id);assert.equal(m.reference_type,'dispatch');assert.equal(m.gr_trl_id,c.lotId);assert.equal(m.movement_type,'dispatch');assert.equal(m.quantity,2);assert.equal(m.balance_before,c.expectedStock);assert.equal(m.balance_after,c.expectedStock-c.quantity);assert.equal(m.created_by,c.profileId);
 assert.equal(k.rpc_function,'create_dispatch_with_stock_check');assert.equal(k.created_by,c.profileId);assert.ok(typeof k.idempotency_key==='string'&&k.idempotency_key.length>=16&&k.idempotency_key.length<=200);assert.equal(k.response.success,true);assert.equal(k.response.dispatch_id,d.id);assert.equal(k.response.source_order_cleared,true);assert.deepEqual(k.response.invoice_data,{});assert.equal(k.response.dispatch_items.length,1);assert.equal(k.response.dispatch_items[0].id,l.id);assert.equal(k.response.dispatch_items[0].disp_qty,2);assert.equal(k.response.dispatch_items[0].remaining_stock,c.expectedStock-c.quantity);
 assert.equal(a.items.length,0);assert.equal(a.lots.length,1);sameExcept(b.lots[0],a.lots[0],['stock']);assert.equal(a.lots[0].stock,c.expectedStock-c.quantity);
 sameExcept(b.order,a.order,['updated_at','updated_by']);assert.equal(a.order.updated_by,c.profileId);assert.equal(a.order.status,'OPEN');assert.equal(a.order.deleted_at,null);
 sameExcept(b.receipt,a.receipt,['updated_at','updated_by']);assert.equal(a.receipt.updated_by,c.profileId);assert.equal(a.receipt.out_of_stock,false);
 const bm=rowMaps(b),am=rowMaps(a),expected={goodsreceived:[c.sourceGRNId],goodsreceived_trl:[c.lotId],orders:[c.cartId],order_items:[c.orderItemId],dispatch:[d.id],dispatch_trl:[l.id],stock_movements:[m.id],idempotency_keys:[k.id]};
 for(const[t,ids]of Object.entries(expected))for(const id of ids){if(['dispatch','dispatch_trl','stock_movements','idempotency_keys'].includes(t)){assert.ok(!Object.hasOwn(bm[t],id));assert.ok(Object.hasOwn(am[t],id));}else{assert.ok(Object.hasOwn(bm[t],id));if(t==='order_items')assert.ok(!Object.hasOwn(am[t],id));else assert.ok(Object.hasOwn(am[t],id));}delete bm[t][id];delete am[t][id];}
 assert.deepEqual(am,bm,'Unrelated business/object rows changed; stop without retry');
 return{status:'PASS',scope:'one queue dispatch, matched line removed, persistent order OPEN; unrelated business/auth/storage preserved',dispatchId:d.id};
}

export function currentQueuePreparation(c,p){
 queueConfig(c);assert.equal(c.currentArtifactQueue,true);assert.equal(p.status,'PASS');assert.equal(p.scope,'fictional-ordinary-cart-preparation-for-APK10-queue');
 for(const name of ['artifactSHA256','cartId','orderItemId','lotId','quantity','expectedStock'])assert.equal(p[name],c[name]);
 assert.equal(p.protectedStateReconciled,true);assert.equal(p.ordinaryAuthentication,true);assert.equal(p.onlyNewAPISessionLoggedOut,true);assert.equal(p.nativeCartCreationAccepted,false);
 return p;
}
