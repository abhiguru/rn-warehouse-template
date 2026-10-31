import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';
import { backportSource } from './patch-security-backports.mjs';

// The calendar pop-up of react-native-paper-dates draws its own dates with Intl, so
// it would show "Oct 9" and "10/09/2026" while the rest of the app writes 09/10/26
// (style guide 12.3). paper-dates-patch.json holds the reviewed edits of three source
// files of 0.24.1 (the files Metro reads through the package's "react-native" field),
// each pinned by the SHA-256 of the original and of the result, as the security
// backports are. A different version or different file contents are refused, so an
// upgrade of the library has to be reviewed against this patch.
const specs = JSON.parse(readFileSync(new URL('./paper-dates-patch.json', import.meta.url), 'utf8'));

// verifyOnly changes nothing and fails when the patch is not in place (an install
// that skipped the postinstall script).
export function patchPaperDates(root, { verifyOnly = false } = {}) {
  root = realpathSync(root);
  const directory = resolve(root, 'node_modules/react-native-paper-dates');
  if (realpathSync(directory) !== directory) throw new Error('Symlink dependency refused');
  const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  if (pkg.name !== 'react-native-paper-dates') throw new Error('Dependency identity mismatch');
  const changes = specs.map(spec => {
    const target = resolve(directory, spec.file);
    if (realpathSync(target) !== target) throw new Error('Symlink patch target refused');
    const source = readFileSync(target, 'utf8');
    const result = backportSource(source, pkg.version, spec);
    if (verifyOnly && source !== result) throw new Error(`Required calendar date patch absent: ${spec.file}`);
    return { target, source, result };
  });
  // Validate every file before changing any of them.
  for (const change of changes) if (change.source !== change.result) writeFileSync(change.target, change.result);
  if (!verifyOnly) console.log(`Verified react-native-paper-dates ${pkg.version} DD/MM/YY calendar patch.`);
}

if (isMain(import.meta.url)) patchPaperDates(fileURLToPath(new URL('..', import.meta.url)), { verifyOnly: process.argv.includes('--verify') });
