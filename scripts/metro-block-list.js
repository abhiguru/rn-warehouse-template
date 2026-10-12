'use strict';
// Helpers for metro.config.js, kept in a module of their own so a test can load
// them without loading Metro.
const path = require('path');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A pattern for Metro's resolver.blockList that matches every path below
// <root>/.claude/ and nothing else. Agents keep git worktrees of this app in
// <root>/.claude/worktrees/, and without a block list Metro's file watcher and
// resolver would see those copies of the source tree.
//
// The pattern is anchored to the root it is given (the checkout that runs
// Metro), never to the text ".claude/". Metro started from inside such a
// worktree gets that worktree's root, whose own path contains
// ".claude/worktrees/": the worktree's own files are not blocked, only a
// ".claude" folder below it is.
//
// pathApi is path.posix or path.win32 for a test of the other platform's paths;
// Metro itself always gets the default, the path module of the running system.
function claudeBlockPattern(root, pathApi = path) {
  const folder = pathApi.resolve(root, '.claude');
  return new RegExp('^' + escapeRegExp(folder) + escapeRegExp(pathApi.sep) + '.*');
}

// The block list with pattern added. existing is what getDefaultConfig put in
// resolver.blockList: undefined, one RegExp or an array. Nothing in it is
// dropped or changed, and the array that comes back is a new one.
function withBlocked(existing, pattern) {
  if (existing == null) return [pattern];
  return [...(Array.isArray(existing) ? existing : [existing]), pattern];
}

module.exports = { claudeBlockPattern, withBlocked };
