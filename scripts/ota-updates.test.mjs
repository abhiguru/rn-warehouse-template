import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// WH-27 removed over-the-air updates: every change ships through the store.
// This guards that none of it comes back by accident.
const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

test('over-the-air updates stay removed: no updates block, no expo-updates dependency', () => {
  const { expo } = read('app.json');
  const pkg = read('package.json');
  assert.equal(expo.updates, undefined);
  assert.equal(expo.runtimeVersion, undefined);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'])
    assert.equal(pkg[section]?.['expo-updates'], undefined, `expo-updates must not be in ${section}`);
});
