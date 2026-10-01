// Optional fictional navigation observation. No authentication/business writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { navigationConfig, navigationSnapshotSQL, navigationBefore, navigationAfter } from './fixture-navigation-guards.mjs';
process.umask(0o077);
try {
  const [path, phase] = process.argv.slice(2);
  assert.ok(['guard', 'before', 'after'].includes(phase));
  const c = navigationConfig(privateJSON(path));
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
    { input: navigationSnapshotSQL(c), encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024,
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } });
    assert.equal(result.status, 0, 'PRIVATE_READONLY_OBSERVATION_FAILED');
    const snapshot = JSON.parse(result.stdout.trim());
    if (phase === 'before') navigationBefore(c, snapshot);
    else navigationAfter(c, privateJSON(resolve(c.caseDirectory, 'navigation-before.json')).snapshot, snapshot);
    writeFileSync(resolve(c.caseDirectory, `navigation-${phase}.json`),
      JSON.stringify({ phase, artifactSHA256: c.artifactSHA256, snapshot }), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: 'PASS', phase, scope: 'readonly-navigation-observation' }));
} catch (error) {
  const blocked = ['ACTIVE_FIXTURE_RUN', 'RUN_NOT_RELEASED', 'SOAK_NOT_PASS', 'COMPLETE_SOAK_REQUIRED'].find(s => error.message?.includes(s));
  console.error(JSON.stringify({ status: blocked ? 'BLOCKED' : 'FAIL', category: blocked || 'NAVIGATION_OBSERVATION_FAILED' }));
  process.exitCode = blocked ? 2 : 1;
}
