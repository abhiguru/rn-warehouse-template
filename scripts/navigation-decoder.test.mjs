import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { adapt } from './patch-navigation-decoder.mjs';
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
  const { getStateFromPath } = await import('../node_modules/@react-navigation/core/lib/module/getStateFromPath.js');
  const { getPathFromState } = await import('../node_modules/@react-navigation/core/lib/module/getPathFromState.js');
  const config = { screens: { Stock: 'stock' } };
  const state = getStateFromPath('/stock?search=cold+store&mark=%E0%A4%86', config);
  assert.equal(state.routes[0].params.search, 'cold store');
  assert.equal(state.routes[0].params.mark, 'आ');
  assert.equal(getStateFromPath(getPathFromState(state, config), config).routes[0].params.mark, 'आ');
  assert.doesNotThrow(() => getStateFromPath('/stock?search=%E0%A4%A%FF', config));
});
