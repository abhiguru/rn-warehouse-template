import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const { AndroidConfig } = require('expo/config-plugins');
const base = require('../app.json').expo;

const PERMISSION = 'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE';
const TOOLS = 'http://schemas.android.com/tools';

/** A manifest as prebuild reads it: no tools namespace, a few permissions of the app's own. */
const sample = () => ({
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    'uses-permission': [
      { $: { 'android:name': 'android.permission.CAMERA' } },
      { $: { 'android:name': 'android.permission.INTERNET' } },
    ],
    application: [{ $: { 'android:name': '.MainApplication' } }],
  },
});

const removals = manifest =>
  manifest.manifest['uses-permission'].filter(permission => permission.$['android:name'] === PERMISSION);

test('the plugin removes the Play install-referrer permission from the merged manifest', () => {
  assert.equal(configure.INSTALL_REFERRER_PERMISSION, PERMISSION);
  const manifest = configure.removeInstallReferrerPermission(sample());
  assert.equal(manifest.manifest.$['xmlns:tools'], TOOLS);
  assert.deepEqual(removals(manifest), [{ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } }]);
  // The app's own permissions stay, and the manifest still parses as Expo reads it.
  assert.deepEqual(AndroidConfig.Permissions.getPermissions(manifest).filter(name => name !== PERMISSION), [
    'android.permission.CAMERA',
    'android.permission.INTERNET',
  ]);
  assert.equal(manifest.manifest.$['xmlns:android'], 'http://schemas.android.com/apk/res/android');
});

test('applied twice, or over a manifest that already asks for it, there is exactly one removal', () => {
  const asked = sample();
  asked.manifest.$['xmlns:tools'] = TOOLS;
  asked.manifest['uses-permission'].push({ $: { 'android:name': PERMISSION } });
  const once = configure.removeInstallReferrerPermission(asked);
  const twice = configure.removeInstallReferrerPermission(once);
  assert.deepEqual(removals(twice), [{ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } }]);
  assert.equal(twice.manifest.$['xmlns:tools'], TOOLS);
});

test('app.config.js runs the plugin after every plugin of app.json, with or without a test identity', () => {
  const plugins = configure({ config: base }).plugins;
  assert.deepEqual(plugins.slice(0, -1), base.plugins);
  assert.equal(plugins.at(-1), configure.withoutInstallReferrerPermission);
  // As a config plugin it registers an Android manifest mod.
  const withMod = configure.withoutInstallReferrerPermission({ name: 'x', slug: 'x' });
  assert.equal(typeof withMod.mods?.android?.manifest, 'function');
});
