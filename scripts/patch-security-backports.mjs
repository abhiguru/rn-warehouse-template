import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

const manifest = JSON.parse(readFileSync(new URL('./security-backports.json', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');

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
  for (const name of [...new Set(manifest.files.map(file => file.package))]) {
    const paths = Object.keys(lock.packages).filter(path => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    if (!paths.length) throw new Error(`Expected ${name} dependency missing; review obsolete backport`);
    for (const path of paths) {
      if (!path.startsWith('node_modules/') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid dependency path');
      const directory = resolve(root, path);
      if (realpathSync(directory) !== directory) throw new Error('Symlink dependency refused');
      const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json')));
      if (pkg.name !== name || pkg.version !== lock.packages[path].version) throw new Error('Dependency identity mismatch');
      for (const spec of manifest.files.filter(file => file.package === name)) {
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
