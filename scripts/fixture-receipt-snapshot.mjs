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
  assert.ok(c.imagePolicy === undefined || c.imagePolicy === 'deferred-single-book-image');
  if (c.imagePolicy) assert.equal(c.phase, 'after-upstream-success', 'BEFORE_EXECUTION_RECEIPT_CAMPAIGN_CASE_BLOCKED');
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
 'imageDetails',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'grnId',grn_id,'itemId',grn_item_id,'type',image_type,'status',status,'path',storage_path,'fileSize',file_size,'mimeType',mime_type,'originalFilename',original_filename) ORDER BY id),'[]') FROM public.grn_images WHERE grn_id IN (SELECT id FROM target)),
 'imageObjects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'size',o.metadata->>'size','mimeType',o.metadata->>'mimetype') ORDER BY o.id),'[]') FROM storage.objects o WHERE o.bucket_id='grn-images' AND o.name IN (SELECT storage_path FROM public.grn_images WHERE grn_id IN (SELECT id FROM target))),
 'invoices',(SELECT count(*) FROM public.invoice WHERE gr_no='${c.record}'),
 'cacheCount',(SELECT count(*) FROM cache),
 'cacheSuccess',(SELECT bool_and(response->>'success'='true' AND rpc_function='save_grn') FROM cache),
 'cachedHeaderId',(SELECT min(response#>>'{data,grn_id}') FROM cache),
 'unrelatedBusinessHash',encode(extensions.digest(jsonb_build_object(
  'receipts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g WHERE gr_no<>'${c.record}'),
  'receiptLines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.goodsreceived_trl t WHERE gr_id NOT IN (SELECT id FROM target)),
  'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
  'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
  'imageDetails',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'grnId',grn_id,'itemId',grn_item_id,'type',image_type,'status',status,'path',storage_path,'fileSize',file_size,'mimeType',mime_type,'originalFilename',original_filename) ORDER BY id),'[]') FROM public.grn_images WHERE grn_id IN (SELECT id FROM target)),
 'imageObjects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'size',o.metadata->>'size','mimeType',o.metadata->>'mimetype') ORDER BY o.id),'[]') FROM storage.objects o WHERE o.bucket_id='grn-images' AND o.name IN (SELECT storage_path FROM public.grn_images WHERE grn_id IN (SELECT id FROM target))),
 'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
  'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
  'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
  'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
  'images',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.grn_images g WHERE grn_id NOT IN (SELECT id FROM target)),
  'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o WHERE NOT (o.bucket_id='grn-images' AND o.name IN (SELECT storage_path FROM public.grn_images WHERE grn_id IN (SELECT id FROM target))))
 )::text,'sha256'),'hex'));
COMMIT;`;
}
export function receiptSnapshotShape(c, s, phase='baseline') {
  receiptConfig(c);
  assert.equal(s.wrongCustomer, 0, 'WRONG_CUSTOMER');
  assert.equal(s.wrongItem, 0, 'WRONG_ITEM_OR_WEIGHT');
  const savedImage = c.imagePolicy && phase === 'after-retry';
  assert.equal(s.images, savedImage ? 1 : 0, 'UNEXPECTED_RECEIPT_IMAGE_COUNT');
  if (savedImage) receiptImageCommitted(c, s);
  else { assert.deepEqual(s.imageDetails ?? [], []); assert.deepEqual(s.imageObjects ?? [], []); }
}

export function receiptImageCommitted(c, s) {
  receiptConfig(c); assert.equal(c.imagePolicy, 'deferred-single-book-image');
  assert.equal(s.imageDetails.length, 1); assert.equal(s.imageObjects.length, 1);
  const image=s.imageDetails[0], object=s.imageObjects[0];
  assert.equal(s.headerIds.length, 1); assert.equal(image.grnId, s.headerIds[0]);
  assert.equal(image.type, 'header'); assert.equal(image.itemId, null); assert.equal(image.status, 'confirmed');
  assert.equal(image.mimeType, 'image/webp'); assert.ok(Number.isSafeInteger(image.fileSize) && image.fileSize>0 && image.fileSize<=10485760);
  assert.ok(image.path.startsWith('headers/'+image.grnId+'/') && !image.path.includes('..'));
  assert.equal(object.name,image.path); assert.equal(Number(object.size),image.fileSize); assert.equal(object.mimeType,image.mimeType);
}

export function receiptCoreSnapshot(s) {
  const { images, imageDetails, imageObjects, storedFiles, ...core } = s;
  void images; void imageDetails; void imageObjects; void storedFiles;
  return core;
}

export function receiptStoredImageBytes(c, before, after) {
  receiptImageCommitted(c, after);
  assert.ok(before.storedFiles && after.storedFiles, 'ACTUAL_PRIVATE_STORED_BYTES_REQUIRED');
  for (const [name, value] of Object.entries(before.storedFiles)) assert.deepEqual(after.storedFiles[name], value, 'UNRELATED_STORED_BYTES_CHANGED');
  const added=Object.keys(after.storedFiles).filter(name=>!Object.hasOwn(before.storedFiles,name));
  assert.equal(added.length,1,'ONE_NEW_STORED_IMAGE_FILE_REQUIRED');
  const image=after.imageDetails[0], path=added[0];
  assert.ok(path.includes('/grn-images/'+image.path+'/') && !path.includes('..'), 'STORED_IMAGE_PATH_MISMATCH');
  assert.match(path.split('/').at(-1), uuid);
  assert.equal(after.storedFiles[path].size,image.fileSize); assert.match(after.storedFiles[path].sha256,/^[a-f0-9]{64}$/);
  return {path, ...after.storedFiles[path]};
}
