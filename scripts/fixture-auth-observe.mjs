// Ordinary native fixture authentication: read-only ownership/quota/session observations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
process.umask(0o077);
try {
  const [path, phase] = process.argv.slice(2);
  assert.ok(['guard', 'before', 'after'].includes(phase));
  const c = privateJSON(path);
  assert.equal(c.scope, 'isolated-fictional-native-authentication');
  assertReleased(c);
  const ui = privateJSON(c.soakConfig);
  const secondary = c.origin === 'https://backend-switch.example.test';
  assert.ok(secondary || c.origin === 'https://backend-core.example.test');
  assert.ok((secondary ? ['919888888881','919888888882','919888888883','919888888884'] :
    ['919888888871','919888888872','919888888873','919888888874']).includes(c.phone));
  const checkout = secondary ? ui.secondaryBackendCheckout : ui.backendCheckout;
  const guard = resolve(checkout, secondary ? 'scripts/switch-fixture-common.mjs' : 'tests/operator-fixture.mjs');
  assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256);
  process.env.WAREHOUSE_STATE_DIR = secondary ? ui.secondaryBackendState : ui.backendState;
  const owning = await import(pathToFileURL(guard).href);
  const { env } = secondary ? owning.switchingFixture() : owning.operatorFixture();
  if (phase !== 'guard') {
    const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
'profile',(SELECT jsonb_build_object('id',id,'name',name,'role',role,'active',active,'status',enrollment_status) FROM public.user_profiles WHERE mobile='${c.phone}'),
'sessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created',s.created_at,'expires',s.expires_at) ORDER BY s.id),'[]') FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.mobile='${c.phone}'),
'otpVerified',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='${c.phone}' AND verified_at IS NOT NULL),
'quota',(SELECT jsonb_build_object('hourly',CASE WHEN last_reset_hour+interval '1 hour'<=now() THEN 0 ELSE hourly_count END,'daily',CASE WHEN last_reset_day+interval '1 day'<=now() THEN 0 ELSE daily_count END,'hourResetsAt',last_reset_hour+interval '1 hour') FROM public.otp_rate_limits WHERE phone_number='${c.phone}'),
'businessHash',encode(extensions.digest(jsonb_build_object(
'grn',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g),
'lines',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived_trl g),
'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))::text,'sha256'),'hex'));
COMMIT;`;
    const q = spawnSync('docker', ['exec','-i','-e','PGPASSWORD',`${env.WAREHOUSE_PROJECT_NAME}-db-1`,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
      { input: sql, encoding: 'utf8', timeout: 15000, env: {...process.env, PGPASSWORD:env.POSTGRES_PASSWORD} });
    assert.equal(q.status,0,'PRIVATE_AUTH_OBSERVATION_FAILED');
    const snapshot = JSON.parse(q.stdout);
    if (phase === 'before') {
      assert.ok((snapshot.quota?.hourly ?? 0)<5 && (snapshot.quota?.daily ?? 0)<20,'ORDINARY_AUTH_QUOTA_EXHAUSTED');
    } else {
      const before = privateJSON(resolve(c.caseDirectory,'auth-before.json')).snapshot;
      assert.equal(snapshot.businessHash,before.businessHash,'AUTH_CHANGED_BUSINESS_DATA');
      assert.equal(snapshot.otpVerified,before.otpVerified+1,'ONE_ORDINARY_VERIFICATION_REQUIRED');
      assert.equal(snapshot.profile?.name,c.profileName,'PROFILE_NAME_MISMATCH');
      if (c.expected === 'authenticated') {
        assert.equal(snapshot.profile?.role,c.role); assert.equal(snapshot.profile?.active,true);
        const added = snapshot.sessions.filter(s=>!before.sessions.some(p=>p.id===s.id));
        assert.equal(added.length,1,'ONE_NEW_NATIVE_SESSION_REQUIRED');
        snapshot.nativeSession = added[0];
      } else assert.equal(snapshot.profile?.status,'pending');
    }
    writeFileSync(resolve(c.caseDirectory,`auth-${phase}.json`),JSON.stringify({snapshot},null,2)+'\n',{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({status:'PASS',phase,scope:'ordinary-native-auth-observation'}));
} catch (error) {
  console.error(JSON.stringify({status:'FAIL',category:'AUTH_OBSERVATION_REFUSED'}));
  process.exitCode=1;
}
