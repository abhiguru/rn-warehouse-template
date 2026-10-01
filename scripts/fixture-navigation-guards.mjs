import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
export function navigationConfig(c) {
  assert.equal(c.scope, 'isolated-fictional-navigation-case');
  assert.ok(['offline-orders', 'same-server', 'cancel-switch', 'confirm-switch', 'switch-back', 'malformed-server', 'cold-lifecycle'].includes(c.case));
  for (const name of ['backendCheckout', 'backendState', 'soakConfig', 'artifactAudit', 'caseDirectory'])
    assert.ok(isAbsolute(c[name]), 'ABSOLUTE_CASE_PATH_REQUIRED');
  for (const name of ['instanceId', 'profileId', 'sessionId']) assert.match(c[name], uuid);
  for (const name of ['artifactSHA256', 'fixtureGuardSHA256']) assert.match(c[name], hash);
  assert.equal(c.profileName, c.case === 'switch-back' ? 'Switch Demo Administrator' : 'Core Demo Administrator');
  return c;
}

export function navigationSnapshotSQL(c) {
  navigationConfig(c);
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
 'profile',(SELECT jsonb_build_object('id',id,'active',active,'role',role,'name',name)
   FROM public.user_profiles WHERE id='${c.profileId}' AND mobile='${c.case === 'switch-back' ? '919888888881' : '919888888871'}'),
 'nativeSessionPresent',EXISTS(SELECT 1 FROM warehouse_security.refresh_sessions s
   JOIN public.user_profiles p ON p.auth_user_id=s.user_id
   WHERE p.id='${c.profileId}' AND s.id='${c.sessionId}' AND s.expires_at>now()),
 'otpCount',(SELECT count(*) FROM public.otp_verifications),
 'otherAuthHash',encode(extensions.digest(jsonb_build_object(
   'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_profiles p),
   'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM warehouse_security.refresh_sessions s WHERE id<>'${c.sessionId}'),
   'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.users_customers_new a)
 )::text,'sha256'),'hex'),
 'businessHash',encode(extensions.digest(jsonb_build_object(
   'receipts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g),
   'receiptLines',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived_trl g),
   'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
   'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
   'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
   'invoiceLines',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice_trl i),
   'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
   'orderItems',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.order_items o),
   'images',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.grn_images g),
   'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)
 )::text,'sha256'),'hex'));
COMMIT;`;
}

export function navigationBefore(c, s) {
  navigationConfig(c);
  assert.equal(s.profile?.id, c.profileId);
  assert.equal(s.profile?.name, c.profileName);
  assert.equal(s.profile?.role, 'admin');
  assert.equal(s.profile?.active, true);
  assert.equal(s.nativeSessionPresent, true, 'MATCHED_NATIVE_SESSION_REQUIRED');
  for (const name of ['businessHash', 'otherAuthHash']) assert.match(s[name], hash);
  assert.ok(Number.isSafeInteger(s.otpCount) && s.otpCount >= 0);
}

export function navigationAfter(c, before, after) {
  navigationBefore(c, before);
  for (const key of ['profile', 'businessHash', 'otherAuthHash', 'otpCount'])
    assert.deepEqual(after[key], before[key], 'UNEXPECTED_NAVIGATION_STATE_CHANGE');
  assert.equal(after.nativeSessionPresent, !['confirm-switch','switch-back'].includes(c.case),
    ['confirm-switch','switch-back'].includes(c.case) ? 'OLD_SESSION_NOT_REVOKED' : 'NATIVE_SESSION_LOST');
}
