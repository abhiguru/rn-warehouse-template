import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

// Reviewed @expo/cli release and the SHA-256 of its unpatched runServer-fork.js.
// 58.1.18 (with expo 58.0.22, SDK 58; its runServer-fork.js is byte-identical to 58.1.17's), reviewed against 57.0.32: the diff is build output only
// (optional chaining `a?.b` / `cb?.(err)` instead of the down-levelled `a == null ? void 0 : a.b`
// form, and a trailing newline). The `httpServer.listen(config.server.port, host, ()=>{` line the
// adapter rewrites is unchanged and occurs once, so the USB loopback adapter applies as before.
const reviewedVersion = '58.1.18';
const reviewedHash = '97c33e706e8faf610c36be206c54d443db24dd44b20bdcbd93c458b9da3f3c5e';
const oldBinding = 'httpServer.listen(config.server.port, host, ()=>{';
const usbBinding = "httpServer.listen(config.server.port, process.env.WAREHOUSE_USB_METRO === '1' ? '127.0.0.1' : host, ()=>{";
export function adaptBinding(source, version) {
  const original = source.replace(usbBinding, oldBinding);
  if (version !== reviewedVersion || createHash('sha256').update(original).digest('hex') !== reviewedHash) {
    throw new Error('Unreviewed Expo server binding; review the USB loopback adapter.');
  }
  return original.replace(oldBinding, usbBinding);
}
// verifyOnly changes nothing and fails when the adapter is not in place (an
// install that skipped the postinstall script).
export function patchExpoMetro(root, { verifyOnly = false } = {}) {
  const fromExpo = createRequire(resolve(root, 'node_modules/expo/package.json'));
  const cli = dirname(fromExpo.resolve('@expo/cli/package.json'));
  const version = JSON.parse(readFileSync(resolve(cli, 'package.json'), 'utf8')).version;
  const target = resolve(cli, 'build/src/start/server/metro/runServer-fork.js');
  const source = readFileSync(target, 'utf8');
  const patched = adaptBinding(source, version);
  if (verifyOnly) {
    if (source !== patched) throw new Error('Required Expo CLI USB loopback adapter absent');
    return;
  }
  if (source !== patched) writeFileSync(target, patched);
  console.log(`Verified Expo CLI ${version} USB loopback binding.`);
}
if (isMain(import.meta.url)) patchExpoMetro(fileURLToPath(new URL('..', import.meta.url)));
