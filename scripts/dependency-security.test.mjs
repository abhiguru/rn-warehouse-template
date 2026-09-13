import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('font autolinking selects the installed Expo SDK version, not an unrestricted peer', () => {
  const expected = require('expo/bundledNativeModules.json')['expo-font'];
  const installed = require('expo-font/package.json').version;
  const semver = require('semver');
  assert.ok(
    semver.satisfies(installed, expected),
    `expo-font must satisfy SDK range ${expected}`
  );
});

test('Metro uses the patched 0.83 parser and still reads PNG dimensions', () => {
  const pkg = require('metro/package.json');
  assert.equal(pkg.version, '0.83.8');
  assert.equal(pkg.dependencies['image-size'], undefined);
  const { getAssetSize } = require('metro/private/Assets');
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(24, 16);
  png.writeUInt32BE(32, 20);
  assert.deepEqual(getAssetSize('png', png, 'fixture.png'), {
    width: 24,
    height: 32,
  });
  assert.equal(getAssetSize('icns', Buffer.from('icns'), 'fixture.icns'), null);
});

test('PostCSS does not import a source map from an untrusted absolute URL', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'warehouse-postcss-test-'));
  try {
    const mapPath = join(fixture, 'outside.map');
    const marker = 'FICTIONAL_SOURCE_MAP_CONTENT';
    writeFileSync(
      mapPath,
      JSON.stringify({
        version: 3,
        sources: ['fixture.js'],
        names: [],
        mappings: 'AAAA',
        sourcesContent: [marker],
      })
    );
    const result = await require('postcss')([]).process(
      `a { color: red }\n/*# sourceMappingURL=${mapPath} */`,
      { from: undefined, map: { inline: false } }
    );
    assert.ok(!JSON.stringify(result.map?.toJSON()).includes(marker));
  } finally {
    // This directory contains only this test's synthetic fixture.
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Xcode and ngrok retain the UUID v4 API with patched dependencies', () => {
  for (const consumer of ['xcode', '@expo/ngrok']) {
    const fromConsumer = createRequire(require.resolve(consumer));
    assert.equal(fromConsumer('uuid/package.json').version, '11.1.1');
    assert.match(fromConsumer('uuid').v4(), /^[a-f0-9-]{36}$/);
  }
  const project = require('xcode').project('fictional.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});
