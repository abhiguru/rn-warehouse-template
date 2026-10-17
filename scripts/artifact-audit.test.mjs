import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXPECTED_ANDROID_PERMISSIONS, auditArtifact, validateBackup, validateEntries, validatePermissions, validateText } from './artifact-audit.mjs';

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

// `aapt2 dump xmltree --file AndroidManifest.xml` and `aapt dump xmltree` print the attribute differently.
const manifestDump = (allowBackup) => [
  'E: manifest (line=1)',
  '    E: application (line=67)',
  '        A: http://schemas.android.com/apk/res/android:label(0x01010001)=@0x7f0f0000',
  ...(allowBackup === undefined ? [] : [`        A: ${allowBackup}`]),
  '        E: activity (line=70)',
].join('\n');

test('app.json turns Android backup off', () => {
  assert.equal(JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo.android.allowBackup, false);
});

test('a build with Android backup off passes, in the output of aapt2 and of aapt', () => {
  assert.equal(validateBackup(manifestDump('http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=false')), false);
  assert.equal(validateBackup(manifestDump('android:allowBackup(0x01010280)=(type 0x12)0x0')), false);
});

test('a build with Android backup on fails', () => {
  assert.throws(() => validateBackup(manifestDump('http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=true')), /allowBackup/);
  assert.throws(() => validateBackup(manifestDump('android:allowBackup(0x01010280)=(type 0x12)0xffffffff')), /allowBackup/);
});

test('a build that does not say fails: Android then backs the app up', () => {
  assert.throws(() => validateBackup(manifestDump(undefined)), /allowBackup/);
});

// Review 2026-10-17, M10: the directory audit skipped every file over 10 MiB without
// a word, and the exported Hermes bundle (about 12 MB) is above that.
const MIB = 1024 * 1024;
const OLD_CAP = 10 * MIB;
const marker = '/home/alice/workspace/project'; // fictional workstation path
const script = new URL('./artifact-audit.mjs', import.meta.url).pathname;

/** A temporary export directory holding the given files ({ path: Buffer | string }), removed afterwards. */
function withExport(files, check) {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-audit-test-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(directory, name);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, content);
    }
    return check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
/** `size` bytes of harmless filler with `text` written at `offset`. */
const filler = (size, text = '', offset = 0) => {
  const buffer = Buffer.alloc(size, 'a');
  buffer.write(text, offset, 'latin1');
  return buffer;
};

test('a forbidden marker at the end of a file over 10 MiB fails the directory audit', () => {
  const size = 11 * MIB;
  withExport({ 'bundle.hbc': filler(size, marker, size - marker.length) }, directory => {
    assert.throws(() => auditArtifact(directory), /forbidden secret or workstation-path pattern/);
  });
});

test('a marker that straddles the former 10 MiB limit fails the directory audit', () => {
  withExport({ 'bundle.hbc': filler(11 * MIB, marker, OLD_CAP - 10) }, directory => {
    assert.throws(() => auditArtifact(directory), /forbidden secret or workstation-path pattern/);
  });
});

test('a clean file over 10 MiB passes and the report counts it as scanned, with nothing skipped', () => {
  withExport({ 'bundle.hbc': filler(11 * MIB), 'metadata.json': '{}' }, directory => {
    const report = auditArtifact(directory);
    assert.equal(report.entries, 2);
    assert.equal(report.scanned, 2);
    assert.equal(report.skipped, 0);
  });
  withExport({ 'bundle.hbc': filler(11 * MIB) }, directory => {
    assert.equal(auditArtifact(directory).scanned, 1);
  });
});

test('a file above the audit size limit fails instead of being skipped', () => {
  withExport({ 'small.json': '{}', 'big.hbc': filler(2048) }, directory => {
    assert.throws(() => auditArtifact(directory, undefined, { maxFileBytes: 1024 }), /Artifact file too large to audit: .*big\.hbc/);
    assert.equal(auditArtifact(directory, undefined, { maxFileBytes: 2048 }).scanned, 2);
  });
});

test('the command prints the counts as JSON, exits 0 when clean and non-zero on a marker', () => {
  withExport({ 'a/one.js': 'ordinary', 'two.hbc': filler(11 * MIB) }, directory => {
    const clean = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    const report = JSON.parse(clean.stdout);
    assert.deepEqual([report.entries, report.scanned, report.skipped], [2, 2, 0]);
  });
  withExport({ 'one.js': 'ordinary', 'two.hbc': filler(11 * MIB, marker, 11 * MIB - marker.length) }, directory => {
    const dirty = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.notEqual(dirty.status, 0);
    assert.match(dirty.stderr, /forbidden secret or workstation-path pattern/);
  });
});
