// Read-only observation of one reserved, single-item, image-free native receipt.
import assert from 'node:assert/strict';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function receiptConfig(c) {
  assert.equal(c.scope, 'isolated-fictional-receipt-observation');
  assert.equal(c.kind, 'receipt');
  assert.match(c.record, /^FXF\d{2,5}$/);
  for (const field of ['instanceId','customerId','itemId']) assert.match(c[field], uuid);
  for (const field of ['artifactSHA256','fixtureGuardSHA256']) assert.match(c[field], /^[a-f0-9]{64}$/);
  assert.ok(['before-upstream','after-upstream-success'].includes(c.phase));
  assert.ok(Number.isSafeInteger(c.quantity) && c.quantity > 0 && c.quantity <= 50);
  assert.ok(Number.isSafeInteger(c.weight) && c.weight > 0 && c.weight <= 1000);
  return c;
}
export function receiptSnapshotSQL(c, key = null) {
  receiptConfig(c);
  if (key !== null) assert.match(key, /^warehouse-grn-[a-f0-9]{64}$/);
  const keyMatch = key === null ? 'false' : `k.idempotency_key='${key}'`;
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
WITH target AS (SELECT * FROM public.goodsreceived WHERE gr_no='${c.record}'),
lines AS (SELECT t.* FROM public.goodsreceived_trl t JOIN target g ON g.id=t.gr_id),
cache AS (SELECT k.* FROM public.idempotency_keys k WHERE ${keyMatch}
 OR k.response#>>'{data,grn_id}' IN (SELECT id::text FROM target))
SELECT jsonb_build_object(
 'instanceId','${c.instanceId}',
 'headerIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM target),
 'lineIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM lines),
 'quantity',(SELECT coalesce(sum(qty),0) FROM lines),
 'stock',(SELECT coalesce(sum(stock),0) FROM lines),
 'wrongCustomer',(SELECT count(*) FROM target WHERE customer_id IS DISTINCT FROM '${c.customerId}'::uuid),
 'wrongItem',(SELECT count(*) FROM lines WHERE item_id IS DISTINCT FROM '${c.itemId}'::uuid OR item_name IS DISTINCT FROM 'Backend Test Potatoes' OR weight IS DISTINCT FROM ${c.weight}),
 'images',(SELECT count(*) FROM public.grn_images WHERE grn_id IN (SELECT id FROM target)),
 'invoices',(SELECT count(*) FROM public.invoice WHERE gr_no='${c.record}'),
 'cacheCount',(SELECT count(*) FROM cache),
 'cacheSuccess',(SELECT bool_and(response->>'success'='true' AND rpc_function='save_grn') FROM cache),
 'cachedHeaderId',(SELECT min(response#>>'{data,grn_id}') FROM cache),
 'unrelatedBusinessHash',encode(extensions.digest(jsonb_build_object(
  'receipts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g WHERE gr_no<>'${c.record}'),
  'receiptLines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.goodsreceived_trl t WHERE gr_id NOT IN (SELECT id FROM target)),
  'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
  'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
  'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
  'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
  'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
  'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
  'images',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.grn_images g),
  'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)
 )::text,'sha256'),'hex'));
COMMIT;`;
}
export function receiptSnapshotShape(c, s) {
  receiptConfig(c);
  assert.equal(s.wrongCustomer, 0, 'WRONG_CUSTOMER');
  assert.equal(s.wrongItem, 0, 'WRONG_ITEM_OR_WEIGHT');
  assert.equal(s.images, 0, 'IMAGE_CASE_REQUIRES_SEPARATE_OBJECT_RECONCILIATION');
}
