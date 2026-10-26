// WS-L, owner decision 2026-10-26 (amends D24): Android allows cleartext for the warehouse network
// fallback through a network security config. Android cannot name an address range, so the config
// permits cleartext in its base-config and the app limits it to private addresses
// (src/config/lanAddress.ts, guarded by src/config/__tests__/lanCallSites.test.ts). These tests pin what
// the config says and that it is written without a new dependency.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-android-lan-cleartext.js');
const { AndroidConfig, XML } = require('@expo/config-plugins');
const base = require('../app.json').expo;
const configure = require('../app.config.js');
const pkg = require('../package.json');
const parseStringPromise = XML.parseXMLAsync;

const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <application android:name=".MainApplication" android:allowBackup="false" android:usesCleartextTraffic="true">
    <activity android:name=".MainActivity"/>
  </application>
</manifest>`;

test('the config permits cleartext in its base-config and nowhere narrower or wider', async () => {
  const parsed = await parseStringPromise(plugin.NETWORK_SECURITY_CONFIG_XML);
  const root = parsed['network-security-config'];
  assert.deepEqual(Object.keys(root).filter(key => key !== '$'), ['base-config']);
  assert.equal(root['base-config'].length, 1);
  assert.equal(root['base-config'][0].$.cleartextTrafficPermitted, 'true');
  // No domain-config (Android cannot express an address range, and a facility's address is not known at build time).
  assert.equal(root['domain-config'], undefined);
  assert.equal(root['debug-overrides'], undefined);
});

test('trust anchors stay the system ones: no user-installed and no bundled certificate', async () => {
  const parsed = await parseStringPromise(plugin.NETWORK_SECURITY_CONFIG_XML);
  const anchors = parsed['network-security-config']['base-config'][0]['trust-anchors'];
  assert.equal(anchors.length, 1);
  assert.deepEqual(anchors[0].certificates.map(entry => entry.$.src), ['system']);
  assert.doesNotMatch(plugin.NETWORK_SECURITY_CONFIG_XML, /src="user"|src="@raw/);
});

test('the config says why it is wide and where the limit is', () => {
  assert.match(plugin.NETWORK_SECURITY_CONFIG_XML, /cannot limit cleartext to an address range/);
  assert.match(plugin.NETWORK_SECURITY_CONFIG_XML, /src\/config\/lanAddress\.ts/);
});

test('the manifest points the application at the config, and the blanket flag is gone', async () => {
  const manifest = await XML.parseXMLAsync(MANIFEST);
  plugin.setNetworkSecurityConfig(manifest);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  assert.equal(application.$['android:networkSecurityConfig'], '@xml/network_security_config');
  assert.equal(application.$['android:usesCleartextTraffic'], undefined);
  // The rest of the application element stays.
  assert.equal(application.$['android:allowBackup'], 'false');
  assert.equal(application.$['android:name'], '.MainApplication');
  assert.equal(application.activity.length, 1);
});

test('applied twice it says the same', async () => {
  const manifest = await XML.parseXMLAsync(MANIFEST);
  plugin.setNetworkSecurityConfig(plugin.setNetworkSecurityConfig(manifest));
  const xml = XML.format(manifest);
  assert.equal(xml.match(/android:networkSecurityConfig/g).length, 1);
});

test('the config file is written under the generated android project, and again over itself', () => {
  const directory = mkdtempSync(join(tmpdir(), 'android-nsc-'));
  try {
    const file = plugin.writeNetworkSecurityConfig(directory);
    assert.equal(file, join(directory, 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml'));
    assert.equal(readFileSync(file, 'utf8'), plugin.NETWORK_SECURITY_CONFIG_XML);
    plugin.writeNetworkSecurityConfig(directory);
    assert.equal(readFileSync(file, 'utf8'), plugin.NETWORK_SECURITY_CONFIG_XML);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the plugin registers a manifest mod and a file mod for Android only', () => {
  const configured = plugin({ name: 'x', slug: 'x' });
  assert.equal(typeof configured.mods?.android?.manifest, 'function');
  assert.equal(typeof configured.mods?.android?.dangerous, 'function');
  assert.equal(configured.mods?.ios, undefined);
});

test('app.json runs the plugin, so does app.config.js, and no dependency was added for it', () => {
  assert.ok(base.plugins.includes('./plugins/with-android-lan-cleartext'));
  assert.ok(configure({ config: base }).plugins.includes('./plugins/with-android-lan-cleartext'));
  for (const name of ['expo-build-properties', 'react-native-network-security-config'])
    assert.equal(pkg.dependencies[name] ?? pkg.devDependencies[name], undefined, name);
  // The plugin needs only what Expo already brings.
  assert.deepEqual(
    [...readFileSync(new URL('../plugins/with-android-lan-cleartext.js', import.meta.url), 'utf8').matchAll(/require\('([^']+)'\)/g)].map(match => match[1]).sort(),
    ['@expo/config-plugins', 'fs', 'path']
  );
});

test('app.json does not set the blanket cleartext flag for Android', () => {
  assert.equal(base.android.usesCleartextTraffic, undefined);
});
