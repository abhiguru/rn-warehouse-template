import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { acceptedAdvisories, acceptedWithoutRepair, assessDependencyAudit, shippedPaths, toolingParents } from './audit-dependencies.mjs';

const nodePath = 'node_modules/braces';
const verified = [{ package: 'braces', installedPath: nodePath }];
const advisory = { name: 'braces', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', range: '<=3.0.3', severity: 'high' };
function report(extra = {}) {
  const vulnerabilities = {
    'braces': { severity: 'high', nodes: [nodePath], via: [advisory] },
    'expo': { severity: 'high', nodes: ['node_modules/expo'], via: ['braces'] },
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
  input.vulnerabilities['braces'].via.push({ ...advisory, url: 'https://github.com/advisories/GHSA-new-unknown' });
  const result = assess(input, verified);
  assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.equal(result.unresolved.length, 2);
});

test('audit rejects unverified installed copies, changed affected ranges and package mismatch', () => {
  assert.throws(() => assess(report(), []), /every verified/);
  const extra = report(); extra.vulnerabilities['braces'].nodes.push('node_modules/other/node_modules/braces');
  assert.throws(() => assess(extra, verified), /every verified/);
  for (const change of [{ range: '<=9.0.0' }, { name: 'other-package' }, { url: 'https://evil.invalid/GHSA-vfj7-8cjw-p6xm' }]) {
    const input = report(); input.vulnerabilities['braces'].via = [{ ...advisory, ...change }];
    assert.equal(assess(input, verified).unresolved.length, 2);
  }
});

test('audit rejects empty cycles, missing dependencies and malformed reports', () => {
  const input = report(); input.vulnerabilities['braces'].via = ['expo'];
  assert.equal(assess(input, verified).unresolved.length, 2);
  input.vulnerabilities['braces'].via = ['missing'];
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
  const reviewBy = acceptedAdvisories['GHSA-vfj7-8cjw-p6xm'].reviewBy;
  assert.equal(assess(report(), verified, on(reviewBy)).status, 'PASS_WITH_VERIFIED_BACKPORTS');
  const [year, month, day] = reviewBy.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const late = assess(report(), verified, on(nextDay));
  assert.equal(late.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.deepEqual(late.unresolved.map(entry => entry.reasons), [['REVIEW_OVERDUE:GHSA-vfj7-8cjw-p6xm'], ['REVIEW_OVERDUE:GHSA-vfj7-8cjw-p6xm']]);
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

const deepmerge = { name: 'deepmerge', url: 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4', range: '>=4.2.0 <=4.3.1', severity: 'low' };
const deepmergeProof = ['node_modules/deepmerge'].map(installedPath => ({ package: 'deepmerge', installedPath }));
const withDeepmerge = (advisoryEntry = deepmerge) => {
  const input = report({ deepmerge: { severity: 'low', nodes: ['node_modules/deepmerge'], via: [advisoryEntry] } });
  input.vulnerabilities.expo.via.push('deepmerge');
  return input;
};

test('audit accepts the deepmerge advisory (low, via expo) only with the installed repair verified', () => {
  const result = assess(withDeepmerge(), [...verified, ...deepmergeProof]);
  assert.equal(result.status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.deepEqual(result.covered.find(entry => entry.package === 'expo').advisories, ['GHSA-gcqx-w48m-w2h4', 'GHSA-vfj7-8cjw-p6xm']);
  assert.equal(result.belowThreshold.find(entry => entry.package === 'deepmerge').severity, 'low');
  assert.throws(() => assess(withDeepmerge(), verified), /every verified/);
  assert.equal(acceptedAdvisories['GHSA-gcqx-w48m-w2h4'].reviewBy, '2027-01-28');
});

test('audit refuses a changed deepmerge range and an overdue review', () => {
  const widened = assess(withDeepmerge({ ...deepmerge, range: '>=4.2.0 <=4.3.2' }), [...verified, ...deepmergeProof]);
  assert.equal(widened.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.ok(widened.unresolved.some(entry => entry.package === 'expo' && entry.reasons.includes(`UNREPAIRED:${deepmerge.url}`)));
  const late = assess(withDeepmerge(), [...verified, ...deepmergeProof], on('2027-01-29'));
  assert.equal(late.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.ok(late.unresolved.some(entry => entry.reasons.includes('REVIEW_OVERDUE:GHSA-gcqx-w48m-w2h4')));
});

// Accepted without a local repair: build and dev tooling only, never in the shipped dependency tree.
const globAdvisory = { name: 'glob', url: 'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4', range: '>=9.0.0 <=14.0.1', severity: 'moderate' };
const minimatchAdvisory = { name: 'minimatch', url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249', range: '<11.0.1', severity: 'moderate' };
const withTooling = () => {
  const input = report({
    glob: { severity: 'moderate', nodes: ['node_modules/glob', 'node_modules/foo/node_modules/glob'], via: [globAdvisory, 'minimatch'] },
    minimatch: { severity: 'moderate', nodes: ['node_modules/minimatch'], via: [minimatchAdvisory] },
    '@expo/cli': { severity: 'moderate', nodes: ['node_modules/@expo/cli'], via: ['glob'] },
  });
  return input;
};
const noShipped = { shipped: [] };

test('glob and minimatch are accepted without a repair while nothing shipped declares them', () => {
  const result = assess(withTooling(), verified, { ...beforeReview, ...noShipped });
  assert.equal(result.status, 'PASS_WITH_VERIFIED_BACKPORTS');
  assert.deepEqual(result.unresolved, []);
  const cli = result.covered.find(entry => entry.package === '@expo/cli');
  assert.deepEqual(cli.advisories, ['GHSA-3g3m-2fjr-6pw4', 'GHSA-g3hv-75wg-m249']);
  assert.equal(result.reviewByWithoutRepair, '2026-12-15');
  // Alone, without a backported advisory, the status says what was accepted.
  const only = withTooling();
  delete only.vulnerabilities.braces; delete only.vulnerabilities.expo;
  only.metadata.vulnerabilities = { info: 0, low: 0, moderate: 3, high: 0, critical: 0 };
  assert.equal(assess(only, [], { ...beforeReview, ...noShipped }).status, 'PASS_WITH_ACCEPTED_TOOLING_ADVISORIES');
});

test('the gate fails when an accepted-without-repair package is in the shipped dependency tree', () => {
  const shipped = [{ package: 'minimatch', path: 'rn-warehouse-template > some-runtime-lib > minimatch' }];
  const result = assess(withTooling(), verified, { ...beforeReview, shipped });
  assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.ok(result.unresolved.some(entry => entry.package === 'minimatch' && entry.reasons.includes('SHIPPED:GHSA-g3hv-75wg-m249')));
  // Its consumers carry the refusal with it.
  assert.ok(result.unresolved.some(entry => entry.package === 'glob' && entry.reasons.includes('SHIPPED:GHSA-g3hv-75wg-m249')));
});

test('the production dependency paths are required, never assumed empty', () => {
  assert.throws(() => assess(withTooling(), verified), /production dependency paths are required/);
});

test('accepting without a repair ends on the review date, and only for the named package and range', () => {
  const [year, month, day] = acceptedWithoutRepair['GHSA-3g3m-2fjr-6pw4'].reviewBy.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  assert.equal(assess(withTooling(), verified, { ...on(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`), ...noShipped }).status, 'PASS_WITH_VERIFIED_BACKPORTS');
  const late = assess(withTooling(), verified, { ...on(nextDay), ...noShipped });
  assert.equal(late.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  assert.ok(late.unresolved.some(entry => entry.reasons.includes('REVIEW_OVERDUE:GHSA-3g3m-2fjr-6pw4')));
  for (const change of [{ range: '<=99.0.0' }, { name: 'other-package' }, { url: 'https://evil.invalid/GHSA-3g3m-2fjr-6pw4' }]) {
    const input = withTooling(); input.vulnerabilities.glob.via = [{ ...globAdvisory, ...change }, 'minimatch'];
    const result = assess(input, verified, { ...beforeReview, ...noShipped });
    assert.equal(result.status, 'FAIL_UNREPAIRED_DEPENDENCIES');
  }
});

test('shippedPaths allows tooling parents only', () => {
  const tree = {
    name: 'rn-warehouse-template',
    dependencies: {
      expo: { dependencies: { '@expo/cli': { dependencies: { glob: { dependencies: { minimatch: {} } } } }, '@expo/fingerprint': { dependencies: { minimatch: {} } } } },
      'expo-updates': { dependencies: { glob: {} } },
    },
  };
  const names = ['glob', 'minimatch'];
  assert.deepEqual(shippedPaths(tree, names), []);
  // A runtime library, or the app itself, starts to declare one of them.
  tree.dependencies.expo.dependencies['some-runtime-lib'] = { dependencies: { minimatch: {} } };
  assert.deepEqual(shippedPaths(tree, names), [{ package: 'minimatch', path: 'rn-warehouse-template > expo > some-runtime-lib > minimatch' }]);
  tree.dependencies.glob = {};
  assert.deepEqual(shippedPaths(tree, names).map(found => found.path), [
    'rn-warehouse-template > expo > some-runtime-lib > minimatch',
    'rn-warehouse-template > glob',
  ]);
  assert.throws(() => shippedPaths({}, names), /npm ls/);
  assert.ok(toolingParents.includes('@expo/cli') && !toolingParents.includes('expo'));
});

test('the accepted-without-repair list is separate from the backported one and fully dated', () => {
  for (const [id, entry] of Object.entries(acceptedWithoutRepair)) {
    assert.ok(!Object.hasOwn(acceptedAdvisories, id));
    assert.match(entry.reviewBy, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${entry.reviewBy}T00:00:00Z`).toISOString().slice(0, 10), entry.reviewBy);
    assert.ok(entry.package && entry.range && entry.reason);
  }
  assert.deepEqual(Object.keys(acceptedWithoutRepair).sort(), ['GHSA-3g3m-2fjr-6pw4', 'GHSA-g3hv-75wg-m249']);
});
