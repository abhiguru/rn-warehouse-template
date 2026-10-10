import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptBinding } from './patch-expo-metro.mjs';
const folder = '../node_modules/expo/node_modules/@expo/cli/build/src/start/server/metro/';

test('USB Metro binding adapter is explicit loopback, idempotent, and version checked', () => {
  const source = readFileSync(new URL(folder + 'runServer-fork.js', import.meta.url), 'utf8');
  assert.equal(adaptBinding(source, '57.0.28'), source);
  assert.ok(source.includes("process.env.WAREHOUSE_USB_METRO === '1' ? '127.0.0.1' : host"));
  assert.throws(() => adaptBinding(source, '58.0.0'), /Unreviewed/);
  assert.throws(() => adaptBinding(source + '\n', '57.0.28'), /Unreviewed/);
});
