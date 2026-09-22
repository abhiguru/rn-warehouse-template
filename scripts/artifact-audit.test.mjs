import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntries, validatePermissions, validateText } from './artifact-audit.mjs';

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
