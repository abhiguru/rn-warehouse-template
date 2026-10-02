import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {concurrencyConfig} from './fixture-dispatch-concurrency-controls.mjs';
import {queueStorageHash} from './fixture-queue-processing-snapshot.mjs';
export function concurrencySQL(c){
 concurrencyConfig(c);
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items'];
 const exclude={goodsreceived_trl:`id<>'${c.lotId}'`,dispatch:`disp_no NOT IN('${c.record}','${c.competitorRecord}')`,dispatch_trl:`disp_id NOT IN(SELECT id FROM public.dispatch WHERE disp_no IN('${c.record}','${c.competitorRecord}'))`,stock_movements:`reference_id NOT IN(SELECT id FROM public.dispatch WHERE disp_no IN('${c.record}','${c.competitorRecord}'))`,idempotency_keys:`coalesce(response->>'dispatch_id','') NOT IN(SELECT id::text FROM public.dispatch WHERE disp_no IN('${c.record}','${c.competitorRecord}'))`};
 const pairs=tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.${t} x${exclude[t]?' WHERE '+exclude[t]:''})`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object(
 'stock',(SELECT stock FROM public.goodsreceived_trl WHERE id='${c.lotId}'),
 'lotBound',EXISTS(SELECT 1 FROM public.goodsreceived_trl t JOIN public.goodsreceived g ON g.id=t.gr_id WHERE t.id='${c.lotId}' AND t.gr_id='${c.sourceGRNId}' AND t.qty=3 AND g.gr_no='${c.sourceReceipt}' AND g.customer_id='${c.customerId}' AND g.deleted_at IS NULL),
 'lotMetadataHash',(SELECT encode(extensions.digest((to_jsonb(t)-'stock'-'updated_at'-'updated_by')::text,'sha256'),'hex') FROM public.goodsreceived_trl t WHERE id='${c.lotId}'),
 'nativeRecordCount',(SELECT count(*) FROM public.dispatch WHERE disp_no='${c.record}'),
 'competitorRecordCount',(SELECT count(*) FROM public.dispatch WHERE disp_no='${c.competitorRecord}'),
 'dispatches',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM public.dispatch d WHERE disp_no IN('${c.record}','${c.competitorRecord}')),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.dispatch_trl t JOIN public.dispatch d ON d.id=t.disp_id WHERE d.disp_no IN('${c.record}','${c.competitorRecord}')),
 'dispatchQuantity',(SELECT sum(t.disp_qty) FROM public.dispatch_trl t JOIN public.dispatch d ON d.id=t.disp_id WHERE d.disp_no IN('${c.record}','${c.competitorRecord}')),
 'movementCount',(SELECT count(*) FROM public.stock_movements m JOIN public.dispatch d ON d.id=m.reference_id WHERE d.disp_no IN('${c.record}','${c.competitorRecord}')),
 'movementBefore',(SELECT min(m.balance_before) FROM public.stock_movements m JOIN public.dispatch d ON d.id=m.reference_id WHERE d.disp_no IN('${c.record}','${c.competitorRecord}')),
 'movementAfter',(SELECT min(m.balance_after) FROM public.stock_movements m JOIN public.dispatch d ON d.id=m.reference_id WHERE d.disp_no IN('${c.record}','${c.competitorRecord}')),
 'successfulCacheCount',(SELECT count(*) FROM public.idempotency_keys k WHERE k.response->>'dispatch_id' IN(SELECT id::text FROM public.dispatch WHERE disp_no IN('${c.record}','${c.competitorRecord}')) AND k.response->>'success'='true'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.id='${c.profileId}' AND p.active AND p.role='supervisor' AND s.id='${c.sessionId}' AND s.expires_at>now()),
 'unrelatedRowsHash',encode(extensions.digest(jsonb_build_object(${pairs},'storage',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM storage.objects x))::text,'sha256'),'hex'),
 'authHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x),'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x),'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x),'enrollments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x))::text,'sha256'),'hex'));COMMIT;`;
}
export function concurrencySnapshot(c,env){
 const r=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:concurrencySQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(r.status,0,'Owned read-only concurrency snapshot refused');const s=JSON.parse(r.stdout);s.storageHash=queueStorageHash(c.backendState);return s;
}
