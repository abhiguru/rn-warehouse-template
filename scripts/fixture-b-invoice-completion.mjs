import assert from 'node:assert/strict';
import {bInvoicePreparationConfig,bInvoiceSavePayload} from './fixture-b-invoice-preparation.mjs';
import {bInvoiceAuthentication,bInvoicePreviewPreserved,bInvoiceCommitted,bInvoiceCleanup} from './fixture-b-invoice-preparation-verify.mjs';
export function bInvoiceCompletionBefore(c,s,prior){
 bInvoicePreparationConfig(c);assert.equal(c.continuationAfterReconciledDispatch,true);
 assert.equal(prior.status,'PASS');assert.equal(prior.scope,'independent actual post-failure committed dispatch reconciliation; original stage FAIL retained');assert.equal(prior.writeReplayed,false);assert.equal(prior.invoiceCount,0);assert.equal(prior.stock,0);assert.equal(prior.outOfStock,true);
 assert.equal(s.adminActive,true);assert.equal(s.adminRole,'admin');assert.ok(s.quota.hourly<5&&s.quota.daily<20);
 for(const k of ['receipts','lots','dispatches','dispatchLines','dispatchMovements'])assert.equal(s[k].length,1);assert.equal(s.caches.length,2);assert.deepEqual(s.invoices,[]);assert.deepEqual(s.invoiceLines,[]);
 assert.equal(s.receipts[0].id,prior.receiptId);assert.equal(s.receipts[0].gr_no,c.receiptNumber);assert.equal(s.receipts[0].customer_id,c.customerId);assert.equal(s.receipts[0].out_of_stock,true);assert.equal(s.lots[0].stock,0);assert.equal(s.lots[0].qty,1);assert.equal(s.dispatches[0].id,prior.dispatchId);assert.equal(s.dispatches[0].disp_no,c.dispatchNumber);assert.equal(s.dispatches[0].customer_id,c.customerId);assert.equal(s.dispatchLines[0].disp_qty,1);assert.equal(s.dispatchLines[0].gr_trl_id,s.lots[0].id);assert.equal(s.dispatchLines[0].gr_id,prior.receiptId);
}
export async function completeBInvoiceFixture(c,d,state,prior){
 assert.deepEqual(state.attempts,{authentication:0,receipt:0,dispatch:0,invoice:0});
 const checkpoint=async label=>{await d.verifyOwnership();const s=await d.snapshot();await d.evidence(label,s);return s;};
 const before=await checkpoint('before');bInvoiceCompletionBefore(c,before,prior);await d.verifyPriorState(before);
 state.attempts.authentication=1;await d.record('ONE_NEW_ORDINARY_ADMINISTRATOR_AUTHENTICATION');const credentials=await d.authenticate();const authenticated=await checkpoint('authenticated');bInvoiceAuthentication(before,authenticated,credentials.sessionId);
 bInvoicePreparationConfig(c);const preview=await d.preview(before.receipts[0].id,credentials.access);const previewed=await checkpoint('previewed');bInvoicePreviewPreserved(authenticated,previewed);await d.evidence('preview',{success:preview.success,rows:preview.rows,totals:preview.totals});let payload;try{payload=bInvoiceSavePayload(c,before.receipts[0].id,before.dispatchLines[0].id,preview);}catch(error){await d.record('PREVIEW_PAYLOAD_REFUSED_NO_INVOICE_WRITE');await d.logout(credentials.refresh);const stopped=await checkpoint('preview-refused-cleanup');bInvoiceCleanup(previewed,stopped,credentials.sessionId);state.previewRefusalCleanup=true;await d.record('ONLY_NEW_READONLY_PREVIEW_SESSION_REMOVED');throw error;}
 await d.verifyOwnership();bInvoicePreparationConfig(c);state.attempts.invoice=1;await d.record('ONE_INVOICE_WRITE_NO_RECEIPT_OR_DISPATCH_REPLAY');let response;
 try{response=await d.call('invoice',payload,credentials.access);}catch(error){await d.evidence('uncertain-invoice',await d.snapshot());await d.record('UNCERTAIN_INVOICE_NO_REPLAY_OR_CLEANUP');throw error;}
 const invoiced=await checkpoint('invoice-committed');bInvoiceCommitted(c,previewed,invoiced,response,preview);state.allWritesReconciled=true;await d.record('INVOICE_RECONCILED_BEFORE_LOGOUT');await d.logout(credentials.refresh);const after=await checkpoint('after');bInvoiceCleanup(invoiced,after,credentials.sessionId);await d.record('ONLY_NEW_COMPLETION_SESSION_REMOVED_FAILED_SESSION_PRESERVED');
 return {status:'PASS',scope:'ordinary API B invoice-only continuation after independent dispatch reconciliation; original preparation FAIL retained',receiptId:before.receipts[0].id,dispatchId:before.dispatches[0].id,invoiceId:invoiced.invoices[0].id};
}
