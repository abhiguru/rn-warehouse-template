import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { claudeBlockPattern, withBlocked } = require('./metro-block-list.js');

test('the pattern blocks everything below the checkout .claude folder and no other path', () => {
  const pattern = claudeBlockPattern('/home/u/app');
  assert.ok(pattern.test('/home/u/app/.claude/worktrees/x/src/a.ts'));
  assert.ok(pattern.test('/home/u/app/.claude/settings.json'));
  assert.ok(!pattern.test('/home/u/app/src/a.ts'));
  assert.ok(!pattern.test('/home/u/app/node_modules/x/.claude/y.js'));
  assert.ok(!pattern.test('/home/u/app-other/.claude/z.js'));
  // Only the folder itself with a separator after it, not a name that starts the same way.
  assert.ok(!pattern.test('/home/u/app/.claude-other/z.js'));
  assert.ok(!pattern.test('/home/u/app/.claudex'));
});

test('run from inside a worktree the pattern keeps that worktree and blocks only what is below its .claude', () => {
  const pattern = claudeBlockPattern('/home/u/app/.claude/worktrees/x');
  assert.ok(!pattern.test('/home/u/app/.claude/worktrees/x/src/a.ts'));
  assert.ok(!pattern.test('/home/u/app/.claude/worktrees/x/package.json'));
  assert.ok(pattern.test('/home/u/app/.claude/worktrees/x/.claude/worktrees/y/src/a.ts'));
});

test('a root with characters that mean something in a regular expression is matched literally', () => {
  const pattern = claudeBlockPattern('/home/u/my app (1)/a+b.c');
  assert.ok(pattern.test('/home/u/my app (1)/a+b.c/.claude/x.js'));
  assert.ok(!pattern.test('/home/u/my app (1)/aab.c/.claude/x.js'));
  assert.ok(!pattern.test('/home/u/my app (1)/a+bxc/.claude/x.js'));
});

test('the separator of the platform is used, so Windows-style paths work too', () => {
  const pattern = claudeBlockPattern('C:\\Users\\u\\app', path.win32);
  assert.ok(pattern.test('C:\\Users\\u\\app\\.claude\\worktrees\\x\\src\\a.ts'));
  assert.ok(!pattern.test('C:\\Users\\u\\app\\src\\a.ts'));
  assert.ok(!pattern.test('C:\\Users\\u\\app-other\\.claude\\z.js'));
  const inside = claudeBlockPattern('C:\\Users\\u\\app\\.claude\\worktrees\\x', path.win32);
  assert.ok(!inside.test('C:\\Users\\u\\app\\.claude\\worktrees\\x\\src\\a.ts'));
  assert.ok(inside.test('C:\\Users\\u\\app\\.claude\\worktrees\\x\\.claude\\worktrees\\y\\a.ts'));
});

test('withBlocked keeps every existing entry and adds the pattern', () => {
  const pattern = /^\/p\/.*/;
  const a = /a/;
  const b = /b/;
  assert.deepEqual(withBlocked(undefined, pattern), [pattern]);
  assert.deepEqual(withBlocked(a, pattern), [a, pattern]);
  assert.deepEqual(withBlocked([a, b], pattern), [a, b, pattern]);
  const existing = [a, b];
  const result = withBlocked(existing, pattern);
  assert.notEqual(result, existing);
  assert.deepEqual(existing, [a, b]);
});

test('the real metro.config.js blocks the .claude folder of its own checkout and nothing of the checkout itself', () => {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const config = require('../metro.config.js');
  const blockList = config.resolver.blockList;
  const entries = Array.isArray(blockList) ? blockList : blockList == null ? [] : [blockList];
  assert.ok(entries.every(entry => entry instanceof RegExp));
  const blocking = file => entries.filter(entry => entry.test(file));
  assert.equal(
    blocking(path.join(root, '.claude', 'worktrees', 'x', 'src', 'a.ts')).length >= 1,
    true,
    'a file in a worktree below the checkout is not blocked'
  );
  assert.deepEqual(blocking(path.join(root, 'src', 'a.ts')), []);
  assert.deepEqual(blocking(path.join(root, 'app', 'index.tsx')), []);
  // What getDefaultConfig put there is still there next to it.
  assert.ok(entries.length >= 2, 'the default entries are gone');
});
