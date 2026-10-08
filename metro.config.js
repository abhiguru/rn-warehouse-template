const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// The USB helper can run in environments where Watchman's launch service is
// unavailable. Normal development keeps Metro's default watcher selection.
if (process.env.WAREHOUSE_NO_WATCHMAN === '1') config.resolver.useWatchman = false;
module.exports = config;
