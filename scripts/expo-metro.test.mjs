import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { adaptWatcher, adaptBinding } from './patch-expo-metro.mjs';
const require = createRequire(import.meta.url);
const folder = '../node_modules/expo/node_modules/@expo/cli/build/src/start/server/metro/';
const observers = require(folder + 'waitForMetroToObserveTypeScriptFile.js');
const { metroWatchTypeScriptFiles } = require(folder + 'metroWatchTypeScriptFiles.js');
const { FileSystemChangeAggregator } = require('../node_modules/metro-file-map/src/lib/FileSystemChangeAggregator.js');

test('USB Metro binding adapter is explicit loopback, idempotent, and version checked', () => {
  const source = readFileSync(new URL(folder + 'runServer-fork.js', import.meta.url), 'utf8');
  assert.equal(adaptBinding(source, '54.0.27'), source);
  assert.ok(source.includes("process.env.WAREHOUSE_USB_METRO === '1' ? '127.0.0.1' : host"));
  assert.throws(() => adaptBinding(source, '55.0.0'), /Unreviewed/);
  assert.throws(() => adaptBinding(source + '\n', '54.0.27'), /Unreviewed/);
});

test('actual Expo observers consume Metro added/modified/deleted events and detach', () => {
  const watcher = new EventEmitter(); const server = new EventEmitter();
  const runner = { server, metro: { getBundler: () => ({ getBundler: () => ({ getWatcher: () => watcher }) }) } };
  let added = 0, specific = 0, any = [], typed = [];
  observers.waitForMetroToObserveTypeScriptFile('/app', runner, () => added++);
  observers.observeFileChanges(runner, ['/app/src/changed.ts'], () => specific++);
  observers.observeAnyFileChanges(runner, events => any = events);
  metroWatchTypeScriptFiles({ ...runner, projectRoot: '/app', callback: event => typed.push(event) });
  const aggregate = new FileSystemChangeAggregator();
  const metadata = { type: 'f', modifiedTime: 1, size: 10 };
  aggregate.fileAdded('src/new.ts', metadata);
  aggregate.fileModified('src/changed.ts', metadata, metadata);
  aggregate.fileRemoved('src/removed.ts', metadata);
  aggregate.fileAdded('node_modules/ignored.ts', metadata);
  watcher.emit('change', { rootDir: '/app', changes: aggregate.getMappedView(x => x) });
  assert.equal(added, 1); assert.equal(specific, 1);
  assert.equal(any.length, 4);
  assert.deepEqual(typed.map(event => [event.type, event.filePath]), [['add', '/app/src/new.ts'], ['change', '/app/src/changed.ts'], ['delete', '/app/src/removed.ts']]);
  watcher.emit('change', { eventsQueue: [{ type: 'change', filePath: '/app/src/changed.ts', metadata }] });
  assert.equal(specific, 2);
  server.emit('close');
  assert.equal(watcher.listenerCount('change'), 0);
  assert.equal(watcher.listenerCount('add'), 0);
});
test('Expo watcher patches are idempotent and reject unreviewed versions/content', () => {
  for (const filename of ['waitForMetroToObserveTypeScriptFile.js', 'metroWatchTypeScriptFiles.js']) {
    const source = readFileSync(new URL(folder + filename, import.meta.url), 'utf8');
    assert.equal(adaptWatcher(source, filename, '54.0.27'), source);
    assert.throws(() => adaptWatcher(source, filename, '55.0.0'), /Unreviewed/);
    assert.throws(() => adaptWatcher(source + '\n', filename, '54.0.27'), /Unreviewed/);
  }
});
