import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateJSON,assertReleased } from './fixture-session-guards.mjs';
import { realtimeConfig } from './fixture-realtime-controls.mjs';

export function realtimeSnapshotSQL(c) {
  realtimeConfig(c);
  const business=['goodsreceived','goodsreceived_trl','dispatch','dispatch_trl','invoice','invoice_trl','grn_images','dispatch_images','idempotency_keys'];
  const entries=business.map(t=>`'${t}',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.${t} x)`);
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'nativeProfile',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active) FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='919888888874' AND enrollment_status='approved'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.id='${c.profileId}' AND s.id='${c.sessionId}' AND s.expires_at>now()),
 'callerProfile',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active) FROM public.user_profiles WHERE id='${c.callerProfileId}' AND mobile='919888888872' AND enrollment_status='approved'),
 'callerSessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'rowHash',encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')) ORDER BY s.id),'[]'::jsonb) FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.id='${c.callerProfileId}'),
 'callerVerifiedOTPs',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='919888888872' AND verified_at IS NOT NULL),
 'callerStaticProfileHash',(SELECT encode(extensions.digest((to_jsonb(p)-'mobile_verified'-'mobile_verified_at'-'updated_at')::text,'sha256'),'hex') FROM public.user_profiles p WHERE id='${c.callerProfileId}'),
 'authExceptCallerHash',encode(extensions.digest(jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x WHERE id<>'${c.callerProfileId}'),
 'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x WHERE id<>'${c.sessionId}' AND user_id NOT IN(SELECT auth_user_id FROM public.user_profiles WHERE id='${c.callerProfileId}')),
 'otp',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x WHERE phone_number<>'919888888872'),
 'quota',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x WHERE phone_number<>'919888888872'),
 'enrollment',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x),
 'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x))::text,'sha256'),'hex'),
 'callerQuota',(SELECT jsonb_build_object('hourly',CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END,'daily',CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END) FROM public.otp_rate_limits WHERE phone_number='919888888872'),
 'stock',(SELECT jsonb_build_object('id',l.id,'customerId',g.customer_id,'record',g.gr_no,'stock',l.stock,'qty',l.qty) FROM public.goodsreceived_trl l JOIN public.goodsreceived g ON l.gr_id=g.id WHERE l.id='${c.stockLineId}'),
 'cart',(SELECT jsonb_build_object('id',id,'customerId',customer_id,'status',status,'revisions',revisions) FROM public.orders WHERE id='${c.orderId}' AND deleted_at IS NULL),
 'cartStaticHash',(SELECT encode(extensions.digest((to_jsonb(o)-'updated_at'-'updated_by'-'revisions')::text,'sha256'),'hex') FROM public.orders o WHERE id='${c.orderId}'),
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'stockLineId',grn_items_id,'quantity',requested_quantity,'fulfilled',fulfilled_quantity) ORDER BY id),'[]'::jsonb) FROM public.order_items WHERE order_id='${c.orderId}'),
 'businessHash',encode(extensions.digest(jsonb_build_object(${entries.join(',')},
 'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.orders x WHERE id<>'${c.orderId}'),
 'orderItems',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.order_items x WHERE order_id<>'${c.orderId}'),
 'storage',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM storage.objects x))::text,'sha256'),'hex'),
 'otherAuthHash',encode(extensions.digest(jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.user_profiles x),
 'sessions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM warehouse_security.refresh_sessions x WHERE id<>'${c.sessionId}' AND user_id NOT IN(SELECT auth_user_id FROM public.user_profiles WHERE id='${c.callerProfileId}')),
 'otp',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.otp_verifications x),
 'quota',(SELECT jsonb_agg(to_jsonb(x) ORDER BY phone_number) FROM public.otp_rate_limits x),
 'enrollment',(SELECT jsonb_agg(to_jsonb(x) ORDER BY token_hash) FROM warehouse_security.enrollment_tokens x),
 'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.users_customers_new x))::text,'sha256'),'hex'));
COMMIT;`;
}

export async function realtimeSnapshot(c) {
  realtimeConfig(c);assertReleased(c);
  const ui=privateJSON(c.soakConfig),proof=privateJSON(c.prerequisiteEvidence);
  assert.equal(proof.status,'PASS');assert.equal(proof.readOnly,true);
  assert.equal(proof.stock.length,1);assert.equal(proof.stock[0].lineId,c.stockLineId);
  assert.equal(proof.stock[0].customerId,c.customerId);
  assert.equal(proof.profiles.find(p=>p.mobile===c.callerPhone)?.id,c.callerProfileId);
  const guard=resolve(ui.backendCheckout,'tests/operator-fixture.mjs');
  assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'),c.fixtureGuardSHA256);
  assert.equal(privateJSON(resolve(ui.backendState,'public/instance.json')).instanceId,c.instanceId);
  assert.equal(ui.apkSHA256,c.artifactSHA256);
  process.env.WAREHOUSE_STATE_DIR=ui.backendState;
  const {operatorFixture}=await import(pathToFileURL(guard).href),{env}=operatorFixture();
  const q=spawnSync('docker',['exec','-i','-e','PGPASSWORD',env.WAREHOUSE_PROJECT_NAME+'-db-1','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:realtimeSnapshotSQL(c),encoding:'utf8',timeout:15000,maxBuffer:1048576,env:{...process.env,PGPASSWORD:env.POSTGRES_PASSWORD}});
  assert.equal(q.status,0,'PRIVATE_REALTIME_SNAPSHOT_FAILED');return JSON.parse(q.stdout);
}
