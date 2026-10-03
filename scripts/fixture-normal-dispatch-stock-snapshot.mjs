import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {normalStockReceiptPayload} from './fixture-normal-dispatch-stock-prepare.mjs';
import {queueStorageHash} from './fixture-queue-processing-snapshot.mjs';
export function preparationSQL(c){
 normalStockReceiptPayload(c);
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items'];
 const excludes={goodsreceived:"gr_no<>'FXF960'",goodsreceived_trl:"gr_id NOT IN(SELECT id FROM public.goodsreceived WHERE gr_no='FXF960')",stock_movements:"reference_id NOT IN(SELECT id FROM public.goodsreceived WHERE gr_no='FXF960')",idempotency_keys:`idempotency_key<>'${c.idempotencyKey}'`};
 const pairs=tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.${t} x${excludes[t]?' WHERE '+excludes[t]:''})`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object(
 'receiptAbsent',NOT EXISTS(SELECT 1 FROM public.goodsreceived WHERE gr_no='FXF960'),
 'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY id),'[]') FROM public.goodsreceived g WHERE gr_no='FXF960'),
 'lots',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.goodsreceived_trl t JOIN public.goodsreceived g ON g.id=t.gr_id WHERE g.gr_no='FXF960'),
 'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.stock_movements m JOIN public.goodsreceived g ON g.id=m.reference_id WHERE g.gr_no='FXF960'),
 'caches',(SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY id),'[]') FROM public.idempotency_keys k WHERE idempotency_key='${c.idempotencyKey}'),
 'adminActive',(SELECT active FROM public.user_profiles WHERE mobile='919888888871'),'adminRole',(SELECT role FROM public.user_profiles WHERE mobile='919888888871'),
 'adminStaticHash',(SELECT encode(extensions.digest((to_jsonb(p)-'mobile_verified'-'mobile_verified_at'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles p WHERE mobile='919888888871'),
 'adminSessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'hash',encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.mobile='919888888871'),
 'verifiedOTPs',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='919888888871' AND verified_at IS NOT NULL),
 'quota',(SELECT jsonb_build_object('hourly',CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END,'daily',CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END) FROM public.otp_rate_limits WHERE phone_number='919888888871'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.id='947136fa-997b-4a83-819d-1b8bd3ecba68' AND s.id='${c.nativeSessionId}' AND s.expires_at>now()),
 'unrelatedRowsHash',encode(extensions.digest(jsonb_build_object(${pairs},'storage',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM storage.objects x))::text,'sha256'),'hex'),
 'unrelatedAuthHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x WHERE mobile<>'919888888871'),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x WHERE user_id NOT IN(SELECT auth_user_id FROM public.user_profiles WHERE mobile='919888888871')),'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x WHERE phone_number<>'919888888871'),'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x WHERE phone_number<>'919888888871'),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x),'enrollments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x))::text,'sha256'),'hex'),
 'authHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x),'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x),'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x),'enrollments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x))::text,'sha256'),'hex'));COMMIT;`;
}
export function preparationSnapshot(c,env){
 const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:preparationSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(r.status,0,'Owned preparation read-only snapshot refused');const s=JSON.parse(r.stdout);s.storageHash=queueStorageHash(c.backendState);s.receiptId=s.receipts.length===1?s.receipts[0].id:null;s.lotId=s.lots.length===1?s.lots[0].id:null;return s;
}
