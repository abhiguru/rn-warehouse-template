import test from 'node:test';import assert from 'node:assert/strict';
import {bInvoiceAuthentication,bInvoiceCleanup,bInvoicePreviewPreserved} from './fixture-b-invoice-preparation-verify.mjs';
const b={unrelatedRowsHash:'old-business',unrelatedAuthHash:'old-other-auth',storageHash:'old-bytes',adminStaticHash:'old-profile',adminActive:true,adminRole:'admin',authHash:'auth',receipts:[],lots:[],movements:[],caches:[],dispatches:[],dispatchLines:[],dispatchMovements:[],invoices:[],invoiceLines:[],verifiedOTPs:4,quota:{hourly:1,daily:4},adminSessions:[{id:'old',hash:'unchanged'}]};
test('B fixture authentication preserves older session rows and all stored/business state',()=>{const a={...b,verifiedOTPs:5,quota:{hourly:2,daily:5},adminSessions:[...b.adminSessions,{id:'new',hash:'new-hash'}]};bInvoiceAuthentication(b,a,'new');assert.throws(()=>bInvoiceAuthentication(b,{...a,adminSessions:[{id:'old',hash:'changed'},a.adminSessions[1]]},'new'));assert.throws(()=>bInvoiceAuthentication(b,{...a,storageHash:'changed'},'new'));assert.throws(()=>bInvoiceAuthentication(b,{...a,invoices:[{id:'unexpected'}]},'new'));});
test('preview and final cleanup refuse unrelated writes, quota resets and removal of old sessions',()=>{bInvoicePreviewPreserved(b,b);assert.throws(()=>bInvoicePreviewPreserved(b,{...b,unrelatedRowsHash:'changed'}));const before={...b,adminSessions:[...b.adminSessions,{id:'new',hash:'new-hash'}]};bInvoiceCleanup(before,b,'new');assert.throws(()=>bInvoiceCleanup(before,{...b,adminSessions:[]},'new'));assert.throws(()=>bInvoiceCleanup(before,{...b,verifiedOTPs:0},'new'));assert.throws(()=>bInvoiceCleanup(before,{...b,dispatchLines:[{id:'extra'}]},'new'));});

test('full depletion requires out_of_stock true and refuses other receipt changes',async()=>{
 const {bInvoiceDispatchCommitted}=await import('./fixture-b-invoice-preparation-verify.mjs');
 const c={customerId:'B',dispatchNumber:'FXI972',receiptKey:'receipt-key',dispatchKey:'dispatch-key'};
 const receipt={id:'grn',gr_no:'FXI971',out_of_stock:false},lot={id:'lot',qty:1,stock:1};
 const oldCache={idempotency_key:c.receiptKey,response:{success:true}};
 const before={...b,receipts:[receipt],lots:[lot],caches:[oldCache]};
 const response={success:true,dispatch_id:'dispatch'};
 const after={...before,receipts:[{...receipt,out_of_stock:true}],lots:[{...lot,stock:0}],dispatches:[{id:'dispatch',disp_no:'FXI972',customer_id:'B'}],dispatchLines:[{id:'line',disp_id:'dispatch',gr_id:'grn',gr_trl_id:'lot',disp_qty:1,source_type:'direct'}],dispatchMovements:[{reference_id:'dispatch',gr_trl_id:'lot',movement_type:'dispatch',quantity:1,balance_before:1,balance_after:0}],caches:[oldCache,{idempotency_key:c.dispatchKey,rpc_function:'create_dispatch_with_stock_check',created_by:'f94caa4f-0051-4660-920a-5f41aac86fa7',response}]};
 bInvoiceDispatchCommitted(c,before,after,response);
 assert.throws(()=>bInvoiceDispatchCommitted(c,before,{...after,receipts:[{...receipt,out_of_stock:false}]},response));
 assert.throws(()=>bInvoiceDispatchCommitted(c,before,{...after,receipts:[{...after.receipts[0],gr_no:'changed'}]},response));
 assert.throws(()=>bInvoiceDispatchCommitted(c,before,{...after,lots:[{...lot,stock:-1}]},response));
});
