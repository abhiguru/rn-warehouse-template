// Optional fictional navigation observation. No authentication/business writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { navigationConfig, navigationSnapshotSQL, navigationBefore, navigationAfter } from './fixture-navigation-guards.mjs';
import {normalDispatch,snapshotCase,normalBefore,normalAfter} from './fixture-normal-dispatch-controls.mjs';
import {dispatchSnapshotSQL} from './fixture-dispatch-snapshot.mjs';
process.umask(0o077);
try {
  const [path, phase] = process.argv.slice(2);
  assert.ok(['guard', 'baseline', 'after-draft', 'after-submit'].includes(phase));
  const c = normalDispatch(privateJSON(path));
  assertReleased(c); // Before owning backend import, SQL, HTTP, files or ADB.
  if (phase !== 'guard') {
    const dir = lstatSync(c.caseDirectory);
    assert.ok(dir.isDirectory() && dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700
      && realpathSync(c.caseDirectory) === resolve(c.caseDirectory));
    const returning = c.case === 'switch-back';
    const guard = resolve(c.backendCheckout, returning ? 'scripts/switch-fixture-common.mjs' : 'tests/operator-fixture.mjs');
    assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256);
    process.env.WAREHOUSE_STATE_DIR = c.backendState;
    const owning = await import(pathToFileURL(guard).href);
    const { env } = returning ? owning.switchingFixture() : owning.operatorFixture();
    assert.equal(JSON.parse(readFileSync(resolve(c.backendState, 'public/instance.json'))).instanceId, c.instanceId);
    const result = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', `${env.WAREHOUSE_PROJECT_NAME}-db-1`,
      'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: dispatchSnapshotSQL(snapshotCase(c)).replace('COMMIT;',navigationSnapshotSQL({...c,scope:'isolated-fictional-navigation-case'}).replace('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;','').replace('COMMIT;',`SELECT encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(k) ORDER BY id),'[]'::jsonb)::text,'sha256'),'hex') FROM public.idempotency_keys k WHERE coalesce(k.response->>'dispatch_id','') NOT IN (SELECT id::text FROM public.dispatch WHERE disp_no='${c.record}');COMMIT;`)), encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024,
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } });
    assert.equal(result.status, 0, 'PRIVATE_READONLY_OBSERVATION_FAILED');
    const rows=result.stdout.trim().split('\n');assert.equal(rows.length,3);const snapshot={dispatch:JSON.parse(rows[0]),auth:JSON.parse(rows[1]),unrelatedCacheHash:rows[2]};
    if(phase==='baseline')normalBefore(c,snapshot);else normalAfter(c,privateJSON(resolve(c.caseDirectory,'normal-dispatch-baseline.json')).snapshot,snapshot,phase==='after-submit');
    writeFileSync(resolve(c.caseDirectory, `normal-dispatch-${phase}.json`),
      JSON.stringify({ phase, artifactSHA256: c.artifactSHA256, snapshot }), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: 'PASS', phase, scope: 'readonly-normal-dispatch-observation' }));
} catch (error) {
  const blocked = ['ACTIVE_FIXTURE_RUN', 'RUN_NOT_RELEASED', 'SOAK_NOT_PASS', 'COMPLETE_SOAK_REQUIRED'].find(s => error.message?.includes(s));
  console.error(JSON.stringify({ status: blocked ? 'BLOCKED' : 'FAIL', category: blocked || 'NORMAL_DISPATCH_OBSERVATION_FAILED' }));
  process.exitCode = blocked ? 2 : 1;
}
