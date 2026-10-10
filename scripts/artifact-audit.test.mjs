import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPECTED_ANDROID_PERMISSIONS, validateEntries, validatePermissions, validateText } from './artifact-audit.mjs';

test('artifact paths reject credentials, databases, traversal and absolute paths', () => {
  assert.deepEqual(validateEntries(['assets/index.bundle', 'assets/expo-root.pem', 'res/font/MaterialIcons.ttf']), ['assets/index.bundle', 'assets/expo-root.pem', 'res/font/MaterialIcons.ttf']);
  for (const name of ['.env', 'assets/release.keystore', 'assets/offline.db', '../secret.txt', '/tmp/file']) {
    assert.throws(() => validateEntries([name]));
  }
});

test('artifact text rejects private keys, service-role env and workstation paths', () => {
  validateText('ordinary compiled application text');
  for (const value of ['-----BEGIN PRIVATE KEY-----', 'SUPABASE_SERVICE_ROLE_KEY=value', '/Users/alice/project', '/home/alice/workspace/project']) {
    assert.throws(() => validateText(value));
  }
});

test('Android permissions require camera and reject blocked media or SMS access', () => {
  const blocked = ['android.permission.RECORD_AUDIO', 'android.permission.READ_SMS'];
  assert.deepEqual(validatePermissions("uses-permission: name='android.permission.INTERNET'\nuses-permission: name='android.permission.CAMERA'", blocked), ['android.permission.CAMERA', 'android.permission.INTERNET']);
  assert.throws(() => validatePermissions("uses-permission: name='android.permission.CAMERA'\nuses-permission: name='android.permission.READ_SMS'", blocked));
  assert.throws(() => validatePermissions("uses-permission: name='android.permission.INTERNET'", blocked));
});

// What `aapt2 dump permissions` prints for the app today (debug build).
const expectedDump = [
  'package: com.example.warehousemanager',
  "uses-permission: name='android.permission.CAMERA'",
  "uses-permission: name='android.permission.INTERNET'",
  "uses-permission: name='android.permission.SYSTEM_ALERT_WINDOW'",
  "uses-permission: name='android.permission.USE_BIOMETRIC'",
  "uses-permission: name='android.permission.USE_FINGERPRINT'",
  "uses-permission: name='android.permission.VIBRATE'",
  "uses-permission: name='android.permission.ACCESS_NETWORK_STATE'",
  "uses-permission: name='android.permission.ACCESS_WIFI_STATE'",
  'permission: com.example.warehousemanager.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  "uses-permission: name='com.example.warehousemanager.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'",
].join('\n');
const appBlocked = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo.android.blockedPermissions;
const options = { packageName: 'com.example.warehousemanager' };

test('the permissions the app is expected to request pass', () => {
  assert.deepEqual(validatePermissions(expectedDump, appBlocked, options), [
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.USE_BIOMETRIC',
    'android.permission.USE_FINGERPRINT',
    'android.permission.VIBRATE',
    'com.example.warehousemanager.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  ]);
});

test('a permission nobody reviewed fails, whatever it is', () => {
  for (const added of [
    "uses-permission: name='android.permission.ACCESS_FINE_LOCATION'",
    "uses-permission: name='android.permission.READ_PHONE_STATE'",
    "uses-permission: name='android.permission.READ_CONTACTS'",
    "uses-permission: name='android.permission.POST_NOTIFICATIONS'",
    "uses-permission: name='android.permission.BLUETOOTH_CONNECT'",
    // Not in the android.permission namespace: advertising id, push, billing.
    "uses-permission: name='com.google.android.gms.permission.AD_ID'",
    "uses-permission: name='com.google.android.c2dm.permission.RECEIVE'",
    "uses-permission: name='com.android.vending.BILLING'",
    // The SDK-23 form and a permission another app's package declares.
    "uses-permission-sdk-23: name='android.permission.ACCESS_COARSE_LOCATION'",
    "uses-permission: name='com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'",
  ]) {
    assert.throws(() => validatePermissions(`${expectedDump}\n${added}`, appBlocked, options), /Unexpected Android permission/, added);
  }
});

test('the failure names the permission and says what to do', () => {
  assert.throws(
    () => validatePermissions(`${expectedDump}\nuses-permission: name='android.permission.ACCESS_FINE_LOCATION'`, appBlocked, options),
    /android\.permission\.ACCESS_FINE_LOCATION.*EXPECTED_ANDROID_PERMISSIONS/s
  );
});

test('a blocked permission still fails as blocked', () => {
  assert.throws(
    () => validatePermissions(`${expectedDump}\nuses-permission: name='android.permission.RECORD_AUDIO'`, appBlocked, options),
    /Blocked Android permission/
  );
});

test('the expected list and the blocked list of app.json do not overlap, and camera is expected', () => {
  assert.deepEqual(EXPECTED_ANDROID_PERMISSIONS.filter(permission => appBlocked.includes(permission)), []);
  assert.ok(EXPECTED_ANDROID_PERMISSIONS.includes('android.permission.CAMERA'));
  assert.deepEqual([...EXPECTED_ANDROID_PERMISSIONS].sort(), EXPECTED_ANDROID_PERMISSIONS);
});

test('a caller can pass its own expected list', () => {
  const dump = "uses-permission: name='android.permission.CAMERA'\nuses-permission: name='android.permission.NFC'";
  assert.deepEqual(validatePermissions(dump, [], { allowed: ['android.permission.CAMERA', 'android.permission.NFC'] }), ['android.permission.CAMERA', 'android.permission.NFC']);
  assert.throws(() => validatePermissions(dump, [], { allowed: ['android.permission.CAMERA'] }), /android\.permission\.NFC/);
});
