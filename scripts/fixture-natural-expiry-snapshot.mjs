import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function naturalExpirySnapshotSQL(c) {
 assert.equal(c.scope,'isolated-fictional-dedicated-natural-expiry');assert.match(c.sessionId,uuid);
 assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.phone,'919888888874');
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','grn_images','dispatch_images','idempotency_keys'];
 const business=tables.map(t=>`'${t}',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.${t} x)`).join(',');
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
'serverNowUTC',now(),
'profile',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='${c.phone}'),
'session',(SELECT jsonb_build_object('id',s.id,'issuedAtUTC',s.created_at,'expiresAtUTC',s.expires_at,'expired',s.expires_at<=now()) FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE s.id='${c.sessionId}' AND p.id='${c.profileId}'),
'otherSessionsHash',encode(extensions.digest((SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM warehouse_security.refresh_sessions s WHERE id<>'${c.sessionId}')::text,'sha256'),'hex'),
'authenticationHash',encode(extensions.digest(jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_profiles p),
 'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.users_customers_new a),
 'otps',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.otp_verifications o),
 'quotas',(SELECT jsonb_agg(to_jsonb(q) ORDER BY phone_number) FROM public.otp_rate_limits q),
 'enrollments',(SELECT jsonb_agg(to_jsonb(e) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens e))::text,'sha256'),'hex'),
'businessHash',encode(extensions.digest(jsonb_build_object(${business},'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))::text,'sha256'),'hex'));
COMMIT;`;
}
export function naturalExpirySnapshot(c,env,execute=spawnSync) {
 const q=execute('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:naturalExpirySnapshotSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(q.status,0,'Owned readonly natural-expiry snapshot failed');return JSON.parse(q.stdout);
}
