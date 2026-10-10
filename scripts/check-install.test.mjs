import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkInstall } from './check-install.mjs';

// Review 2026-10-10, X5-10: the adapters and backports exist only as a
// postinstall script, so an install with scripts turned off must be noticed
// before the app is started or tested.
const project = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./security-backports.json', import.meta.url)));
const lock = JSON.parse(readFileSync(resolve(project, 'package-lock.json'), 'utf8'));
const cliDirectory = dirname(createRequire(resolve(project, 'node_modules/expo/package.json')).resolve('@expo/cli/package.json'));
const serverFile = join(relative(project, cliDirectory), 'build/src/start/server/metro/runServer-fork.js');
const named = name => Object.keys(lock.packages).filter(path => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`));

// A copy of the installed files the check reads, as this checkout has them.
function installedCopy() {
  const root = mkdtempSync(join(tmpdir(), 'warehouse-check-install-'));
  cpSync(resolve(project, 'package-lock.json'), join(root, 'package-lock.json'));
  for (const name of ['query-string', 'decode-uri-component', ...new Set(manifest.files.map(file => file.package))]) {
    for (const path of named(name)) cpSync(resolve(project, path), join(root, path), { recursive: true });
  }
  for (const file of ['node_modules/expo/package.json', join(relative(project, cliDirectory), 'package.json'), serverFile]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(resolve(project, file), join(root, file));
  }
  return root;
}
// What each postinstall step adds, taken out again: the file as published.
const published = {
  'Expo CLI USB loopback adapter': () => [serverFile, source => source.replace("process.env.WAREHOUSE_USB_METRO === '1' ? '127.0.0.1' : host", 'host')],
  'query-string decoder adapter': () => [join(named('query-string')[0], 'index.js'), source => source.replace(
    "const decodeComponentModule = require('decode-uri-component');\nconst decodeComponent = typeof decodeComponentModule === 'function' ? decodeComponentModule : decodeComponentModule.default;",
    "const decodeComponent = require('decode-uri-component');")],
  'security backport': () => {
    const spec = manifest.files.find(file => file.package === 'braces');
    return [join(named('braces')[0], spec.file), source => {
      const original = [...spec.edits].reverse().reduce((text, edit) => text.replaceAll(edit.after, edit.before), source);
      assert.equal(createHash('sha256').update(original).digest('hex'), spec.originalSHA256, 'the fixture is the published file');
      return original;
    }];
  },
};

test('the installed tree of this checkout passes, and the command prints nothing', () => {
  checkInstall(project);
  const run = spawnSync(process.execPath, [resolve(project, 'scripts/check-install.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout + run.stderr, '');
});

for (const [name, find] of Object.entries(published)) {
  test(`an install without the ${name} is refused and left as it is`, () => {
    const root = installedCopy();
    try {
      checkInstall(root);
      const [file, unpatch] = find();
      const target = join(root, file);
      const patched = readFileSync(target, 'utf8');
      const original = unpatch(patched);
      assert.notEqual(original, patched, 'the fixture removes the patch');
      writeFileSync(target, original);
      assert.throws(() => checkInstall(root), /absent/);
      assert.equal(readFileSync(target, 'utf8'), original, 'the check writes nothing');
    } finally {
      // This directory contains only this test's copy of installed packages.
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('start, android, ios, web and test run the check first; install still applies the patches', () => {
  const { scripts } = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8'));
  for (const name of ['start', 'android', 'ios', 'web', 'test']) {
    assert.equal(scripts[`pre${name}`], 'node scripts/check-install.mjs', `pre${name}`);
  }
  assert.match(scripts.postinstall, /patch-expo-metro\.mjs && node scripts\/patch-navigation-decoder\.mjs && node scripts\/patch-security-backports\.mjs$/);
});
