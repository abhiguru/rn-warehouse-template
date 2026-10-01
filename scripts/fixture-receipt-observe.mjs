// Guarded observation only: no fault arming, UI, authentication or business writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { receiptConfig, receiptSnapshotSQL, receiptSnapshotShape } from './fixture-receipt-snapshot.mjs';
import { writeBaseline } from './fixture-write-reconciliation.mjs';
process.umask(0o077);
try {
  const [configPath, phase] = process.argv.slice(2);
  assert.ok(['guard', 'baseline', 'after-draft', 'after-image', 'pre-submit', 'after-loss', 'after-retry'].includes(phase));
  const c = receiptConfig(privateJSON(configPath));
  assertReleased(c); // Before backend import, socket/SQL access or evidence creation.
  if (phase !== 'guard') {
    for (const field of ['backendCheckout', 'backendState', 'caseDirectory', 'faultSocket']) assert.ok(isAbsolute(c[field]));
    const d = lstatSync(c.caseDirectory);
    assert.ok(d.isDirectory() && d.uid === process.getuid() && (d.mode & 0o777) === 0o700
      && realpathSync(c.caseDirectory) === resolve(c.caseDirectory));
    const guard = resolve(c.backendCheckout, 'tests/operator-fixture.mjs');
    assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256);
    process.env.WAREHOUSE_STATE_DIR = c.backendState;
    const { operatorFixture } = await import(pathToFileURL(guard).href);
    const { env } = operatorFixture();
    const manifest = JSON.parse(readFileSync(resolve(c.backendState, 'public/instance.json')));
    assert.equal(manifest.instanceId, c.instanceId, 'INSTANCE_MISMATCH');
    const parent = lstatSync(dirname(c.faultSocket));
    assert.ok(parent.isDirectory() && parent.uid === process.getuid() && (parent.mode & 0o777) === 0o700
      && realpathSync(c.faultSocket) === resolve(c.faultSocket));
    const st = lstatSync(c.faultSocket);
    assert.ok(st.isSocket() && st.uid === process.getuid() && (st.mode & 0o077) === 0);
    const control = action => new Promise((done, reject) => {
      const socket = createConnection(c.faultSocket); let buffer = '';
      socket.setTimeout(5000, () => socket.destroy(new Error('CONTROL_TIMEOUT')));
      socket.on('error', reject); socket.on('connect', () => socket.write(JSON.stringify({ action })+'\n'));
      socket.on('data', part => { buffer += part; if (Buffer.byteLength(buffer) > 8192) socket.destroy(new Error('CONTROL_TOO_LARGE')); });
      socket.on('end', () => { try { const r = JSON.parse(buffer); assert.ok(!r.error); done(r); } catch { reject(new Error('CONTROL_INVALID')); } });
    });
    const fault = await control('status'), observations = await control('observations');
    let key = null;
    if (['baseline', 'after-draft', 'after-image', 'pre-submit'].includes(phase)) {
      assert.equal(fault.state, 'DISARMED');
      assert.deepEqual(observations, { observations: [], overflow: false });
    } else {
      assert.equal(fault.record, c.record);
      assert.equal(fault.path, '/rest/v1/rpc/save_grn');
      assert.equal(fault.state, c.phase === 'before-upstream' ? 'DROPPED_BEFORE_UPSTREAM' : 'DROPPED_AFTER_UPSTREAM_SUCCESS');
      key = fault.key;
    }
    const query = receiptSnapshotSQL(c, key);
    const r = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', `${env.WAREHOUSE_PROJECT_NAME}-db-1`,
      'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: query, encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024,
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } });
    assert.equal(r.status, 0, 'PRIVATE_READONLY_OBSERVATION_FAILED');
    const snapshot = JSON.parse(r.stdout.trim()); receiptSnapshotShape(c, snapshot, phase);
    if (['baseline', 'after-draft', 'after-image', 'pre-submit'].includes(phase)) writeBaseline(c, snapshot);
    if (['after-draft', 'after-image', 'pre-submit'].includes(phase)) assert.deepEqual(snapshot, privateJSON(resolve(c.caseDirectory, 'baseline.json')).snapshot, 'DRAFT_CHANGED_BUSINESS_DATA');
    // Detect requests/control changes during the SQL observation window.
    assert.deepEqual(await control('status'), fault, 'CONTROL_CHANGED_DURING_SNAPSHOT');
    assert.deepEqual(await control('observations'), observations, 'REQUEST_DURING_SNAPSHOT');
    writeFileSync(resolve(c.caseDirectory, `${phase}.json`), JSON.stringify({ schema: 1, phase,
      artifactSHA256: c.artifactSHA256, utc: new Date().toISOString(), fault, requestObservations: observations, snapshot }),
    { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: 'PASS', phase, scope: 'readonly-observation-only' }));
} catch (error) {
  const blocked = ['ACTIVE_FIXTURE_RUN', 'RUN_NOT_RELEASED', 'SOAK_NOT_PASS', 'COMPLETE_SOAK_REQUIRED'].find(s => error.message?.includes(s));
  console.error(JSON.stringify({ status: blocked ? 'BLOCKED' : 'FAIL', category: blocked || 'RECEIPT_OBSERVATION_FAILED' }));
  process.exitCode = blocked ? 2 : 1;
}
