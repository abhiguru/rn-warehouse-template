import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

const manifest = JSON.parse(readFileSync(new URL('./security-backports.json', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const parts = version => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unreviewed version format: ${version}`);
  return match.slice(1).map(Number);
};
const atLeast = (version, floor) => {
  const [a, b] = [parts(version), parts(floor)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
// A copy with no entry for its exact version is accepted only when the manifest
// exempts it: a release that already has the fix (`fromVersion`) or one exact
// version that is reviewed and deliberately left unrepaired (`version`).
const unaffected = (name, version) => (manifest.unaffected ?? []).some(entry => entry.package === name
  && (entry.version ? entry.version === version : atLeast(version, entry.fromVersion)));

export function backportSource(source, version, spec) {
  if (version !== spec.version) throw new Error(`Unreviewed ${spec.package} version`);
  if (hash(source) === spec.patchedSHA256) return source;
  if (hash(source) !== spec.originalSHA256) throw new Error(`Unreviewed ${spec.package}/${spec.file} contents`);
  let result = source;
  for (const edit of spec.edits) {
    if (result.split(edit.before).length - 1 !== edit.count) throw new Error('Backport anchor mismatch');
    result = result.replaceAll(edit.before, edit.after);
  }
  if (hash(result) !== spec.patchedSHA256) throw new Error('Backport output checksum mismatch');
  return result;
}

export function securityBackports(root, { verifyOnly = false } = {}) {
  root = realpathSync(root);
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json')));
  const changes = [];
  const patched = new Set(manifest.files.map(file => file.package));
  // A package that only has an `unaffected` entry is still checked: a copy below its
  // fixed version has no repair here and must be refused, not skipped.
  for (const name of new Set([...patched, ...(manifest.unaffected ?? []).map(entry => entry.package)])) {
    const paths = Object.keys(lock.packages).filter(path => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    if (!paths.length && !patched.has(name)) continue;
    if (!paths.length) throw new Error(`Expected ${name} dependency missing; review obsolete backport`);
    for (const path of paths) {
      if (!path.startsWith('node_modules/') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid dependency path');
      const directory = resolve(root, path);
      if (realpathSync(directory) !== directory) throw new Error('Symlink dependency refused');
      const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json')));
      if (pkg.name !== name || pkg.version !== lock.packages[path].version) throw new Error('Dependency identity mismatch');
      const specs = manifest.files.filter(file => file.package === name && file.version === pkg.version);
      if (!specs.length && !unaffected(name, pkg.version)) throw new Error(`Unreviewed ${name} version ${pkg.version}; review the backport`);
      for (const spec of specs) {
        const target = resolve(directory, spec.file);
        if (realpathSync(target) !== target) throw new Error('Symlink backport target refused');
        const source = readFileSync(target, 'utf8');
        const result = backportSource(source, pkg.version, spec);
        if (verifyOnly && source !== result) throw new Error(`Required security backport absent: ${name}/${spec.file}`);
        changes.push({ target, source, result, package: name, version: pkg.version, file: spec.file, installedPath: path });
      }
    }
  }
  // Validate every installed copy before changing any dependency source.
  for (const change of changes) if (change.source !== change.result) writeFileSync(change.target, change.result);
  return changes.map(({ package: name, version, file, installedPath, result }) => ({ package: name, version, file, installedPath, sha256: hash(result) }));
}

if (isMain(import.meta.url)) {
  const verification = securityBackports(fileURLToPath(new URL('..', import.meta.url)), { verifyOnly: process.argv.includes('--verify') });
  console.log(JSON.stringify({ status: 'VERIFIED_LOCAL_BACKPORTS', rawAuditUnchanged: true, files: verification }, null, 2));
}
