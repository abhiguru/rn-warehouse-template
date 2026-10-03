import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {bInvoicePDFConfig} from './fixture-b-invoice-pdf-run.mjs';
export function bInvoicePDFSQL(c) {
 bInvoicePDFConfig(c);
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items','item_storage_prices'];
 const pairs=tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.${t} x)`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object(
 'profile',(SELECT jsonb_build_object('id',id,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE mobile='${c.phone}'),
 'profileStaticHash',(SELECT encode(extensions.digest((to_jsonb(x)-'mobile_verified'-'mobile_verified_at'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles x WHERE mobile='${c.phone}'),
 'sessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'rowSHA256',encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.mobile='${c.phone}'),
 'verifiedOTPs',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='${c.phone}' AND verified_at IS NOT NULL),
 'quota',(SELECT jsonb_build_object('hourly',CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END,'daily',CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END) FROM public.otp_rate_limits WHERE phone_number='${c.phone}'),
 'businessHash',encode(extensions.digest(jsonb_build_object(${pairs})::text,'sha256'),'hex'),
 'enrollmentHash',encode(extensions.digest(coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x),'[]')::text,'sha256'),'hex'),
 'otherAuthHash',encode(extensions.digest(jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x WHERE mobile<>'${c.phone}'),'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x WHERE user_id NOT IN(SELECT auth_user_id FROM public.user_profiles WHERE mobile='${c.phone}')),'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x WHERE phone_number<>'${c.phone}'),'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x WHERE phone_number<>'${c.phone}'),'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x))::text,'sha256'),'hex'),
 'objects',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'name',name,'rowSHA256',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')) ORDER BY id),'[]') FROM storage.objects x),
 'invoice',(SELECT jsonb_build_object('id',id,'number',inv_no,'year',inv_fin_year,'customerId',customer_id,'total',total,'tax',tax_amount) FROM public.invoice WHERE id='${c.invoiceId}' AND inv_no=20261031));COMMIT;`;
}
export function bInvoicePDFSnapshot(c,env) {
 const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:bInvoicePDFSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'Owned PDF read-only SQL refused');const s=JSON.parse(q.stdout);
 const root=resolve(c.backendState,'data/storage'),files={};assert.ok(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink());let total=0;
 const walk=dir=>{for(const name of readdirSync(dir).sort()){const path=resolve(dir,name),st=lstatSync(path);assert.ok(!st.isSymbolicLink());if(st.isDirectory())walk(path);else{assert.ok(st.isFile()&&st.size<=10485760&&Object.keys(files).length<1000&&(total+=st.size)<=268435456);files[path.slice(root.length+1)]={size:st.size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};}}};walk(root);s.files=files;return s;
}
