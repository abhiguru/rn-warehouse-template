import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';
import { backportSource } from './patch-security-backports.mjs';

// The calendar pop-up of react-native-paper-dates draws its own dates with Intl, so
// it would show "Oct 9" and "10/09/2026" while the rest of the app writes 09/10/26
// (style guide 12.3). paper-dates-patch.json holds the reviewed edits of 0.24.1: the
// three source files Metro reads for iOS and Android (the package's "react-native"
// field) and the compiled copies of the same three files that web (lib/module) and
// Jest or Node (lib/commonjs) read. Each file is pinned by the SHA-256 of the original
// and of the result, as the security backports are. A different version or different
// file contents are refused, so an upgrade of the library has to be reviewed against
// this patch. Every copy of the package in package-lock.json is patched and checked,
// and a copy that no patch covers is refused.
const specs = JSON.parse(readFileSync(new URL('./paper-dates-patch.json', import.meta.url), 'utf8'));
const NAME = 'react-native-paper-dates';

// verifyOnly changes nothing and fails when the patch is not in place (an install
// that skipped the postinstall script).
export function patchPaperDates(root, { verifyOnly = false } = {}) {
  root = realpathSync(root);
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const paths = Object.keys(lock.packages).filter(path => path === `node_modules/${NAME}` || path.endsWith(`/node_modules/${NAME}`));
  if (!paths.length) throw new Error(`Expected ${NAME} dependency missing; review obsolete calendar patch`);
  const changes = [];
  for (const path of paths) {
    if (!path.startsWith('node_modules/') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid dependency path');
    const directory = resolve(root, path);
    if (realpathSync(directory) !== directory) throw new Error('Symlink dependency refused');
    const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    if (pkg.name !== NAME || pkg.version !== lock.packages[path].version) throw new Error('Dependency identity mismatch');
    const own = specs.filter(spec => spec.version === pkg.version);
    if (!own.length) throw new Error(`Unreviewed ${NAME} version ${pkg.version}; review the calendar patch`);
    for (const spec of own) {
      const target = resolve(directory, spec.file);
      if (realpathSync(target) !== target) throw new Error('Symlink patch target refused');
      const source = readFileSync(target, 'utf8');
      const result = backportSource(source, pkg.version, spec);
      if (verifyOnly && source !== result) throw new Error(`Required calendar date patch absent: ${path}/${spec.file}`);
      changes.push({ target, source, result, version: pkg.version });
    }
  }
  // Validate every file before changing any of them.
  for (const change of changes) if (change.source !== change.result) writeFileSync(change.target, change.result);
  if (!verifyOnly) console.log(`Verified ${NAME} ${changes[0].version} DD/MM/YY calendar patch (${paths.length} package copies, ${changes.length} files).`);
}

if (isMain(import.meta.url)) patchPaperDates(fileURLToPath(new URL('..', import.meta.url)), { verifyOnly: process.argv.includes('--verify') });
