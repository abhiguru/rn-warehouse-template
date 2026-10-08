/**
 * Expo Config Plugin to remove unused microphone permission
 *
 * Apple App Store requires that apps only request permissions they actually use.
 * This plugin removes the NSMicrophoneUsageDescription from Info.plist since
 * the app does not use microphone functionality.
 */
const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function removeMicrophonePermission(config) {
  return withInfoPlist(config, (config) => {
    // Remove the microphone usage description to prevent
    // the permission from appearing in the app
    if (config.modResults.NSMicrophoneUsageDescription) {
      delete config.modResults.NSMicrophoneUsageDescription;
    }
    return config;
  });
};
