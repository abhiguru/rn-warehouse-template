import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function bInvoicePreparationConfig(c,now=Date.now()) {
  assert.equal(c.scope,'isolated-fictional-b-invoice-preparation');
  assert.equal(c.artifactSHA256,'a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69');
  assert.equal(c.origin,'https://backend-core.example.test');
  assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');
  assert.equal(c.customerId,'a8246002-bdb6-11f1-b1bf-07b1deb5bca2');
  assert.equal(c.customerName,'Backend Test Customer B');
  assert.equal(c.receiptNumber,'FXI971');assert.equal(c.dispatchNumber,'FXI972');
  assert.equal(c.invoiceNumber,20261031);assert.equal(c.financialYear,2026);
  assert.equal(c.noAutomaticRetry,true);assert.equal(c.attempt,1);
  assert.equal(c.durationMode,'legacy');assert.match(c.itemId,uuid);
  for(const k of ['receiptDate','dispatchDate'])assert.ok(Number.isFinite(Date.parse(c[k])));
  assert.ok(Date.parse(c.dispatchDate)>=Date.parse(c.receiptDate));
  assert.ok(Date.parse(c.deadlineUTC)>now&&Date.parse(c.deadlineUTC)-now<=600000);
  assert.match(c.receiptKey,/^fixture-b-invoice-receipt-[a-f0-9-]{16,60}$/);
  assert.match(c.dispatchKey,/^fixture-b-invoice-dispatch-[a-f0-9-]{16,60}$/);
  assert.notEqual(c.receiptKey,c.dispatchKey);return c;
}
export function bInvoiceReceiptPayload(c,now) {
  bInvoicePreparationConfig(c,now);
  return {p_gr_no:c.receiptNumber,p_date:c.receiptDate,p_customer_id:c.customerId,p_customer_name:c.customerName,p_pricing_mode:'MONTHLY',p_idempotency_key:c.receiptKey,p_items:[{item_id:c.itemId,item_name:'Backend Test Potatoes',packaging:'Bag',qty:1,weight:10,rack:'TEST INVOICE ISOLATION'}]};
}
export function bInvoiceDispatchPayload(c,lotId,now) {
  bInvoicePreparationConfig(c,now);assert.match(lotId,uuid);
  return {p_dispatch_data:{disp_no:c.dispatchNumber,disp_date:c.dispatchDate,customer_id:c.customerId,customer_name:c.customerName,supervisor_id:'f94caa4f-0051-4660-920a-5f41aac86fa7',supervisor_name:'Core Demo Administrator'},p_dispatch_items:[{gr_trl_id:lotId,disp_qty:1}],p_generate_invoice:false,p_idempotency_key:c.dispatchKey};
}
export function bInvoiceSavePayload(c,receiptId,dispatchLineId,preview,now) {
  bInvoicePreparationConfig(c,now);assert.match(receiptId,uuid);assert.match(dispatchLineId,uuid);
  assert.equal(preview.success,true);assert.equal(preview.rows.length,1);
  const row=preview.rows[0];assert.equal(row.dispatches_items_id??row.disp_trl_id??row.dispatch_item_id,dispatchLineId);
  assert.equal(row.dispatch_qty,1);
  const charge=row.unit_price??row.charge,tax=row.tax_percent??row.tax,labour=row.labour_rate;
  for(const value of [charge,tax,labour,preview.totals.grand_total,preview.totals.tax])assert.ok(Number.isFinite(value)&&value>=0);
  return {p_invoice_data:{inv_no:c.invoiceNumber,inv_fin_year:c.financialYear,gr_id:receiptId,gr_no:c.receiptNumber,customer_id:c.customerId,customer_name:c.customerName,inv_date:c.dispatchDate,total:preview.totals.grand_total,tax_amount:preview.totals.tax,discount:0,duration_mode:c.durationMode,items:[{disp_trl_id:dispatchLineId,charge,tax,labour_rate:labour}]}};
}
