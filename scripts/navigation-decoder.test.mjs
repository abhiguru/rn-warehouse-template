import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { adapt, patch } from './patch-navigation-decoder.mjs';
const require = createRequire(import.meta.url);
const query = require('query-string');

test('decoder adapter is idempotent and fails closed on changed contents or versions', () => {
  const source = readFileSync(require.resolve('query-string'), 'utf8');
  assert.equal(adapt(source, '7.1.3'), source);
  assert.throws(() => adapt(source + '\n// unreviewed', '7.1.3'), /Unreviewed/);
  assert.throws(() => adapt(source, '8.0.0'), /Unreviewed/);
});

test('query-string preserves parsing/stringifying, arrays, Unicode, plus and malformed input', () => {
  assert.deepEqual({ ...query.parse('q=cold+store&name=%E0%A4%86&tag=a&tag=b&empty=&flag') }, { q: 'cold store', name: 'आ', tag: ['a', 'b'], empty: '', flag: null });
  assert.equal(query.stringify({ q: 'cold store', name: 'आ' }), 'name=%E0%A4%86&q=cold%20store');
  assert.doesNotThrow(() => query.parse('q=%E0%A4%A&x=%&y=%FF%FF'));
  const started = performance.now();
  assert.doesNotThrow(() => query.parse(`q=${'%C0'.repeat(20000)}%`));
  assert.ok(performance.now() - started < 1500, 'malformed decoding is bounded');
});

test('actual React Navigation linking consumer decodes and round-trips queries', async () => {
  // Expo Router 57 ships React Navigation's linking code inside expo-router.
  const { getStateFromPath } = require('expo-router/build/react-navigation/core/getStateFromPath.js');
  const { getPathFromState } = require('expo-router/build/react-navigation/core/getPathFromState.js');
  const config = { screens: { Stock: 'stock' } };
  const state = getStateFromPath('/stock?search=cold+store&mark=%E0%A4%86', config);
  assert.equal(state.routes[0].params.search, 'cold store');
  assert.equal(state.routes[0].params.mark, 'आ');
  assert.equal(getStateFromPath(getPathFromState(state, config), config).routes[0].params.mark, 'आ');
  assert.doesNotThrow(() => getStateFromPath('/stock?search=%E0%A4%A%FF', config));
});

// A fixture project: a lockfile that lists (or does not list) query-string, and the real reviewed package files.
function project(t, { withQueryString }) {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-decoder-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packages = { '': {} };
  if (withQueryString) {
    packages['node_modules/query-string'] = { version: '7.1.3' };
    for (const name of ['query-string', 'decode-uri-component']) {
      cpSync(join(dirname(require.resolve('query-string')), name === 'query-string' ? '.' : '../decode-uri-component'), join(root, 'node_modules', name), { recursive: true });
    }
    // Start from the unpatched upstream file, as after `npm ci --ignore-scripts`.
    const target = join(root, 'node_modules/query-string/index.js');
    const adapted = readFileSync(target, 'utf8');
    const original = adapted.replace(
      "const decodeComponentModule = require('decode-uri-component');\nconst decodeComponent = typeof decodeComponentModule === 'function' ? decodeComponentModule : decodeComponentModule.default;",
      "const decodeComponent = require('decode-uri-component');",
    );
    writeFileSync(target, original);
  }
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  return root;
}

function captured(fn) {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.log = log; }
  return lines;
}

test('a lockfile without query-string retires the adapter: exit 0 with the removal message, in patch and verify mode', t => {
  const root = project(t, { withQueryString: false });
  for (const options of [{}, { verifyOnly: true }]) {
    const lines = captured(() => patch(root, options));
    assert.deepEqual(lines, ['patch-navigation-decoder: no query-string consumer in package-lock.json; this adapter is obsolete and should be removed']);
  }
});

test('a lockfile with query-string is still patched, and verify mode fails until it is', t => {
  const root = project(t, { withQueryString: true });
  const target = join(root, 'node_modules/query-string/index.js');
  assert.throws(() => patch(root, { verifyOnly: true }), /adapter absent/);
  captured(() => patch(root));
  assert.match(readFileSync(target, 'utf8'), /decodeComponentModule\.default/);
  assert.doesNotThrow(() => patch(root, { verifyOnly: true }));
});
