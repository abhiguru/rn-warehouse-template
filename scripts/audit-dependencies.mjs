import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityBackports } from './patch-security-backports.mjs';
import { isMain } from './is-main.mjs';

// The whole list of advisories this project accepts. Each one has no fixed
// upstream release and is repaired in the installed source by
// scripts/security-backports.json. An entry is accepted only for the named
// package and affected range, only while every installed copy carries the
// repair, and only until `reviewBy` (UTC date). After that day the gate fails
// until someone checks upstream for a release and either removes the entry
// with its backport or moves the date; see docs/DEPENDENCY_SECURITY.md.
export const acceptedAdvisories = {
  'GHSA-vfj7-8cjw-p6xm': { package: 'braces', range: '<=3.0.3', reviewBy: '2027-01-10', reason: 'local depth bound; no patched release' },
  'GHSA-hp3w-g68c-fv3c': { package: 'sprintf-js', range: '<=1.1.3', reviewBy: '2027-01-10', reason: 'local precision bound; no patched release' },
  'GHSA-gcqx-w48m-w2h4': { package: 'deepmerge', range: '>=4.2.0<=4.3.1', reviewBy: '2027-01-28', reason: 'local fix in deepmerge 4.3.1 (own __proto__ key defined as a data property, upstream PR 277); no patched release' },
};
// The second, separate list: advisories accepted WITHOUT a local repair. Only for packages that build and
// development tooling uses and that the shipped app does not contain. Each entry names the advisory, the
// package and range, the reason and a `reviewBy` date (UTC); after that day the gate fails. There is no
// repair to verify, so the protection is different: the gate also reads the production dependency tree
// (`npm ls --omit=dev --all`) and fails when one of these packages is declared as a dependency by anything
// other than a package in `toolingParents`, and, for the root project, by the app itself. See
// docs/DEPENDENCY_SECURITY.md for who the parents are and the evidence that none of it is in the bundle.
export const acceptedWithoutRepair = {
  'GHSA-3g3m-2fjr-6pw4': { package: 'glob', range: '>=9.0.0<=14.0.1', reviewBy: '2026-12-15', reason: 'build and dev tooling only (Expo CLI, config plugins, fingerprint, Metro config, Sentry bundler plugin, Jest, ESLint); not in the app bundle; fixed release 14.0.2 is not reachable through the Expo and Jest versions in use' },
  'GHSA-g3hv-75wg-m249': { package: 'minimatch', range: '<11.0.1', reviewBy: '2026-12-15', reason: 'build and dev tooling only (glob, Expo fingerprint, ESLint, Jest, typescript-eslint); not in the app bundle; fixed release 11.0.1 is not reachable through the versions in use' },
};
// The packages that may declare glob or minimatch in the production tree. Each uses it in build, prebuild or
// tooling code that the app's bundle never imports (expo-updates: only in utils/build/vcs.js).
export const toolingParents = [
  '@expo/cli', '@expo/config', '@expo/config-plugins', '@expo/fingerprint', '@expo/metro-config',
  '@sentry/bundler-plugins', 'expo-updates',
];

// Every place in the production tree (`npm ls --omit=dev --all --json`) where one of `names` is declared as a
// dependency by a package that is not a tooling parent (the packages in `names` may declare one another).
export function shippedPaths(tree, names, allowedParents = toolingParents) {
  if (!tree || typeof tree !== 'object' || !tree.dependencies || typeof tree.dependencies !== 'object') throw new Error('Missing or unsupported npm ls report');
  const found = [];
  const walk = (node, chain) => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      const parent = chain[chain.length - 1];
      if (names.includes(name) && !allowedParents.includes(parent) && !names.includes(parent)) found.push({ package: name, path: [...chain, name].join(' > ') });
      walk(child ?? {}, [...chain, name]);
    }
  };
  walk(tree, [tree.name ?? '(root)']);
  return found;
}
// Any other advisory at one of these severities fails the gate. Low and info
// entries are listed in the result and do not fail it.
const gated = new Set(['moderate', 'high', 'critical']);
const refused = reason => reason.startsWith('UNREPAIRED:') || reason.startsWith('REVIEW_OVERDUE:') || reason.startsWith('SHIPPED:');

// npm's registry report describes published tarballs. Retain that report and
// require the installed source repair for every affected copy and graph path.
export function assessDependencyAudit(report, verified, { today = new Date().toISOString().slice(0, 10), accepted = acceptedAdvisories, withoutRepair = acceptedWithoutRepair, shipped } = {}) {
  const isDate = text => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text);
  if (!isDate(today) || [...Object.values(accepted), ...Object.values(withoutRepair)].some(entry => !isDate(entry.reviewBy))) throw new Error('Audit date and review dates must be YYYY-MM-DD');
  if (report.auditReportVersion !== 2 || report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) {
    throw new Error('Missing or unsupported npm audit report');
  }
  const entries = Object.entries(report.vulnerabilities);
  const roots = new Map();
  const dependencies = new Map();
  const unresolved = [];
  for (const [name, entry] of entries) {
    if (!Array.isArray(entry.via) || !Array.isArray(entry.nodes) || !['info', 'low', 'moderate', 'high', 'critical'].includes(entry.severity)) {
      throw new Error('Malformed npm vulnerability entry');
    }
    const reasons = new Set();
    const parents = [];
    for (const reason of entry.via) {
      if (typeof reason === 'string') {
        if (!(reason in report.vulnerabilities)) throw new Error('Missing transitive audit dependency');
        parents.push(reason);
        continue;
      }
      if (!reason || typeof reason !== 'object' || typeof reason.url !== 'string') throw new Error('Malformed advisory');
      const id = reason.url.replace('https://github.com/advisories/', '');
      const repair = Object.hasOwn(accepted, id) ? accepted[id] : undefined;
      const tooling = Object.hasOwn(withoutRepair, id) ? withoutRepair[id] : undefined;
      if (!repair && tooling && reason.url === `https://github.com/advisories/${id}` && name === tooling.package && reason.name === tooling.package && reason.range.replaceAll(' ', '') === tooling.range) {
        // Accepted without a repair: only while nothing shipped declares the package, and until the review date.
        if (!Array.isArray(shipped)) throw new Error('The production dependency paths are required to accept an advisory without a repair');
        reasons.add(shipped.some(path => path.package === name) ? `SHIPPED:${id}` : today > tooling.reviewBy ? `REVIEW_OVERDUE:${id}` : id);
        continue;
      }
      if (!repair || reason.url !== `https://github.com/advisories/${id}` || name !== repair.package || reason.name !== repair.package || reason.range.replaceAll(' ', '') !== repair.range) {
        reasons.add(`UNREPAIRED:${reason.url}`);
        continue;
      }
      const installedPaths = new Set(verified.filter(file => file.package === name).map(file => file.installedPath));
      if (!entry.nodes.length || entry.nodes.length !== installedPaths.size || entry.nodes.some(path => !installedPaths.has(path))) {
        throw new Error('Audit nodes do not match every verified installed dependency');
      }
      reasons.add(today > repair.reviewBy ? `REVIEW_OVERDUE:${id}` : id);
    }
    roots.set(name, reasons);
    dependencies.set(name, parents);
  }
  // A fixed point preserves cyclic npm meta-vulnerability graphs without
  // accepting an empty cycle or dropping a second, unrepaired advisory.
  for (let pass = 0; pass <= entries.length; pass++) {
    let changed = false;
    for (const [name, parents] of dependencies) for (const parent of parents) for (const reason of roots.get(parent)) {
      if (!roots.get(name).has(reason)) { roots.get(name).add(reason); changed = true; }
    }
    if (!changed) break;
  }
  const covered = [];
  const belowThreshold = [];
  for (const [name, entry] of entries) {
    const reasons = [...roots.get(name)].sort();
    if (!gated.has(entry.severity)) belowThreshold.push({ package: name, severity: entry.severity, reasons });
    else if (!reasons.length || reasons.some(refused)) unresolved.push({ package: name, reasons });
    else covered.push({ package: name, advisories: reasons });
  }
  // npm's own totals must agree with the entries that were judged, at every
  // severity, so nothing in the report is passed over.
  const counts = report.metadata.vulnerabilities;
  const reported = severity => counts[severity] ?? (severity === 'info' || severity === 'low' ? 0 : NaN);
  const reportedHigh = reported('high') + reported('critical');
  const reportedModerate = reported('moderate');
  const reportedBelow = reported('low') + reported('info');
  if (![reportedHigh, reportedModerate, reportedBelow].every(Number.isInteger)
    || reportedHigh + reportedModerate !== covered.length + unresolved.length
    || reportedHigh !== entries.filter(([, entry]) => entry.severity === 'high' || entry.severity === 'critical').length
    || reportedBelow !== belowThreshold.length) throw new Error('Audit severity counts do not reconcile');
  const reviewBy = Object.values(accepted).map(entry => entry.reviewBy).sort()[0] ?? null;
  const toolingIds = Object.keys(withoutRepair);
  const usedToolingIds = new Set(covered.flatMap(entry => entry.advisories).filter(id => toolingIds.includes(id)));
  const reviewByWithoutRepair = [...usedToolingIds].map(id => withoutRepair[id].reviewBy).sort()[0] ?? null;
  const status = unresolved.length ? 'FAIL_UNREPAIRED_DEPENDENCIES'
    : covered.some(entry => entry.advisories.some(id => Object.hasOwn(accepted, id))) ? 'PASS_WITH_VERIFIED_BACKPORTS'
    : covered.length ? 'PASS_WITH_ACCEPTED_TOOLING_ADVISORIES' : 'PASS';
  return { status, rawHighOrCritical: reportedHigh, rawModerate: reportedModerate, reviewBy, reviewByWithoutRepair, covered, unresolved, belowThreshold };
}

export function auditDependencies(root, reportDirectory) {
  const verified = securityBackports(root, { verifyOnly: true });
  const run = spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (run.error || ![0, 1].includes(run.status)) throw new Error('npm audit failed to return a complete report');
  let report;
  try { report = JSON.parse(run.stdout); } catch { throw new Error('npm audit returned invalid JSON'); }
  // Which of the accepted-without-repair packages the shipped (production) dependency tree declares.
  const listing = spawnSync('npm', ['ls', '--omit=dev', '--all', '--json'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  if (listing.error || ![0, 1].includes(listing.status)) throw new Error('npm ls failed to return a complete report');
  let tree;
  try { tree = JSON.parse(listing.stdout); } catch { throw new Error('npm ls returned invalid JSON'); }
  const shipped = shippedPaths(tree, Object.values(acceptedWithoutRepair).map(entry => entry.package));
  const result = assessDependencyAudit(report, verified, { shipped });
  result.shippedPaths = shipped;
  if (reportDirectory) {
    const directory = resolve(reportDirectory);
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(resolve(directory, 'npm-audit-raw.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    writeFileSync(resolve(directory, 'backport-verification.json'), JSON.stringify({ verified, result }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return result;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--report-dir')) throw new Error('Usage: audit-dependencies.mjs [--report-dir NEW_DIRECTORY]');
  const result = auditDependencies(fileURLToPath(new URL('..', import.meta.url)), args[1]);
  console.log(JSON.stringify(result, null, 2));
  if (result.unresolved.length) process.exitCode = 1;
}
