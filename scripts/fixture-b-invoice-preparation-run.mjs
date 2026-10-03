import assert from 'node:assert/strict';
import {bInvoicePreparationConfig,bInvoiceReceiptPayload,bInvoiceDispatchPayload,bInvoiceSavePayload} from './fixture-b-invoice-preparation.mjs';
import {bInvoicePreparationBefore,bInvoiceAuthentication,bInvoiceReceiptCommitted,bInvoiceDispatchCommitted,bInvoicePreviewPreserved,bInvoiceCommitted,bInvoiceCleanup} from './fixture-b-invoice-preparation-verify.mjs';
export async function prepareBInvoiceFixture(c,d,state){
 bInvoicePreparationConfig(c);assert.deepEqual(state.attempts,{authentication:0,receipt:0,dispatch:0,invoice:0});
 const checkpoint=async label=>{await d.verifyOwnership();const s=await d.snapshot();await d.evidence(label,s);return s;};
 const before=await checkpoint('before');bInvoicePreparationBefore(c,before);
 state.attempts.authentication=1;await d.record('ONE_ORDINARY_ADMINISTRATOR_AUTHENTICATION_ATTEMPT');
 const credentials=await d.authenticate();const authenticated=await checkpoint('authenticated');bInvoiceAuthentication(before,authenticated,credentials.sessionId);
 async function write(label,payload,access){
  bInvoicePreparationConfig(c);await d.verifyOwnership();assert.equal(state.attempts[label],0);state.attempts[label]=1;await d.record('ONE_'+label.toUpperCase()+'_WRITE_ATTEMPT');
  try{return await d.call(label,payload,access);}catch(error){await d.evidence('uncertain-'+label,await d.snapshot());await d.record('UNCERTAIN_WRITE_NO_REPLAY_OR_CLEANUP');throw error;}
 }
 const receipt=await write('receipt',bInvoiceReceiptPayload(c),credentials.access);const received=await checkpoint('receipt-committed');bInvoiceReceiptCommitted(c,authenticated,received,receipt);await d.record('RECEIPT_RECONCILED');
 const dispatch=await write('dispatch',bInvoiceDispatchPayload(c,received.lots[0].id),credentials.access);const depleted=await checkpoint('dispatch-committed');bInvoiceDispatchCommitted(c,received,depleted,dispatch);await d.record('DISPATCH_AND_DEPLETION_RECONCILED');
 bInvoicePreparationConfig(c);await d.verifyOwnership();const preview=await d.preview(received.receipts[0].id,credentials.access);const previewed=await checkpoint('previewed');bInvoicePreviewPreserved(depleted,previewed);
 const payload=bInvoiceSavePayload(c,received.receipts[0].id,depleted.dispatchLines[0].id,preview);await d.evidence('preview',{success:preview.success,rows:preview.rows,totals:preview.totals});
 const invoice=await write('invoice',payload,credentials.access);const invoiced=await checkpoint('invoice-committed');bInvoiceCommitted(c,previewed,invoiced,invoice,preview);state.allWritesReconciled=true;await d.record('INVOICE_RECONCILED_BEFORE_LOGOUT');
 assert.equal(state.allWritesReconciled,true);await d.logout(credentials.refresh);const after=await checkpoint('after');bInvoiceCleanup(invoiced,after,credentials.sessionId);await d.record('ONLY_NEW_ADMINISTRATOR_SESSION_REMOVED');
 return {status:'PASS',scope:'ordinary API B fixture preparation only; no native isolation acceptance',receiptId:received.receipts[0].id,dispatchId:depleted.dispatches[0].id,invoiceId:invoiced.invoices[0].id};
}
