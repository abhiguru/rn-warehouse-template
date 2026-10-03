import {currentAImageDenialMode} from './fixture-private-image-run.mjs';
import assert from 'node:assert/strict';import{readFileSync,lstatSync,readdirSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
export function privateDocumentSQL(c){const current=currentAImageDenialMode(c);assert.equal(c.phone,'919888888872');assert.equal(c.profileId,'79764e1a-3aed-4cac-9a25-42ccdafb79ac');assert.match(c.nativeSessionId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(c.documentPath,/^grn\/a24c256a-bdf3-11f1-97aa-57de57b8fb69\/[a-f0-9-]{36}\.pdf$/);return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
'profileStaticHash',(SELECT encode(extensions.digest((to_jsonb(p)-'mobile_verified'-'mobile_verified_at'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles p WHERE mobile='${c.phone}'),
'enrollmentHash',encode(extensions.digest(coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens t),'[]')::text,'sha256'),'hex'),
'targetAssignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('userProfileId',a.user_profile_id,'customerId',a.customer_id,'active',a.active) ORDER BY a.id),'[]') FROM public.users_customers_new a WHERE a.user_profile_id=(SELECT id FROM public.user_profiles WHERE mobile='${c.phone}')),
'otherAuthHash',encode(extensions.digest(jsonb_build_object(
'profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x WHERE mobile<>'${c.phone}'),
'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x WHERE user_id NOT IN (SELECT auth_user_id FROM public.user_profiles WHERE mobile='${c.phone}')),
'otps',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x WHERE phone_number<>'${c.phone}'),
'quotas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x WHERE phone_number<>'${c.phone}'),
'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x))::text,'sha256'),'hex'),
'enrollmentTokenCount',(SELECT count(*) FROM warehouse_security.enrollment_tokens t JOIN public.user_profiles p ON t.user_id=p.auth_user_id WHERE p.mobile='${c.phone}'),
'primaryAdministratorPresent',EXISTS(SELECT 1 FROM public.user_profiles WHERE mobile='919888888871'),
'profile',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE mobile='${c.phone}'),
'sessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created',s.created_at,'expires',s.expires_at,'rowSHA256',encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.mobile='${c.phone}'),
'otpVerified',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='${c.phone}' AND verified_at IS NOT NULL),
'quota',(SELECT jsonb_build_object('hourly',CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END,'daily',CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END,'hourResetsAt',last_reset_hour+interval '1 hour') FROM public.otp_rate_limits WHERE phone_number='${c.phone}'),
'businessHash',encode(extensions.digest(jsonb_build_object(
'grn',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g),
'lines',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived_trl g),
'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
'images',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.grn_images i),
'dispatchImages',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.dispatch_images i),
'idempotency',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.idempotency_keys i),
'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))::text,'sha256'),'hex'));
SELECT jsonb_build_object('${current?'nativeASessionPresent':'nativeBSessionPresent'}',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON s.user_id=p.auth_user_id WHERE p.mobile='${current?'919888888872':'919888888873'}' AND s.id='${c.nativeSessionId}' AND s.expires_at>now()),'documentCount',(SELECT count(*) FROM storage.objects WHERE bucket_id='documents' AND name='${c.documentPath}'),'customerId',(SELECT customer_id FROM public.goodsreceived WHERE id='a24c256a-bdf3-11f1-97aa-57de57b8fb69'),'AHasAssignment',EXISTS(SELECT 1 FROM public.users_customers_new WHERE user_profile_id='${c.profileId}' AND customer_id='a8246002-bdb6-11f1-b1bf-07b1deb5bca2' AND active));
COMMIT;`;}
export function privateDocumentSnapshot(c,env){
 const current=currentAImageDenialMode(c),nativeKey=current?'nativeASessionPresent':'nativeBSessionPresent';
 const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:privateDocumentSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'Private read-only document snapshot refused');const rows=q.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(rows.length,2);const [s,document]=rows;assert.deepEqual(document,{[nativeKey]:true,documentCount:1,customerId:'a8246002-bdb6-11f1-b1bf-07b1deb5bca2',AHasAssignment:false});
 const root=resolve(c.backendState,'data/storage'),files={};const rootStat=lstatSync(root);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink());let total=0;function walk(dir){for(const name of readdirSync(dir)){const path=resolve(dir,name),st=lstatSync(path);assert.ok(!st.isSymbolicLink());if(st.isDirectory())walk(path);else{assert.ok(st.isFile()&&st.size<=10485760&&Object.keys(files).length<1000&&(total+=st.size)<=268435456);files[path.slice(root.length+1)]={size:st.size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};}}}walk(root);
 const proof=JSON.parse(readFileSync(c.documentProof));assert.equal(proof.status,'PASS');assert.equal(proof.artifactSHA256,current?'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7':c.artifactSHA256);const g=proof.generated;assert.equal(g.name,c.documentPath);assert.deepEqual(files[g.storedFile],{size:g.size,sha256:g.sha256});assert.equal(readFileSync(resolve(root,g.storedFile)).subarray(0,5).toString(),'%PDF-');
 const {name,...profile}=s.profile;assert.equal(name,'Customer A');return {[nativeKey]:document[nativeKey],profile,sessions:s.sessions,verifiedOTPs:s.otpVerified,quota:{hourly:s.quota.hourly,daily:s.quota.daily},businessHash:s.businessHash,storageHash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),otherAuthHash:s.otherAuthHash,profileHash:s.profileStaticHash,assignmentsHash:createHash('sha256').update(JSON.stringify(s.targetAssignments)).digest('hex'),enrollmentHash:s.enrollmentHash};
}
