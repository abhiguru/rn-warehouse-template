import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { acceptedAdvisories, assessDependencyAudit } from './audit-dependencies.mjs';

const nodePath = 'node_modules/node-forge';
const verified = [{ package: 'node-forge', installedPath: nodePath }];
const advisory = { name: 'node-forge', url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', range: '<=1.4.0', severity: 'high' };
function report(extra = {}) {
  const vulnerabilities = {
    'node-forge': { severity: 'high', nodes: [nodePath], via: [advisory] },
    'expo': { severity: 'high', nodes: ['node_modules/expo'], via: ['node-forge'] },
    ...extra,
  };
  const count = severity => Object.values(vulnerabilities).filter(entry => entry.severity === severity).length;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { info: count('info'), low: count('low'), moderate: count('moderate'), high: count('high'), critical: count('critical') } } };
}
// Every test names the day it runs on, so none of them starts failing when a
// review date passes.
const on = today => ({ today });
const beforeReview = on('2026-10-11');
const assess = (input, proofs, options = beforeReview) => assessDependencyAudit(input, proofs, options);
const sprintf = { name: 'sprintf-js', url: 'https://github.com/advisories/GHSA-hp3w-g68c-fv3c', range: '<=1.1.3', severity: 'moderate' };
const sprintfProof = { package: 'sprintf-js', installedPath: 'node_modules/sprintf-js' };

test('audit retains raw high count while covering only verified repairs', () => {
  const result = assess(report(), verified);
  assert.equal(result.status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.equal(result.rawHighOrCritical, 2);
  assert.equal(result.covered.length, 2);
  assert.deepEqual(result.unresolved, []);
});

test('audit propagates repaired roots through cyclic meta-vulnerability graphs', () => {
  const input = report({ cli: { severity: 'high', nodes: ['node_modules/cli'], via: ['expo'] } });
  input.vulnerabilities.expo.via.push('cli');
  assert.equal(assess(input, verified).covered.length, 3);
});

test('audit rejects new advisories and their transitive consumers', () => {
  const input = report();
  input.vulnerabilities['node-forge'].via.push({ ...advisory, url: 'https://github.com/advisories/GHSA-new-unknown' });
  const result = assess(input, verified);
  assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.equal(result.unresolved.length, 2);
});

test('audit rejects unverified installed copies, changed affected ranges and package mismatch', () => {
  assert.throws(() => assess(report(), []), /every verified/);
  const extra = report(); extra.vulnerabilities['node-forge'].nodes.push('node_modules/other/node_modules/node-forge');
  assert.throws(() => assess(extra, verified), /every verified/);
  for (const change of [{ range: '<=9.0.0' }, { name: 'other-package' }, { url: 'https://evil.invalid/GHSA-86w9-cpqp-85rv' }]) {
    const input = report(); input.vulnerabilities['node-forge'].via = [{ ...advisory, ...change }];
    assert.equal(assess(input, verified).unresolved.length, 2);
  }
});

test('audit rejects empty cycles, missing dependencies and malformed reports', () => {
  const input = report(); input.vulnerabilities['node-forge'].via = ['expo'];
  assert.equal(assess(input, verified).unresolved.length, 2);
  input.vulnerabilities['node-forge'].via = ['missing'];
  assert.throws(() => assess(input, verified), /Missing transitive/);
  assert.throws(() => assess({ error: 'network failure' }, verified), /Missing or unsupported/);
  const wrongCount = report(); wrongCount.metadata.vulnerabilities.high = 0;
  assert.throws(() => assess(wrongCount, verified), /counts do not reconcile/);
});

test('a moderate formatter root is covered only with every verified copy, including high consumers', () => {
  const input = report({ 'sprintf-js': { severity: 'moderate', nodes: ['node_modules/sprintf-js'], via: [sprintf] } });
  input.vulnerabilities.expo.via.push('sprintf-js');
  const proofs = [...verified, sprintfProof];
  assert.equal(assess(input, proofs).status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.throws(() => assess(input, verified), /every verified/);
  input.vulnerabilities['sprintf-js'].via.push({ name: 'sprintf-js', url: 'https://github.com/advisories/GHSA-new-unknown', range: '<=1.1.3' });
  // The moderate package itself is unresolved too, not only its high consumer.
  assert.deepEqual(assess(input, proofs).unresolved.map(entry => entry.package).sort(), ['expo', 'sprintf-js']);
});

// Review 2026-10-10, X5-9 / M9-3: the gate skipped every entry below high, so a
// new moderate advisory in a shipped package could not fail a build.
test('a new moderate advisory fails the gate, alone or beside accepted ones', () => {
  const fresh = { name: 'yup', url: 'https://github.com/advisories/GHSA-fict-ional-0001', range: '<1.9.9', severity: 'moderate' };
  const input = report({ yup: { severity: 'moderate', nodes: ['node_modules/yup'], via: [fresh] } });
  const result = assess(input, verified);
  assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.deepEqual(result.unresolved, [{ package: 'yup', reasons: [`UNREPAIRED:${fresh.url}`] }]);
  assert.equal(result.rawModerate, 1);
  assert.equal(result.rawHighOrCritical, 2);
  assert.equal(result.covered.length, 2);
});

test('a moderate package that only depends on a new moderate advisory fails too', () => {
  const fresh = { name: 'property-expr', url: 'https://github.com/advisories/GHSA-fict-ional-0002', range: '<9.9.9', severity: 'moderate' };
  const input = report({
    'property-expr': { severity: 'moderate', nodes: ['node_modules/property-expr'], via: [fresh] },
    yup: { severity: 'moderate', nodes: ['node_modules/yup'], via: ['property-expr'] },
  });
  assert.deepEqual(assess(input, verified).unresolved.map(entry => entry.package).sort(), ['property-expr', 'yup']);
});

test('moderate counts are reconciled like high ones', () => {
  const input = report({ 'sprintf-js': { severity: 'moderate', nodes: ['node_modules/sprintf-js'], via: [sprintf] } });
  input.metadata.vulnerabilities.moderate = 2;
  assert.throws(() => assess(input, [...verified, sprintfProof]), /counts do not reconcile/);
  delete input.metadata.vulnerabilities.moderate;
  assert.throws(() => assess(input, [...verified, sprintfProof]), /counts do not reconcile/);
});

test('a low advisory does not fail the gate but is listed', () => {
  const minor = { name: 'tiny', url: 'https://github.com/advisories/GHSA-fict-ional-0003', range: '<0.0.2', severity: 'low' };
  const result = assess(report({ tiny: { severity: 'low', nodes: ['node_modules/tiny'], via: [minor] } }), verified);
  assert.equal(result.status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.deepEqual(result.belowThreshold, [{ package: 'tiny', severity: 'low', reasons: [`UNREPAIRED:${minor.url}`] }]);
  const wrongCount = report({ tiny: { severity: 'low', nodes: ['node_modules/tiny'], via: [minor] } });
  wrongCount.metadata.vulnerabilities.low = 0;
  assert.throws(() => assess(wrongCount, verified), /counts do not reconcile/);
});

test('an accepted advisory stops being accepted after its review date', () => {
  const reviewBy = acceptedAdvisories['GHSA-86w9-cpqp-85rv'].reviewBy;
  assert.equal(assess(report(), verified, on(reviewBy)).status, 'PASS_WITH_VERIFIED_BACKPORTS');
  const [year, month, day] = reviewBy.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const late = assess(report(), verified, on(nextDay));
  assert.equal(late.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.deepEqual(late.unresolved.map(entry => entry.reasons), [['REVIEW_OVERDUE:GHSA-86w9-cpqp-85rv'], ['REVIEW_OVERDUE:GHSA-86w9-cpqp-85rv']]);
  // The installed repair is still required of an overdue entry.
  assert.throws(() => assess(report(), [], on(nextDay)), /every verified/);
  assert.throws(() => assess(report(), verified, on('11 October 2026')), /date/);
  assert.equal(assess(report(), verified).reviewBy, reviewBy);
});

test('the accepted list is exactly the advisories with a local backport, each with a review date', () => {
  const manifest = JSON.parse(readFileSync(new URL('./security-backports.json', import.meta.url), 'utf8'));
  const backported = Object.entries(manifest.references).map(([name, reference]) => `${reference.advisory} ${name}`).sort();
  assert.deepEqual(Object.entries(acceptedAdvisories).map(([id, entry]) => `${id} ${entry.package}`).sort(), backported);
  for (const entry of Object.values(acceptedAdvisories)) {
    assert.match(entry.reviewBy, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${entry.reviewBy}T00:00:00Z`).toISOString().slice(0, 10), entry.reviewBy);
    assert.ok(entry.range && entry.reason);
  }
});
