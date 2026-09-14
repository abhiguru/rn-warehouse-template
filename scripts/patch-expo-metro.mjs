import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hashes = {
  'waitForMetroToObserveTypeScriptFile.js': 'aed7e130a2c8bb5e6bc4a89f525086c368a4ed73cf1c4d2dc1318ada8622c570',
  'metroWatchTypeScriptFiles.js': '219f8d99e0717a3884958045d1d5cba7f3e87efc935798e4685e522219d329ba',
};
const oldListener = 'const listener = ({ eventsQueue })=>{';
const newListener = 'const listener = (change)=>{\n        const eventsQueue = warehouseExpoEvents(change);';
const helper = `
// SDK 54 adapter for the reviewed Metro 0.83.8 change event.
function warehouseExpoEvents(event) {
    if (Array.isArray(event.eventsQueue)) return event.eventsQueue;
    const events = [];
    for (const [group, type] of [['addedFiles', 'add'], ['modifiedFiles', 'change'], ['removedFiles', 'delete']]) {
        for (const [relativePath, metadata] of event.changes[group]) {
            events.push({ type, filePath: require('node:path').join(event.rootDir, relativePath), metadata });
        }
    }
    return events;
}
`;
export function adaptWatcher(source, filename, version) {
  const original = source.replace(helper, '').replaceAll(newListener, oldListener);
  if (version !== '54.0.27' || createHash('sha256').update(original).digest('hex') !== hashes[filename]) {
    throw new Error(`Unreviewed Expo watcher contents/version: ${filename}. Review the Metro compatibility adapter.`);
  }
  return original.replaceAll(oldListener, newListener) + helper;
}
export function patchExpoMetro(root) {
  const fromExpo = createRequire(resolve(root, 'node_modules/expo/package.json'));
  const cli = dirname(fromExpo.resolve('@expo/cli/package.json'));
  const version = JSON.parse(readFileSync(resolve(cli, 'package.json'), 'utf8')).version;
  const metroVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/metro-file-map/package.json'), 'utf8')).version;
  if (metroVersion !== '0.83.8') throw new Error('Unreviewed Metro file-map version; review the Expo watcher adapter.');
  const changes = Object.keys(hashes).map(filename => {
    const target = resolve(cli, 'build/src/start/server/metro', filename);
    const source = readFileSync(target, 'utf8');
    return { target, source, patched: adaptWatcher(source, filename, version) };
  });
  for (const change of changes) if (change.source !== change.patched) writeFileSync(change.target, change.patched);
  console.log('Verified Expo SDK 54 watcher compatibility with Metro 0.83.8.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) patchExpoMetro(fileURLToPath(new URL('..', import.meta.url)));
