import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityBackports } from './patch-security-backports.mjs';
import { isMain } from './is-main.mjs';

const repairs = {
  'GHSA-86w9-cpqp-85rv': { package: 'node-forge', range: '<=1.4.0' },
  'GHSA-vfj7-8cjw-p6xm': { package: 'braces', range: '<=3.0.3' },
  'GHSA-hp3w-g68c-fv3c': { package: 'sprintf-js', range: '<=1.1.3' },
};
const high = new Set(['high', 'critical']);

// npm's registry report describes published tarballs. Retain that report and
// require the installed source repair for every affected copy and graph path.
export function assessDependencyAudit(report, verified) {
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
      const repair = repairs[id];
      if (!repair || reason.url !== `https://github.com/advisories/${id}` || name !== repair.package || reason.name !== repair.package || reason.range.replaceAll(' ', '') !== repair.range) {
        reasons.add(`UNREPAIRED:${reason.url}`);
        continue;
      }
      const installedPaths = new Set(verified.filter(file => file.package === name).map(file => file.installedPath));
      if (!entry.nodes.length || entry.nodes.length !== installedPaths.size || entry.nodes.some(path => !installedPaths.has(path))) {
        throw new Error('Audit nodes do not match every verified installed dependency');
      }
      reasons.add(id);
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
  for (const [name, entry] of entries) {
    if (!high.has(entry.severity)) continue;
    const reasons = [...roots.get(name)];
    if (!reasons.length || reasons.some(reason => reason.startsWith('UNREPAIRED:'))) unresolved.push({ package: name, reasons });
    else covered.push({ package: name, advisories: reasons.sort() });
  }
  const reportedHigh = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
  if (!Number.isInteger(reportedHigh) || reportedHigh !== covered.length + unresolved.length) throw new Error('Audit severity counts do not reconcile');
  return { status: unresolved.length ? 'FAIL_UNREPAIRED_DEPENDENCIES' : covered.length ? 'PASS_WITH_VERIFIED_BACKPORTS' : 'PASS', rawHighOrCritical: reportedHigh, covered, unresolved };
}

export function auditDependencies(root, reportDirectory) {
  const verified = securityBackports(root, { verifyOnly: true });
  const run = spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (run.error || ![0, 1].includes(run.status)) throw new Error('npm audit failed to return a complete report');
  let report;
  try { report = JSON.parse(run.stdout); } catch { throw new Error('npm audit returned invalid JSON'); }
  const result = assessDependencyAudit(report, verified);
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
