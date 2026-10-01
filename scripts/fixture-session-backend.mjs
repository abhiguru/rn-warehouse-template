// Deliberately never part of ordinary installation. No session/token issuance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { request } from 'node:https';
import { readFaultState } from './fixture-soak-preflight.mjs';
import { validateCertificateHorizon } from './prepare-emulator-fixture.mjs';
import { assertReleased, caseConfig, privateJSON, sessionPrecondition, sessionPostcondition } from './fixture-session-guards.mjs';
process.umask(0o077);

try {
  const [configPath, mode] = process.argv.slice(2);
  assert.ok(['guard', 'inspect', 'revoke', 'verify'].includes(mode), 'CASE_MODE_REQUIRED');
  const c = caseConfig(configPath);
  // Check before importing a backend guard, making any HTTP call or touching ADB.
  assertReleased(c);
  if (mode === 'guard') {
    console.log(JSON.stringify({ status: 'PASS', phase: mode }));
  } else {
    const directory = c.caseDirectory;
    const st = lstatSync(directory);
    assert.ok(st.isDirectory() && realpathSync(directory) === resolve(directory) && st.uid === process.getuid()
      && (st.mode & 0o777) === 0o700, 'PRIVATE_CASE_DIRECTORY_REQUIRED');
    const guard = resolve(c.backendCheckout, 'tests/operator-fixture.mjs');
    assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256, 'FIXTURE_GUARD_CHANGED');
    process.env.WAREHOUSE_STATE_DIR = c.backendState;
    const { operatorFixture } = await import(pathToFileURL(guard).href);
    const { env, base, anon } = operatorFixture();
    const ui = privateJSON(c.soakConfig);
    assert.equal(ui.backendCheckout, c.backendCheckout, 'UI_BACKEND_MISMATCH');
    assert.equal(ui.backendState, c.backendState, 'UI_STATE_MISMATCH');
    const ca = readFileSync(ui.primaryCA);
    validateCertificateHorizon(ca, 1);
    assert.equal((await readFaultState(ui.faultSocket)).state, 'DISARMED', 'FAULT_RELAY_ARMED');
    const discovery = await new Promise((done, reject) => {
      const q = request({ hostname: '127.0.0.1', port: 18443, servername: 'backend-core.example.test',
        path: '/functions/v1/get-public-config', ca, timeout: 10000, headers: { Host: 'backend-core.example.test' } }, response => {
        let body = '';
        response.on('data', part => { body += part; if (body.length > 65536) q.destroy(new Error('DISCOVERY_TOO_LARGE')); });
        response.on('error', reject);
        response.on('end', () => {
          try { assert.equal(response.statusCode, 200); done(JSON.parse(body)); } catch { reject(new Error('DISCOVERY_FAILED')); }
        });
      });
      q.on('error', reject); q.on('timeout', () => q.destroy(new Error('DISCOVERY_TIMEOUT'))); q.end();
    });
    const manifest = JSON.parse(readFileSync(resolve(c.backendState, 'public/instance.json'), 'utf8'));
    assert.equal(discovery.data?.instanceId, manifest.instanceId, 'TRANSPORT_INSTANCE_MISMATCH');
    assert.equal(discovery.data?.canonicalOrigin, 'https://backend-core.example.test', 'TRANSPORT_ORIGIN_MISMATCH');

    const sql = query => {
      const result = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', `${env.WAREHOUSE_PROJECT_NAME}-db-1`,
        'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { input: `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; ${query} COMMIT;`,
        encoding: 'utf8', timeout: 30000, env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } });
      assert.equal(result.status, 0, 'PRIVATE_READONLY_OBSERVATION_FAILED');
      return JSON.parse(result.stdout.trim());
    };
    const snapshot = () => sql(`SELECT jsonb_build_object(
      'profile',(SELECT jsonb_build_object('id',id,'role',role,'active',active,'enrollment_status',enrollment_status)
        FROM public.user_profiles WHERE id='${c.profileId}'::uuid AND mobile='919888888874' AND name='Session Rehearsal Customer'),
      'sessions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'expired',s.expires_at<=now()) ORDER BY s.id),'[]')
        FROM warehouse_security.refresh_sessions s JOIN public.user_profiles p ON p.auth_user_id=s.user_id WHERE p.id='${c.profileId}'::uuid),
      'otpCount',(SELECT count(*) FROM public.otp_verifications WHERE phone_number='919888888874'),
      'adminUser',(SELECT auth_user_id FROM public.user_profiles WHERE mobile='919888888871' AND role='admin' AND active),
      'otherAuthHash',encode(extensions.digest(jsonb_build_object(
        'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_profiles p WHERE id<>'${c.profileId}'::uuid),
        'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM warehouse_security.refresh_sessions s
          WHERE s.user_id<>(SELECT auth_user_id FROM public.user_profiles WHERE id='${c.profileId}'::uuid)),
        'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.users_customers_new a WHERE user_profile_id<>'${c.profileId}'::uuid)
        )::text,'sha256'),'hex'),
      'businessHash',encode(extensions.digest(jsonb_build_object(
        'receipts',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived g),
        'receiptLines',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.goodsreceived_trl g),
        'dispatch',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch d),
        'dispatchLines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dispatch_trl d),
        'invoice',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoice i),
        'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o),
        'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)
        )::text,'sha256'),'hex'));`);
    const baselinePath = resolve(directory, 'auth-before.json');
    if (mode === 'inspect') {
      const data = snapshot(); sessionPrecondition(data, c.case, c.sessionId);
      writeFileSync(baselinePath, JSON.stringify(data), { flag: 'wx', mode: 0o600 });
    } else {
      const before = privateJSON(baselinePath);
      sessionPrecondition(before, c.case, c.sessionId);
      if (mode === 'revoke') {
        assert.equal(c.case, 'revoked', 'EXPIRY_CASE_MUST_NOT_MUTATE');
        assert.deepEqual(snapshot(), before, 'PRECONDITION_CHANGED');
        const token = privateJSON(c.adminSessionFile).access_token;
        assert.ok(typeof token === 'string' && token.length < 16384, 'PRIVATE_ADMIN_TOKEN_REQUIRED');
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        assert.equal(claims.sub, before.adminUser, 'FIXTURE_ADMIN_REQUIRED');
        assert.equal(claims.role, 'authenticated', 'FIXTURE_ADMIN_REQUIRED');
        assert.ok(claims.exp > Date.now() / 1000 + 120, 'ADMIN_LOGIN_EXPIRED');
        const rpc = async (name, body) => {
          const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error',
            headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
          assert.ok(response.status === 200 || (name === 'check_session' && response.status === 204), 'AUTHENTICATED_RPC_FAILED');
          const text = await response.text();
          assert.ok(text.length < 65536, 'RPC_RESPONSE_TOO_LARGE');
          return text ? JSON.parse(text) : null;
        };
        await rpc('check_session', {}); // Backend verifies the actual JWT/session.
        assertReleased(c); // Recheck immediately before the one mutation.
        writeFileSync(resolve(directory, 'disable-attempt.json'), JSON.stringify({ phase: 'ATTEMPTED', utc: new Date().toISOString() }),
          { flag: 'wx', mode: 0o600 }); // Never repeat an uncertain successful disable.
        const result = await rpc('operator_review_enrollment', { p_user_id: c.profileId, p_decision: 'disabled', p_customer_ids: [] });
        assert.ok(result.success === true && result.data?.status === 'disabled', 'DISABLE_NOT_CONFIRMED');
      }
      const after = snapshot(); sessionPostcondition(before, after, c.case, c.sessionId);
      if (mode === 'revoke') writeFileSync(resolve(directory, 'auth-after-disable.json'), JSON.stringify(after), { flag: 'wx', mode: 0o600 });
    }
    console.log(JSON.stringify({ status: 'PASS', phase: mode, case: c.case }));
  }
} catch (error) {
  const known = ['ACTIVE_FIXTURE_RUN', 'RUN_NOT_RELEASED', 'SOAK_NOT_PASS', 'COMPLETE_SOAK_REQUIRED', 'REFRESH_NOT_EXPIRED', 'ADMIN_LOGIN_EXPIRED'];
  const category = known.find(s => error.message?.includes(s)) || 'SESSION_GUARD_OR_CHECK_FAILED';
  const blocked = category !== 'SESSION_GUARD_OR_CHECK_FAILED';
  console.error(JSON.stringify({ status: blocked ? 'BLOCKED' : 'FAIL', category }));
  process.exitCode = blocked ? 2 : 1;
}
