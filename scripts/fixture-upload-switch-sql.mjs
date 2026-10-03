import {uploadSwitchConfig} from './fixture-upload-switch-guards.mjs';
// Fixed relation names; only validated UUIDs are interpolated. Sensitive rows
// stay inside PostgreSQL and only their aggregate hashes leave the database.
export function uploadSwitchSnapshotSQL(c){
 uploadSwitchConfig(c);
 const relations=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','dispatch_images','idempotency_keys','user_profiles','users_customers_new','otp_verifications','otp_rate_limits'];
 const entries=relations.flatMap(name=>[`'${name}'`,`(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM public.${name} t)`]);
 entries.push("'otherImages'",`(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.grn_images t WHERE grn_id<>'${c.targetReceiptId}')`);
 entries.push("'otherStorage'",`(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM storage.objects t WHERE NOT (bucket_id='grn-images' AND name LIKE 'headers/${c.targetReceiptId}/%'))`);
 entries.push("'otherSessions'",`(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM warehouse_security.refresh_sessions t WHERE id<>'${c.sessionId}')`);
 entries.push("'enrollment'","(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY token_hash),'[]') FROM warehouse_security.enrollment_tokens t)");
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'protected',jsonb_build_object(
  'stateHash',encode(extensions.digest(jsonb_build_object(${entries.join(',')})::text,'sha256'),'hex'),
  'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE s.id='${c.sessionId}' AND p.id='${c.profileId}' AND p.active AND p.role='admin' AND p.enrollment_status='approved' AND s.expires_at>now())
 ),
 'targetStorage',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name) ORDER BY o.id),'[]') FROM storage.objects o WHERE o.bucket_id='grn-images' AND o.name LIKE 'headers/${c.targetReceiptId}/%'),
 'target',(SELECT jsonb_build_object('receiptId',g.id,'record',g.gr_no,'customerId',g.customer_id,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'received',t.qty,'available',t.stock) ORDER BY t.id),'[]') FROM public.goodsreceived_trl t WHERE t.gr_id=g.id),
  'images',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'grnId',i.grn_id,'itemId',i.grn_item_id,'imageType',i.image_type,'path',i.storage_path,'status',i.status,'tokenPresent',i.upload_token IS NOT NULL,'fileSize',i.file_size,'mimeType',i.mime_type) ORDER BY i.id),'[]') FROM public.grn_images i WHERE i.grn_id=g.id)
 ) FROM public.goodsreceived g WHERE g.id='${c.targetReceiptId}')
);
COMMIT;`;
}
