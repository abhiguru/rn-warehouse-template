// Zero-write reconciliation after a native offline error; never submits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { assertReleased, privateJSON } from './fixture-session-guards.mjs';
import { dispatchConfig, dispatchSnapshotSQL, dispatchSnapshotShape } from './fixture-dispatch-snapshot.mjs';
import { writeBaseline, committed } from './fixture-write-reconciliation.mjs';
process.umask(0o077);
try {
  const [path, phase] = process.argv.slice(2);
  assert.ok(['guard', 'after-offline-error', 'after-reconnect', 'after-submit'].includes(phase));
  const c = dispatchConfig(privateJSON(path));
  assert.equal(c.offlineCase, true, 'DECLARED_OFFLINE_CASE_REQUIRED');
  assertReleased(c); // Before imports, socket/SQL, evidence or any native action.
  if (phase !== 'guard') {
    for (const field of ['backendCheckout', 'backendState', 'caseDirectory', 'faultSocket']) assert.ok(isAbsolute(c[field]));
    const dir = lstatSync(c.caseDirectory);
    assert.ok(dir.isDirectory() && dir.uid === process.getuid() && (dir.mode & 0o777) === 0o700
      && realpathSync(c.caseDirectory) === resolve(c.caseDirectory));
    const guard = resolve(c.backendCheckout, 'tests/operator-fixture.mjs');
    assert.equal(createHash('sha256').update(readFileSync(guard)).digest('hex'), c.fixtureGuardSHA256);
    process.env.WAREHOUSE_STATE_DIR = c.backendState;
    const { operatorFixture } = await import(pathToFileURL(guard).href);
    const { env } = operatorFixture();
    assert.equal(JSON.parse(readFileSync(resolve(c.backendState, 'public/instance.json'))).instanceId, c.instanceId);
    const st = lstatSync(c.faultSocket), parent = lstatSync(dirname(c.faultSocket));
    assert.ok(st.isSocket() && st.uid === process.getuid() && (st.mode & 0o077) === 0
      && realpathSync(c.faultSocket) === resolve(c.faultSocket));
    assert.ok(parent.isDirectory() && parent.uid === process.getuid() && (parent.mode & 0o777) === 0o700);
    const control = action => new Promise((done, reject) => {
      const socket = createConnection(c.faultSocket); let buffer = '';
      socket.setTimeout(5000, () => socket.destroy(new Error('CONTROL_TIMEOUT')));
      socket.on('error', reject); socket.on('connect', () => socket.write(JSON.stringify({ action })+'\n'));
      socket.on('data', part => { buffer += part; if (Buffer.byteLength(buffer) > 8192) socket.destroy(new Error('CONTROL_TOO_LARGE')); });
      socket.on('end', () => { try { const r = JSON.parse(buffer); assert.ok(!r.error); done(r); } catch { reject(new Error('CONTROL_INVALID')); } });
    });
    const fault = await control('status'), observations = await control('observations');
    assert.equal(fault.state, 'DISARMED');
    assert.deepEqual(observations, { observations: [], overflow: false });
    const result = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD', `${env.WAREHOUSE_PROJECT_NAME}-db-1`,
      'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: dispatchSnapshotSQL(c), encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024,
      env: { ...process.env, PGPASSWORD: env.POSTGRES_PASSWORD } });
    assert.equal(result.status, 0, 'PRIVATE_READONLY_OBSERVATION_FAILED');
    const snapshot = JSON.parse(result.stdout.trim()); dispatchSnapshotShape(c, snapshot);
    const baseline = privateJSON(resolve(c.caseDirectory, 'baseline.json')).snapshot;
    writeBaseline(c, baseline);
    if (phase === 'after-submit') {
      // A PASS here requires independent pre-retry observations and a native
      // first error plus one explicit unchanged retry. No automatic replay.
      for (const name of ['after-offline-error', 'after-reconnect'])
        assert.deepEqual(privateJSON(resolve(c.caseDirectory, name+'.json')).snapshot, baseline);
      const native = privateJSON(resolve(c.caseDirectory, 'native-offline-retry.json'));
      assert.equal(native.nativeError, true); assert.equal(native.unchangedForm, true);
      assert.equal(native.nativeSuccess, true); assert.equal(native.submitAttempts, 2);
      committed(c, baseline, snapshot);
    } else {
      writeBaseline(c, snapshot);
      assert.deepEqual(snapshot, baseline, 'OFFLINE_REQUEST_OR_REPLAY_COMMITTED');
    }
    assert.deepEqual(await control('status'), fault, 'CONTROL_CHANGED_DURING_SNAPSHOT');
    assert.deepEqual(await control('observations'), observations, 'REQUEST_DURING_SNAPSHOT');
    writeFileSync(resolve(c.caseDirectory, phase+'.json'), JSON.stringify({phase,artifactSHA256:c.artifactSHA256,snapshot}), {flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify({status:'PASS',phase,scope:'readonly-offline-dispatch-observation'}));
} catch (error) {
  const blocked = ['ACTIVE_FIXTURE_RUN', 'RUN_NOT_RELEASED', 'SOAK_NOT_PASS', 'COMPLETE_SOAK_REQUIRED'].find(s => error.message?.includes(s));
  console.error(JSON.stringify({status:blocked?'BLOCKED':'FAIL',category:blocked||'OFFLINE_DISPATCH_OBSERVATION_FAILED'}));
  process.exitCode = blocked?2:1;
}
