import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDependencyAudit } from './audit-dependencies.mjs';

const nodePath = 'node_modules/node-forge';
const verified = [{ package: 'node-forge', installedPath: nodePath }];
const advisory = { name: 'node-forge', url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', range: '<=1.4.0', severity: 'high' };
function report(extra = {}) {
  const vulnerabilities = {
    'node-forge': { severity: 'high', nodes: [nodePath], via: [advisory] },
    'expo': { severity: 'high', nodes: ['node_modules/expo'], via: ['node-forge'] },
    ...extra,
  };
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { high: Object.keys(vulnerabilities).length, critical: 0 } } };
}

test('audit retains raw high count while covering only verified repairs', () => {
  const result = assessDependencyAudit(report(), verified);
  assert.equal(result.status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.equal(result.rawHighOrCritical, 2);
  assert.equal(result.covered.length, 2);
  assert.deepEqual(result.unresolved, []);
});

test('audit propagates repaired roots through cyclic meta-vulnerability graphs', () => {
  const input = report({ cli: { severity: 'high', nodes: ['node_modules/cli'], via: ['expo'] } });
  input.vulnerabilities.expo.via.push('cli');
  assert.equal(assessDependencyAudit(input, verified).covered.length, 3);
});

test('audit rejects new advisories and their transitive consumers', () => {
  const input = report();
  input.vulnerabilities['node-forge'].via.push({ ...advisory, url: 'https://github.com/advisories/GHSA-new-unknown' });
  const result = assessDependencyAudit(input, verified);
  assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.equal(result.unresolved.length, 2);
});

test('audit rejects unverified installed copies, changed affected ranges and package mismatch', () => {
  assert.throws(() => assessDependencyAudit(report(), []), /every verified/);
  const extra = report(); extra.vulnerabilities['node-forge'].nodes.push('node_modules/other/node_modules/node-forge');
  assert.throws(() => assessDependencyAudit(extra, verified), /every verified/);
  for (const change of [{ range: '<=9.0.0' }, { name: 'other-package' }, { url: 'https://evil.invalid/GHSA-86w9-cpqp-85rv' }]) {
    const input = report(); input.vulnerabilities['node-forge'].via = [{ ...advisory, ...change }];
    assert.equal(assessDependencyAudit(input, verified).unresolved.length, 2);
  }
});

test('audit rejects empty cycles, missing dependencies and malformed reports', () => {
  const input = report(); input.vulnerabilities['node-forge'].via = ['expo'];
  assert.equal(assessDependencyAudit(input, verified).unresolved.length, 2);
  input.vulnerabilities['node-forge'].via = ['missing'];
  assert.throws(() => assessDependencyAudit(input, verified), /Missing transitive/);
  assert.throws(() => assessDependencyAudit({ error: 'network failure' }, verified), /Missing or unsupported/);
  const wrongCount = report(); wrongCount.metadata.vulnerabilities.high = 0;
  assert.throws(() => assessDependencyAudit(wrongCount, verified), /counts do not reconcile/);
});
