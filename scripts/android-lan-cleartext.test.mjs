// WS-L, owner decision 2026-10-26 (amends D24): Android allows cleartext for the warehouse network
// fallback through a network security config. Android cannot name an address range, so the config
// permits cleartext in its base-config and the app limits it to private addresses
// (src/config/lanAddress.ts, guarded by src/config/__tests__/lanCallSites.test.ts). These tests pin what
// the config says and that it is written without a new dependency.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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

// ---------------------------------------------------------------------------------------------------------
// Android 17 (WS-L review M3): an app that targets SDK 37 or higher needs the runtime permission
// ACCESS_LOCAL_NETWORK, or every connection to a private address times out and the fallback dies silently.
// The permission is declared now (harmless below 37). This guard fails on the day the target SDK reaches 37
// without a runtime request in `src/`.
// ---------------------------------------------------------------------------------------------------------

/** The failure message, or null when the target SDK is safe or the request is in place. */
function localNetworkGuard(targetSdk, requestInSource) {
  if (targetSdk < 37 || requestInSource) return null;
  return (
    `The app targets Android SDK ${targetSdk}. From SDK 37 an app needs the runtime permission ` +
    `ACCESS_LOCAL_NETWORK (group NEARBY_DEVICES) to reach a private address, so the warehouse network fallback ` +
    `would time out silently. Add the request (PermissionsAndroid.request, best asked from Help > Connection > ` +
    `Check now) before raising the target. See docs/RELEASE_PREPARATION.md.`
  );
}

/** The highest target SDK the project resolves: React Native's version catalogue, app.json and expo-build-properties. */
function resolvedTargetSdk() {
  const found = [];
  const catalogue = readFileSync(new URL('../node_modules/react-native/gradle/libs.versions.toml', import.meta.url), 'utf8');
  const fromCatalogue = /^targetSdk\s*=\s*"(\d+)"/m.exec(catalogue);
  if (fromCatalogue) found.push(Number(fromCatalogue[1]));
  const fromAndroid = Number(base.android?.targetSdkVersion);
  if (Number.isInteger(fromAndroid)) found.push(fromAndroid);
  for (const entry of base.plugins ?? []) {
    if (Array.isArray(entry) && entry[0] === 'expo-build-properties') {
      const fromPlugin = Number(entry[1]?.android?.targetSdkVersion);
      if (Number.isInteger(fromPlugin)) found.push(fromPlugin);
    }
  }
  return found.length ? Math.max(...found) : NaN;
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'tests' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function hasRuntimeRequest() {
  return sourceFiles(new URL('../src', import.meta.url).pathname).some(file => {
    const text = readFileSync(file, 'utf8');
    return /PermissionsAndroid\.request\(/.test(text) && text.includes('ACCESS_LOCAL_NETWORK');
  });
}

test('the manifest declares ACCESS_LOCAL_NETWORK, once, and the plugin applies it', async () => {
  const manifest = await XML.parseXMLAsync(MANIFEST);
  plugin.declareLocalNetworkPermission(plugin.declareLocalNetworkPermission(manifest));
  const names = (manifest.manifest['uses-permission'] ?? []).map(entry => entry.$['android:name']);
  assert.equal(names.filter(name => name === 'android.permission.ACCESS_LOCAL_NETWORK').length, 1);
  assert.ok(names.includes('android.permission.INTERNET'));
  assert.equal(plugin.LOCAL_NETWORK_PERMISSION, 'android.permission.ACCESS_LOCAL_NETWORK');
});

test('the guard can fail: SDK 37 or higher without the runtime request is refused', () => {
  assert.equal(localNetworkGuard(36, false), null);
  assert.equal(localNetworkGuard(37, true), null);
  assert.match(localNetworkGuard(37, false), /ACCESS_LOCAL_NETWORK/);
  assert.match(localNetworkGuard(38, false), /targets Android SDK 38/);
});

test('the target SDK is found, and below 37 or with the runtime request in place', () => {
  const targetSdk = resolvedTargetSdk();
  // A guard that cannot find the number would pass for ever.
  assert.ok(Number.isInteger(targetSdk) && targetSdk >= 34, `target SDK not found (${targetSdk})`);
  const message = localNetworkGuard(targetSdk, hasRuntimeRequest());
  assert.equal(message, null, message ?? undefined);
});
