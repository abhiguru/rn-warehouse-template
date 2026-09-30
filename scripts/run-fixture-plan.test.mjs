import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runPlan, validatePlan } from './run-fixture-plan.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-plan-test-')); chmodSync(dir, 0o700);
  const bound = join(dir, 'bound');
  const bindings = ['bound', 'source', 'identity'].map(name => { const path = join(dir, name); writeFileSync(path, 'fixture', { mode: 0o600 }); return { path, sha256: sha('fixture') }; });
  const cmd = code => ({ cwd: dir, argv: [process.execPath, '-e', code], timeoutSeconds: 5 });
  const output = join(dir, 'receipt');
  const plan = { schema: 1, scope: 'isolated-fictional-fixture',
    bindings,
    preflight: [cmd('process.exit(0)')],
    steps: [{ id: 'receipt', run: cmd(`require('fs').writeFileSync(${JSON.stringify(output)}, 'once', {flag:'wx'}); console.log('private-output-sentinel')`),
      verify: cmd(`if(require('fs').readFileSync(${JSON.stringify(output)},'utf8') !== 'once')process.exit(1)`) }] };
  const file = join(dir, 'plan.json'), evidence = join(dir, 'evidence');
  const save = () => writeFileSync(file, JSON.stringify(plan), { mode: 0o600 }); save();
  return { dir, bound, cmd, output, plan, file, evidence, save, close: () => rmSync(dir, { recursive: true, force: true }) };
}
test('successful checkpoint resumes by checking postconditions without repeating a write', async () => {
  const f = fixture();
  try {
    await runPlan(f.file, f.evidence);
    await assert.rejects(runPlan(f.file, f.evidence), /explicit --resume/);
    const ledger = await runPlan(f.file, f.evidence, true);
    assert.equal(ledger.steps.length, 1); assert.equal(ledger.steps[0].status, 'PASS');
    assert.equal(readFileSync(f.output, 'utf8'), 'once');
    assert.equal(statSync(join(f.evidence, 'ledger.json')).mode & 0o777, 0o600);
    assert.equal(statSync(join(f.evidence, 'receipt.log')).mode & 0o777, 0o600);
    assert.equal(statSync(f.evidence).mode & 0o777, 0o700);
    assert.match(readFileSync(join(f.evidence, 'receipt.log'), 'utf8'), /private-output-sentinel/);
    assert.ok(!existsSync(join(f.evidence, 'run.lock')));
  } finally { f.close(); }
});
test('changed artifact, plan, saved evidence or postcondition refuses reuse', async () => {
  for (const change of ['binding', 'plan', 'log', 'postcondition']) {
    const f = fixture();
    try {
      await runPlan(f.file, f.evidence);
      if (change === 'binding') writeFileSync(f.bound, 'changed');
      if (change === 'plan') { f.plan.steps[0].run.timeoutSeconds = 6; f.save(); }
      if (change === 'log') writeFileSync(join(f.evidence, 'receipt.log'), 'changed');
      if (change === 'postcondition') writeFileSync(f.output, 'changed');
      await assert.rejects(runPlan(f.file, f.evidence, true));
      assert.equal(JSON.parse(readFileSync(join(f.evidence, 'ledger.json'))).steps.length, 1);
    } finally { f.close(); }
  }
});
test('FAIL and BLOCKED stop dependent writes and cannot silently retry', async () => {
  for (const [code, status] of [[1, 'FAIL'], [2, 'BLOCKED']]) {
    const f = fixture();
    try {
      f.plan.steps.unshift({ id: 'first', run: f.cmd(`process.exit(${code})`), verify: f.cmd('process.exit(0)') }); f.save();
      await assert.rejects(runPlan(f.file, f.evidence));
      assert.ok(!existsSync(f.output));
      assert.equal(JSON.parse(readFileSync(join(f.evidence, 'ledger.json'))).steps[0].status, status);
      await assert.rejects(runPlan(f.file, f.evidence, true), /never automatically rerun/);
    } finally { f.close(); }
  }
});
test('bounded timeout records TIMEOUT and refuses an interrupted mutation on resume', async () => {
  const f = fixture();
  try {
    f.plan.steps[0].run = { ...f.cmd('setInterval(()=>{},1000)'), timeoutSeconds: 1 }; f.save();
    const start = Date.now(); await assert.rejects(runPlan(f.file, f.evidence));
    assert.ok(Date.now() - start < 6000);
    const file = join(f.evidence, 'ledger.json'); const ledger = JSON.parse(readFileSync(file));
    assert.equal(ledger.steps[0].status, 'TIMEOUT');
    ledger.steps[0].status = 'RUNNING'; writeFileSync(file, JSON.stringify(ledger));
    await assert.rejects(runPlan(f.file, f.evidence, true), /interrupted/);
  } finally { f.close(); }
});
test('failed preflight and failed postcondition never claim a successful case', async () => {
  for (const stage of ['preflight', 'postcondition']) {
    const f = fixture();
    try {
      if (stage === 'preflight') f.plan.preflight = [f.cmd('process.exit(2)')];
      else f.plan.steps[0].verify = f.cmd('process.exit(1)'); f.save();
      await assert.rejects(runPlan(f.file, f.evidence));
      const l = JSON.parse(readFileSync(join(f.evidence, 'ledger.json')));
      assert.equal(l.steps.length, stage === 'preflight' ? 0 : 1);
      if (stage === 'postcondition') assert.equal(l.steps[0].status, 'FAIL');
    } finally { f.close(); }
  }
});
test('privacy, exclusive lock and plan bounds fail closed', async () => {
  const f = fixture();
  try {
    chmodSync(f.file, 0o644); await assert.rejects(runPlan(f.file, f.evidence), /privately owned/); chmodSync(f.file, 0o600);
    await runPlan(f.file, f.evidence);
    writeFileSync(join(f.evidence, 'run.lock'), 'unreviewed lock', { mode: 0o600 });
    await assert.rejects(runPlan(f.file, f.evidence, true), /EEXIST/);
    assert.equal(readFileSync(join(f.evidence, 'run.lock'), 'utf8'), 'unreviewed lock');
    f.plan.steps[0].run.timeoutSeconds = 0; assert.throws(() => validatePlan(f.plan), /timeout/);
    f.plan.scope = 'production'; assert.throws(() => validatePlan(f.plan));
  } finally { f.close(); }
});
