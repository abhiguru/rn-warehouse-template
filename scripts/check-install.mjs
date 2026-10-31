import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';
import { patchExpoMetro } from './patch-expo-metro.mjs';
import { patchPaperDates } from './patch-paper-dates.mjs';
import { securityBackports } from './patch-security-backports.mjs';

// The USB loopback binding, the security backports and the DD/MM/YY calendar patch are applied by the npm
// postinstall script only. An install with scripts turned off
// (`npm ci --ignore-scripts`, or `ignore-scripts=true` in a user's .npmrc)
// leaves node_modules as published and reports nothing. This check reads the
// installed files, changes none of them, and runs before start, android, ios,
// web and test.
export function checkInstall(root) {
  patchExpoMetro(root, { verifyOnly: true });
  securityBackports(root, { verifyOnly: true });
  patchPaperDates(root, { verifyOnly: true });
}

if (isMain(import.meta.url)) {
  try {
    checkInstall(fileURLToPath(new URL('..', import.meta.url)));
  } catch (error) {
    console.error(`node_modules is not the patched tree this project needs: ${error instanceof Error ? error.message : 'unreadable install'}.`);
    console.error('This happens when npm ran with scripts turned off. Run `npm run postinstall`, or `npm ci` without --ignore-scripts.');
    process.exitCode = 1;
  }
}
