import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

// Reviewed @expo/cli release and the SHA-256 of its unpatched runServer-fork.js.
const reviewedVersion = '57.0.28';
const reviewedHash = '72177ad9dc279383f6970348550ec0f380bb2d5cf14b96dec690b2efcc2fc4e2';
const oldBinding = 'httpServer.listen(config.server.port, host, ()=>{';
const usbBinding = "httpServer.listen(config.server.port, process.env.WAREHOUSE_USB_METRO === '1' ? '127.0.0.1' : host, ()=>{";
export function adaptBinding(source, version) {
  const original = source.replace(usbBinding, oldBinding);
  if (version !== reviewedVersion || createHash('sha256').update(original).digest('hex') !== reviewedHash) {
    throw new Error('Unreviewed Expo server binding; review the USB loopback adapter.');
  }
  return original.replace(oldBinding, usbBinding);
}
export function patchExpoMetro(root) {
  const fromExpo = createRequire(resolve(root, 'node_modules/expo/package.json'));
  const cli = dirname(fromExpo.resolve('@expo/cli/package.json'));
  const version = JSON.parse(readFileSync(resolve(cli, 'package.json'), 'utf8')).version;
  const target = resolve(cli, 'build/src/start/server/metro/runServer-fork.js');
  const source = readFileSync(target, 'utf8');
  const patched = adaptBinding(source, version);
  if (source !== patched) writeFileSync(target, patched);
  console.log(`Verified Expo CLI ${version} USB loopback binding.`);
}
if (isMain(import.meta.url)) patchExpoMetro(fileURLToPath(new URL('..', import.meta.url)));
