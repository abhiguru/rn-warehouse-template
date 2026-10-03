// Read-only SQL construction for one reserved direct, partial dispatch case.
import assert from 'node:assert/strict';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function dispatchConfig(c) {
  assert.equal(c.scope, 'isolated-fictional-dispatch-observation');
  assert.equal(c.kind, 'dispatch');
  for (const field of ['record', 'sourceReceipt']) assert.match(c[field], /^FXF\d{2,5}$/);
  assert.notEqual(c.record, c.sourceReceipt);
  for (const field of ['instanceId', 'stockLineId']) assert.match(c[field], uuid);
  for (const field of ['artifactSHA256', 'fixtureGuardSHA256']) assert.match(c[field], /^[a-f0-9]{64}$/);
  assert.ok(['before-upstream', 'after-upstream-success'].includes(c.phase));
  assert.ok(Number.isSafeInteger(c.quantity) && c.quantity > 0);
  assert.ok(Number.isSafeInteger(c.sourceQuantity) && c.sourceQuantity > c.quantity);
  assert.match(c.sourcePackageMark, /^[A-Za-z0-9 -]{0,30}$/);
  return c;
}
export function dispatchSnapshotSQL(c, key = null) {
  dispatchConfig(c);
  if (key !== null) assert.match(key, /^warehouse-dispatch-[a-f0-9]{64}$/);
  const keyMatch = key === null ? 'false' : `k.idempotency_key='${key}'`;
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
WITH target AS (SELECT * FROM public.dispatch WHERE disp_no='${c.record}'),
lines AS (SELECT t.* FROM public.dispatch_trl t JOIN target d ON d.id=t.disp_id),
cache AS (SELECT k.* FROM public.idempotency_keys k WHERE ${keyMatch}
 OR k.response->>'dispatch_id' IN (SELECT id::text FROM target))
SELECT jsonb_build_object(
 'instanceId','${c.instanceId}',
 'headerIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM target),
 'lineIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM lines),
 'quantity',(SELECT coalesce(sum(disp_qty),0) FROM lines),
 'stock',(SELECT stock FROM public.goodsreceived_trl WHERE id='${c.stockLineId}'),
 'sourceBound',(SELECT count(*)=1 FROM public.goodsreceived_trl t JOIN public.goodsreceived g ON g.id=t.gr_id
   WHERE t.id='${c.stockLineId}' AND g.gr_no='${c.sourceReceipt}' AND g.deleted_at IS NULL),
 'sourceLineCount',(SELECT count(*) FROM public.goodsreceived_trl t JOIN public.goodsreceived g ON g.id=t.gr_id WHERE g.gr_no='${c.sourceReceipt}'),
 'sourceQuantity',(SELECT qty FROM public.goodsreceived_trl WHERE id='${c.stockLineId}'),
 'sourcePackageMark',(SELECT coalesce(package_mark,'') FROM public.goodsreceived_trl WHERE id='${c.stockLineId}'),
 'wrongStockLines',(SELECT count(*) FROM lines WHERE gr_trl_id IS DISTINCT FROM '${c.stockLineId}'::uuid),
 'invoices',(SELECT count(*) FROM public.invoice WHERE notes='Auto-generated invoice for dispatch ${c.record}'),
 'cacheCount',(SELECT count(*) FROM cache),
 'cacheSuccess',(SELECT bool_and(response->>'success'='true' AND rpc_function='create_dispatch_with_stock_check') FROM cache),
 'cachedHeaderId',(SELECT min(response->>'dispatch_id') FROM cache),
 'unrelatedBusinessHash',encode(extensions.digest(jsonb_build_object(
  'receipts',(SELECT jsonb_agg(CASE WHEN gr_no='${c.sourceReceipt}' THEN to_jsonb(g)-'updated_at' ELSE to_jsonb(g) END ORDER BY id) FROM public.goodsreceived g),
  'receiptLines',(SELECT jsonb_agg(CASE WHEN id='${c.stockLineId}' THEN to_jsonb(t)-'stock' ELSE to_jsonb(t) END ORDER BY id) FROM public.goodsreceived_trl t),
  'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d WHERE disp_no<>'${c.record}'),
  'dispatchLines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.dispatch_trl t WHERE disp_id NOT IN (SELECT id FROM target)),
  'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
  'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
  'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
  'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
  'autoInvoiceErrors',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.auto_invoice_errors a),
  'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)
 )::text,'sha256'),'hex'));
COMMIT;`;
}
export function dispatchSnapshotShape(c, s, baseline = false) {
  dispatchConfig(c);
  assert.equal(s.sourceBound, true, 'RESERVED_SOURCE_NOT_BOUND');
  assert.equal(s.wrongStockLines, 0, 'WRONG_STOCK_LINE');
  assert.equal(s.sourceLineCount, 1, 'ONE_SOURCE_LOT_REQUIRED');
  assert.equal(s.sourceQuantity, c.sourceQuantity, 'SOURCE_QUANTITY_MISMATCH');
  assert.equal(s.sourcePackageMark, c.sourcePackageMark, 'SOURCE_MARK_MISMATCH');
  if (baseline) assert.ok(s.stock > c.quantity, 'PARTIAL_DISPATCH_STOCK_REQUIRED');
}
