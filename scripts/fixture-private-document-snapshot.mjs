import assert from 'node:assert/strict';import{readFileSync,lstatSync,readdirSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
export function privateDocumentSQL(c){assert.equal(c.phone,'919888888873');assert.equal(c.profileId,'34d9d337-ec2e-4bed-b555-0e8b63dd3aef');return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
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
COMMIT;`;}
export function privateDocumentSnapshot(c,env){
 const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:privateDocumentSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});assert.equal(q.status,0,'Private read-only document snapshot refused');const s=JSON.parse(q.stdout);
 const root=resolve(c.backendState,'data/storage'),files={};const rootStat=lstatSync(root);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink());let total=0;function walk(dir){for(const name of readdirSync(dir)){const path=resolve(dir,name),st=lstatSync(path);assert.ok(!st.isSymbolicLink());if(st.isDirectory())walk(path);else{assert.ok(st.isFile()&&st.size<=10485760&&Object.keys(files).length<1000&&(total+=st.size)<=268435456);files[path.slice(root.length+1)]={size:st.size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};}}}walk(root);
 const proof=JSON.parse(readFileSync(c.documentProof));assert.equal(proof.status,'PASS');assert.equal(proof.artifactSHA256,c.artifactSHA256);const g=proof.generated;assert.equal(g.name,c.documentPath);assert.deepEqual(files[g.storedFile],{size:g.size,sha256:g.sha256});assert.equal(readFileSync(resolve(root,g.storedFile)).subarray(0,5).toString(),'%PDF-');
 const {name,...profile}=s.profile;assert.equal(name,'Customer B');return {profile,sessions:s.sessions,verifiedOTPs:s.otpVerified,quota:{hourly:s.quota.hourly,daily:s.quota.daily},businessHash:s.businessHash,storageHash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),otherAuthHash:s.otherAuthHash,profileHash:s.profileStaticHash,assignmentsHash:createHash('sha256').update(JSON.stringify(s.targetAssignments)).digest('hex'),enrollmentHash:s.enrollmentHash};
}
