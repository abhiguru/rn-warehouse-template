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

// WH-105: @sentry/react-native names expo-updates as an optional peer, so an entry left in the lockfile is still
// installed by `npm ci`. Its JS then loads without its native module, which autolinking no longer links.
test('expo-updates is not installed either: the lockfile has no entry for it or for its own packages', () => {
  const lock = read('package-lock.json');
  const gone = ['expo-updates', 'expo-updates-interface', 'expo-manifests', 'expo-eas-client', 'expo-structured-headers', 'expo-json-utils'];
  const left = Object.keys(lock.packages ?? {}).filter(path => gone.some(name => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)));
  assert.deepEqual(left, []);
  assert.ok(Object.keys(lock.packages ?? {}).length > 500, 'the lockfile was read');
});

// WH-380: a build profile that names a channel without expo-updates is a setting that does nothing, and EAS warns about it.
test('no eas.json build profile names a channel while expo-updates is not a dependency', () => {
  const pkg = read('package.json');
  const hasUpdates = ['dependencies', 'devDependencies', 'optionalDependencies'].some(section => pkg[section]?.['expo-updates'] !== undefined);
  const profiles = read('eas.json').build ?? {};
  assert.ok(Object.keys(profiles).length > 0, 'eas.json was read');
  const withChannel = Object.entries(profiles).filter(([, profile]) => profile.channel !== undefined).map(([name]) => name);
  if (!hasUpdates) assert.deepEqual(withChannel, [], 'build profiles with a channel but no expo-updates');
});
