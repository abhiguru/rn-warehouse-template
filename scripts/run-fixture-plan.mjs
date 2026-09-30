// Linux operator harness. A reviewed private plan is executable input, not a sandbox.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, openSync, closeSync, mkdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { isMain } from './is-main.mjs';

const digest = b => createHash('sha256').update(b).digest('hex');
function owned(path, directory = false) {
  const s = lstatSync(path);
  assert.ok(!s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o077) === 0,
    'Plan and evidence must be privately owned; symlinks are refused');
  assert.ok(directory ? s.isDirectory() : s.isFile());
}
function command(c) {
  assert.ok(c && isAbsolute(c.cwd) && Array.isArray(c.argv) && c.argv.length &&
    c.argv.every(x => typeof x === 'string' && !x.includes('\0')) && isAbsolute(c.argv[0]),
  'Commands require an absolute executable and working directory; no shell expansion');
  assert.ok(Number.isInteger(c.timeoutSeconds) && c.timeoutSeconds > 0 && c.timeoutSeconds <= 3600,
    'Each command requires a timeout of 1..3600 seconds');
}
export function validatePlan(p) {
  assert.equal(p.schema, 1);
  assert.equal(p.scope, 'isolated-fictional-fixture');
  assert.ok(p.bindings && p.bindings.length >= 3, 'Bind artifact, source manifest and fixture identity');
  assert.equal(new Set(p.bindings.map(b => b.path)).size, p.bindings.length, 'Bindings must be distinct files');
  for (const b of p.bindings) {
    assert.ok(isAbsolute(b.path) && /^[a-f0-9]{64}$/.test(b.sha256));
  }
  assert.ok(p.preflight?.length, 'Read-only fixture ownership/health preflight required');
  p.preflight.forEach(command);
  assert.ok(p.steps?.length);
  const ids = new Set();
  for (const s of p.steps) {
    assert.match(s.id, /^[a-z0-9][a-z0-9_-]{0,63}$/);
    assert.ok(!ids.has(s.id), 'Duplicate step id'); ids.add(s.id);
    command(s.run); command(s.verify);
  }
  const seconds = p.steps.reduce((n, s) => n + s.run.timeoutSeconds + s.verify.timeoutSeconds, 0) +
    p.preflight.reduce((n, c) => n + c.timeoutSeconds, 0) * (p.steps.length + 1);
  assert.ok(seconds <= 24 * 3600, 'Plan worst-case command time exceeds 24 hours');
}
function bindingsMatch(p) {
  for (const b of p.bindings) assert.equal(digest(readFileSync(b.path)), b.sha256, 'Bound input changed; refuse evidence reuse');
}
function save(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(tmp, path);
}
async function execute(c, path) {
  const fd = openSync(path, 'wx', 0o600);
  let child, timer, killTimer;
  try {
    return await new Promise(resolveResult => {
      let timedOut = false, interrupted = false;
      const stop = () => {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Process group already exited. */ }
        killTimer ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Process group already exited. */ } }, 1000);
      };
      const signal = () => { interrupted = true; stop(); };
      child = spawn(c.argv[0], c.argv.slice(1), { cwd: c.cwd, detached: true, stdio: ['ignore', fd, fd] });
      process.once('SIGINT', signal); process.once('SIGTERM', signal);
      const done = status => {
        clearTimeout(timer); clearTimeout(killTimer);
        if (timedOut || interrupted) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Process group already exited. */ } }
        process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
        resolveResult(status);
      };
      child.once('error', () => done('FAIL'));
      child.once('close', code => done(interrupted ? 'INTERRUPTED' : timedOut ? 'TIMEOUT' : code === 0 ? 'PASS' : code === 2 ? 'BLOCKED' : 'FAIL'));
      timer = setTimeout(() => { timedOut = true; stop(); }, c.timeoutSeconds * 1000);
    });
  } finally { closeSync(fd); }
}
export async function runPlan(planPath, evidenceDir, resume = false) {
  process.umask(0o077);
  planPath = resolve(planPath); evidenceDir = resolve(evidenceDir);
  owned(planPath); owned(dirname(planPath), true);
  const raw = readFileSync(planPath); const p = JSON.parse(raw); validatePlan(p); bindingsMatch(p);
  if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { mode: 0o700 });
  owned(evidenceDir, true);
  const lock = `${evidenceDir}/run.lock`; const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, `${process.pid}\n`); closeSync(fd);
  const ledgerPath = `${evidenceDir}/ledger.json`;
  try {
    let ledger;
    if (existsSync(ledgerPath)) {
      assert.ok(resume, 'Existing evidence requires explicit --resume'); owned(ledgerPath);
      ledger = JSON.parse(readFileSync(ledgerPath));
      assert.equal(ledger.planSHA256, digest(raw), 'Plan changed; refuse checkpoint reuse');
      assert.ok(ledger.steps.every(s => s.status === 'PASS'),
        'Failed, blocked or interrupted attempt requires review; never automatically rerun writes');
      assert.deepEqual(ledger.steps.map(s => s.id), p.steps.slice(0, ledger.steps.length).map(s => s.id));
    } else {
      assert.ok(!resume, 'No checkpoint exists to resume');
      ledger = { schema: 1, planSHA256: digest(raw), steps: [], checks: [] };
      save(ledgerPath, ledger);
    }
    const check = async (c, label) => {
      const file = `check-${ledger.checks.length}.log`;
      const row = { label, status: 'RUNNING', log: file, at: new Date().toISOString() };
      ledger.checks.push(row); save(ledgerPath, ledger);
      row.status = await execute(c, `${evidenceDir}/${file}`); save(ledgerPath, ledger);
      assert.equal(row.status, 'PASS', 'Preflight/checkpoint verification stopped the plan; see private ledger');
    };
    for (let n = 0; n < p.preflight.length; n++) await check(p.preflight[n], `preflight-${n}`);
    // Revalidate saved postconditions; do not repeat successful state-changing actions.
    for (const s of ledger.steps) {
      assert.equal(digest(readFileSync(`${evidenceDir}/${s.log}`)), s.logSHA256, 'Saved evidence changed');
      await check(p.steps.find(x => x.id === s.id).verify, `resume-${s.id}`);
    }
    for (const s of p.steps.slice(ledger.steps.length)) {
      bindingsMatch(p);
      for (let n = 0; n < p.preflight.length; n++) await check(p.preflight[n], `before-${s.id}-${n}`);
      const row = { id: s.id, status: 'RUNNING', log: `${s.id}.log`, at: new Date().toISOString() };
      ledger.steps.push(row); save(ledgerPath, ledger);
      row.status = await execute(s.run, `${evidenceDir}/${row.log}`);
      row.logSHA256 = digest(readFileSync(`${evidenceDir}/${row.log}`)); save(ledgerPath, ledger);
      assert.equal(row.status, 'PASS', 'Step stopped the plan; see private ledger');
      // A successful exit alone is insufficient: retain failure if postconditions fail.
      row.status = 'VERIFYING'; save(ledgerPath, ledger);
      try { await check(s.verify, `after-${s.id}`); row.status = 'PASS'; }
      catch (e) { row.status = 'FAIL'; save(ledgerPath, ledger); throw e; }
      save(ledgerPath, ledger);
      console.log(`${s.id}: PASS`);
    }
    return ledger;
  } finally { unlinkSync(lock); }
}
if (isMain(import.meta.url)) {
  const [plan, evidence, option] = process.argv.slice(2);
  try {
    assert.ok(plan && evidence && (!option || option === '--resume'),
      'Usage: node scripts/run-fixture-plan.mjs PRIVATE_PLAN PRIVATE_EVIDENCE [--resume]');
    await runPlan(plan, evidence, option === '--resume');
  } catch {
    // Commands, arguments and child output may be sensitive; retain them privately.
    console.error('Fixture plan stopped. Inspect the private ledger; do not automatically repeat writes.');
    process.exitCode = 1;
  }
}
