import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {confirmedDraftConfig} from './fixture-confirmed-draft-controls.mjs';
import {queueStorageHash} from './fixture-queue-processing-snapshot.mjs';
export function confirmedDraftSQL(c,side){
 confirmedDraftConfig(c);assert.ok(['source','destination'].includes(side));
 const source=side==='source';
 const tables=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','orders','order_items','stock_movements','grn_images','dispatch_images','idempotency_keys','auto_invoice_errors','customers','items','storage.objects','storage.buckets'];
 const business=tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM ${t.includes('.')?t:'public.'+t} x)`).join(',');
 // This candidate uses custom OTP auth; it has auth.users, not GoTrue identities.
 const auth=[['profiles','public.user_profiles','id'],['users','auth.users','id'],['assignments','public.users_customers_new','id'],['otps','public.otp_verifications','id'],['quotas','public.otp_rate_limits','phone_number'],['enrollments','warehouse_security.enrollment_tokens','token_hash'],['sessions','warehouse_security.refresh_sessions','id'],['consumed','warehouse_security.consumed_refresh_tokens','token_hash']].map(([key,t,order])=>`'${key}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.${order}),'[]') FROM ${t} x${source&&key==='sessions'?` WHERE x.id<>'${c.sessionId}'`:source&&key==='consumed'?` WHERE x.session_id<>'${c.sessionId}'`:''})`).join(',');
 const native=source?`,
 'profile',(SELECT jsonb_build_object('id',id,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='919888888874'),
 'nativeSessionId',(SELECT s.id FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE s.id='${c.sessionId}' AND p.id='${c.profileId}'),
 'nativeSessionUnexpired',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE s.id='${c.sessionId}' AND p.id='${c.profileId}' AND s.expires_at>now()),
 'nativeSessionIssuedUTC',(SELECT created_at FROM warehouse_security.refresh_sessions WHERE id='${c.sessionId}'),
 'nativeSessionExpiryUTC',(SELECT expires_at FROM warehouse_security.refresh_sessions WHERE id='${c.sessionId}'),
 'nativeSessionHash',(SELECT encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex') FROM warehouse_security.refresh_sessions s WHERE id='${c.sessionId}'),
 'nativeHistoryCount',(SELECT count(*) FROM warehouse_security.consumed_refresh_tokens WHERE session_id='${c.sessionId}')`:'';
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SELECT jsonb_build_object('businessHash',encode(extensions.digest(jsonb_build_object(${business})::text,'sha256'),'hex'),'authExceptNativeHash',encode(extensions.digest(jsonb_build_object(${auth})::text,'sha256'),'hex')${native});COMMIT;`;
}
export function confirmedDraftSnapshot(c,side,env){
 const sql=confirmedDraftSQL(c,side);
 const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
 assert.equal(q.status,0,'OWNED_READONLY_SWITCH_SNAPSHOT_REFUSED');
 const s=JSON.parse(q.stdout);s.storageHash=queueStorageHash(c[side==='source'?'backendState':'targetBackendState']);s.instanceId=c[side==='source'?'instanceId':'targetInstanceId'];return s;
}
