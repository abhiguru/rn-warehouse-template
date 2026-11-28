import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const base = require('../app.json').expo;
const keys = ['WAREHOUSE_ANDROID_PACKAGE', 'WAREHOUSE_APP_NAME', 'WAREHOUSE_APP_SCHEME', 'WAREHOUSE_ANDROID_VERSION_CODE', 'WAREHOUSE_IOS_BUNDLE_ID', 'WAREHOUSE_EAS_PROJECT_ID'];

function withEnv(values, callback) {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

// app.config.js adds one plugin of its own after app.json's: it drops the Play install-referrer
// permission (see scripts/install-referrer-permission.test.mjs).
const plugins = [...base.plugins, configure.withoutInstallReferrerPermission];

test('native identity defaults preserve existing configuration', () => {
  withEnv({}, () => assert.deepEqual(configure({ config: base }), { ...base, plugins }));
});

test('isolated identity preserves permission and plugin requirements', () => {
  withEnv({ WAREHOUSE_ANDROID_PACKAGE: 'in.example.warehouse.test1', WAREHOUSE_APP_NAME: 'Test Warehouse', WAREHOUSE_APP_SCHEME: 'warehouse-test1', WAREHOUSE_ANDROID_VERSION_CODE: '2026093001' }, () => {
    const actual = configure({ config: base });
    assert.equal(actual.android.package, 'in.example.warehouse.test1');
    assert.equal(actual.android.versionCode, 2026093001);
    assert.equal(actual.name, 'Test Warehouse');
    assert.equal(actual.scheme, 'warehouse-test1');
    assert.deepEqual(actual.android.blockedPermissions, base.android.blockedPermissions);
    assert.deepEqual(actual.plugins, plugins);
    assert.equal(base.android.package, 'com.example.warehousemanager');
  });
});

test('invalid package, scheme and Android version codes fail before native generation', () => {
  for (const [key, values] of Object.entries({ WAREHOUSE_ANDROID_PACKAGE: ['invalid', 'in.Example.test', 'in.example.test;bad'], WAREHOUSE_APP_SCHEME: ['9invalid', 'bad scheme'], WAREHOUSE_ANDROID_VERSION_CODE: ['0', '-1', '1.5', '2100000001'] })) {
    for (const value of values) withEnv({ [key]: value }, () => assert.throws(() => configure({ config: base })));
  }
});

const iosId = 'in.example.warehouse.test';
const projectId = '3f2b8c1e-5d4a-4e6b-9a7c-0123456789ab';

test('iOS bundle identifier stays the app.json value and other ios keys are kept when unset', () => {
  withEnv({}, () => {
    const actual = configure({ config: base });
    assert.equal(actual.ios.bundleIdentifier, 'com.example.warehousemanager');
    assert.deepEqual(actual.ios, base.ios);
  });
});

test('WAREHOUSE_IOS_BUNDLE_ID replaces only the iOS bundle identifier', () => {
  withEnv({ WAREHOUSE_IOS_BUNDLE_ID: iosId }, () => {
    const actual = configure({ config: base });
    assert.equal(actual.ios.bundleIdentifier, iosId);
    assert.deepEqual(actual.ios, { ...base.ios, bundleIdentifier: iosId });
    assert.equal(base.ios.bundleIdentifier, 'com.example.warehousemanager');
  });
});

test('invalid WAREHOUSE_IOS_BUNDLE_ID fails naming the variable', () => {
  for (const value of ['In.Example.Warehouse', 'warehouse', 'in.example.ware house', 'in.example.test;bad']) {
    withEnv({ WAREHOUSE_IOS_BUNDLE_ID: value }, () =>
      assert.throws(() => configure({ config: base }), /WAREHOUSE_IOS_BUNDLE_ID/, value));
  }
});

test('EAS project id is not added when unset and the existing extra is kept', () => {
  withEnv({}, () => {
    const actual = configure({ config: base });
    assert.equal(actual.extra.eas, undefined);
    assert.deepEqual(actual.extra, base.extra);
  });
});

test('WAREHOUSE_EAS_PROJECT_ID sets extra.eas.projectId and keeps the rest of extra', () => {
  withEnv({ WAREHOUSE_EAS_PROJECT_ID: projectId }, () => {
    const actual = configure({ config: base });
    assert.equal(actual.extra.eas.projectId, projectId);
    assert.deepEqual(actual.extra.router, base.extra.router);
  });
});

test('invalid WAREHOUSE_EAS_PROJECT_ID fails naming the variable', () => {
  for (const value of ['not-a-uuid', '3f2b8c1e5d4a4e6b9a7c0123456789ab', '3f2b8c1e-5d4a-4e6b-9a7c-0123456789ab-extra', 'zzzzzzzz-5d4a-4e6b-9a7c-0123456789ab']) {
    withEnv({ WAREHOUSE_EAS_PROJECT_ID: value }, () =>
      assert.throws(() => configure({ config: base }), /WAREHOUSE_EAS_PROJECT_ID/, value));
  }
});

test('setting the iOS id and EAS project id leaves the Android settings unchanged', () => {
  const android = { WAREHOUSE_ANDROID_PACKAGE: 'in.example.warehouse.test1', WAREHOUSE_ANDROID_VERSION_CODE: '2026093001' };
  let androidOnly;
  withEnv(android, () => { androidOnly = configure({ config: base }).android; });
  withEnv({ ...android, WAREHOUSE_IOS_BUNDLE_ID: iosId, WAREHOUSE_EAS_PROJECT_ID: projectId }, () => {
    const actual = configure({ config: base });
    assert.deepEqual(actual.android, androidOnly);
    assert.equal(actual.android.package, 'in.example.warehouse.test1');
    assert.equal(actual.android.versionCode, 2026093001);
  });
});
