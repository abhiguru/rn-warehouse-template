const { getDefaultConfig } = require('expo/metro-config');
const { claudeBlockPattern, withBlocked } = require('./scripts/metro-block-list');
const config = getDefaultConfig(__dirname);
// Agents keep git worktrees of this app in .claude/worktrees/ inside the checkout.
// Metro must not watch or resolve anything below this checkout's own .claude folder.
// The pattern is built from __dirname, so a Metro started from inside such a
// worktree still sees that worktree's own files. The defaults stay in the list.
config.resolver.blockList = withBlocked(
  config.resolver.blockList,
  claudeBlockPattern(__dirname)
);
// The USB helper can run in environments where Watchman's launch service is
// unavailable. Normal development keeps Metro's default watcher selection.
if (process.env.WAREHOUSE_NO_WATCHMAN === '1') config.resolver.useWatchman = false;
module.exports = config;
