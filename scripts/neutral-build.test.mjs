import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { after } from 'node:test';

// WH-141: the repository's build is neutral (Cold Storage, Orange) and carries no association brand; a brand pack
// outside the repository adds one at build time, through app.config.js. The first test is the spec's acceptance 1
// as a search; the others are acceptance 2, 3 and 6 for the build configuration.
const root = new URL('..', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const SKIP = new Set(['node_modules', '.git', 'android', 'ios', 'dist', 'coverage', '.expo', 'package-lock.json']);

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
// The words are built from pieces, and the colours are written backwards, so that this file itself is not a hit (the navy and grey of the old association brand).
const WORDS = [new RegExp(['gc', 'sa'].join(''), 'i'), new RegExp(['gujarat cold storage ', 'association'].join(''), 'i')];
const COLOURS = ['2913E2#', '0F0AD9#', '978262#', '06F1E1#', '747161#', 'F45232#', '6603D2#', 'AFFEEE#', '2F7D6D#', '8E5B3B#', '6D5717#', 'FBE4A4#', 'CA9A7A#', '36F5C5#'].map(colour => [...colour].reverse().join(''));

test('the repository holds no association name and none of the association colours (source, tests, docs, assets)', () => {
  const self = new URL(import.meta.url).pathname;
  const hits = [];
  let scanned = 0;
  for (const file of files(root)) {
    if (file === self || /\.(png|jpe?g|ttf|otf|ico|webp|keystore|jks)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    scanned += 1;
    for (const word of WORDS) if (word.test(text)) hits.push(`${relative(root, file)}: ${word}`);
    for (const colour of COLOURS) if (text.toUpperCase().includes(colour.toUpperCase())) hits.push(`${relative(root, file)}: ${colour}`);
  }
  assert.ok(scanned > 300, `the repository was read (${scanned} files)`);
  assert.deepEqual(hits, []);
});

const scratch = mkdtempSync(join(tmpdir(), 'brand-pack-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const samplePack = JSON.parse(readFileSync(join(root, 'brand-packs/sample-teal/brand.json'), 'utf8'));
let counter = 0;
function packDir(change) {
  const dir = join(scratch, `pack-${counter++}`);
  const pack = JSON.parse(JSON.stringify(samplePack));
  change?.(pack);
  require('node:fs').mkdirSync(dir);
  writeFileSync(join(dir, 'brand.json'), JSON.stringify(pack));
  return dir;
}

const KEYS = ['WAREHOUSE_BRAND_PACK', 'EXPO_PUBLIC_LEGAL_TEXT'];
function appConfig(env = {}) {
  const saved = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return require('../app.config.js')({ config: { name: 'Warehouse Manager', extra: { eas: { projectId: 'x' } }, android: {} } });
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('app.config.js, no pack: the build carries no brand pack and keeps the config\'s own extra', () => {
  const config = appConfig();
  assert.equal(config.extra.brandPack, undefined);
  assert.deepEqual(config.extra.eas, { projectId: 'x' });
});

test('app.config.js, the sample pack: the pack reaches the app through extra.brandPack', () => {
  const config = appConfig({ WAREHOUSE_BRAND_PACK: join(root, 'brand-packs/sample-teal') });
  assert.equal(config.extra.brandPack.id, 'sample-teal');
  assert.deepEqual(config.extra.brandPack.wordmark, ['SAMPLE']);
  assert.deepEqual(config.extra.eas, { projectId: 'x' });
});

test('app.config.js stops the build, naming the problem, for a pack with a missing token, a failing contrast, a bad id or no file', () => {
  const stops = (dir, message) => assert.throws(() => appConfig({ WAREHOUSE_BRAND_PACK: dir }), message);
  stops(packDir(pack => delete pack.dark.tint), /WAREHOUSE_BRAND_PACK: dark\.tint is missing or not a #RRGGBB colour/);
  stops(packDir(pack => delete pack.light), /the light token set is missing/);
  stops(packDir(pack => (pack.light.fill = 'teal')), /light\.fill is missing or not a #RRGGBB colour/);
  stops(packDir(pack => (pack.light.tint = '#CCCCCC')), /light\.tint on the page is [\d.]+:1, needs 4\.5:1/);
  stops(packDir(pack => (pack.dark.onFill = '#4DB6AC')), /dark\.onFill on fill is [\d.]+:1, needs 4\.5:1/);
  stops(packDir(pack => (pack.id = 'orange')), /id must be lowercase letters, digits and dashes, and not "orange"/);
  stops(packDir(pack => (pack.wordmark = [])), /wordmark must be a list of one or more lines/);
  stops(join(scratch, 'nothing-here'), /cannot read .*brand\.json/);
});

test('the association legal text needs a pack that names the association', () => {
  const sample = join(root, 'brand-packs/sample-teal');
  assert.throws(() => appConfig({ EXPO_PUBLIC_LEGAL_TEXT: 'association' }), /needs a brand pack whose brand\.json names the association/);
  assert.throws(() => appConfig({ EXPO_PUBLIC_LEGAL_TEXT: 'association', WAREHOUSE_BRAND_PACK: sample }), /names the association/);
  const named = packDir(pack => (pack.association = { name: 'Sample Cold Storage Association' }));
  assert.equal(appConfig({ EXPO_PUBLIC_LEGAL_TEXT: 'association', WAREHOUSE_BRAND_PACK: named }).extra.brandPack.association.name, 'Sample Cold Storage Association');
  assert.doesNotThrow(() => appConfig({ EXPO_PUBLIC_LEGAL_TEXT: 'template' }));
});

test('the sample pack is fictional and marked as a sample, and names no association', () => {
  assert.match(samplePack._sample, /fictional/i);
  assert.equal(samplePack.association, undefined);
});
