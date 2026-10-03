import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const base = require('../app.json').expo;
const keys = ['WAREHOUSE_ANDROID_PACKAGE', 'WAREHOUSE_APP_NAME', 'WAREHOUSE_APP_SCHEME', 'WAREHOUSE_ANDROID_VERSION_CODE'];

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

test('native identity defaults preserve existing configuration', () => {
  withEnv({}, () => assert.deepEqual(configure({ config: base }), base));
});

test('isolated identity preserves permission and plugin requirements', () => {
  withEnv({ WAREHOUSE_ANDROID_PACKAGE: 'in.example.warehouse.test1', WAREHOUSE_APP_NAME: 'Test Warehouse', WAREHOUSE_APP_SCHEME: 'warehouse-test1', WAREHOUSE_ANDROID_VERSION_CODE: '2026093001' }, () => {
    const actual = configure({ config: base });
    assert.equal(actual.android.package, 'in.example.warehouse.test1');
    assert.equal(actual.android.versionCode, 2026093001);
    assert.equal(actual.name, 'Test Warehouse');
    assert.equal(actual.scheme, 'warehouse-test1');
    assert.deepEqual(actual.android.blockedPermissions, base.android.blockedPermissions);
    assert.deepEqual(actual.plugins, base.plugins);
    assert.equal(base.android.package, 'com.example.warehousemanager');
  });
});

test('invalid package, scheme and Android version codes fail before native generation', () => {
  for (const [key, values] of Object.entries({ WAREHOUSE_ANDROID_PACKAGE: ['invalid', 'in.Example.test', 'in.example.test;bad'], WAREHOUSE_APP_SCHEME: ['9invalid', 'bad scheme'], WAREHOUSE_ANDROID_VERSION_CODE: ['0', '-1', '1.5', '2100000001'] })) {
    for (const value of values) withEnv({ [key]: value }, () => assert.throws(() => configure({ config: base })));
  }
});
