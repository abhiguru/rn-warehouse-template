import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {bApprovalConfig} from './fixture-b-approval-controls.mjs';
export function bApprovalSnapshotSQL(c){
 bApprovalConfig(c);
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','grn_images','dispatch_images','idempotency_keys'];
 const business=tables.map(t=>`'${t}',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.${t} x)`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'target',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='${c.phone}'),
 'targetStaticHash',(SELECT encode(extensions.digest((to_jsonb(p)-'active'-'enrollment_status'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles p WHERE id='${c.profileId}'),
 'targetSessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON s.user_id=p.auth_user_id WHERE p.id='${c.profileId}'),
 'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.users_customers_new a WHERE user_profile_id='${c.profileId}'),
 'admin',(SELECT jsonb_build_object('id',id,'role',role,'active',active) FROM public.user_profiles WHERE id='${c.adminProfileId}' AND mobile='${c.adminPhone}'),
 'adminStaticHash',(SELECT encode(extensions.digest((to_jsonb(p)-'mobile_verified_at'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles p WHERE id='${c.adminProfileId}'),
 'adminSessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'issuedAt',s.created_at,'expiresAt',s.expires_at,'rowSHA256',encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON s.user_id=p.auth_user_id WHERE p.id='${c.adminProfileId}'),
 'targetOTPCount',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='${c.phone}'),
 'adminOTPCount',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='${c.adminPhone}' AND verified_at IS NOT NULL),
 'adminHourly',coalesce((SELECT CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END FROM public.otp_rate_limits WHERE phone_number='${c.adminPhone}'),0),
 'adminDaily',coalesce((SELECT CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END FROM public.otp_rate_limits WHERE phone_number='${c.adminPhone}'),0),
 'otherAuthHash',encode(extensions.digest(jsonb_build_object(
  'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_profiles p WHERE id NOT IN('${c.profileId}','${c.adminProfileId}')),
  'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM warehouse_security.refresh_sessions s WHERE user_id NOT IN(SELECT auth_user_id FROM public.user_profiles WHERE id IN('${c.profileId}','${c.adminProfileId}'))),
  'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.users_customers_new a WHERE user_profile_id<>'${c.profileId}'),
  'otps',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.otp_verifications o WHERE phone_number<>'${c.adminPhone}'),
  'quotas',(SELECT jsonb_agg(to_jsonb(q) ORDER BY phone_number) FROM public.otp_rate_limits q WHERE phone_number<>'${c.adminPhone}'),
  'enrollments',(SELECT jsonb_agg(to_jsonb(e) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens e))::text,'sha256'),'hex'),
 'businessHash',encode(extensions.digest(jsonb_build_object(${business},'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))::text,'sha256'),'hex'));
COMMIT;`;
}
export function bApprovalSnapshot(c,env,execute=spawnSync){
 const q=execute('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:bApprovalSnapshotSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(q.status,0,'Owned readonly B approval snapshot failed');return JSON.parse(q.stdout);
}
