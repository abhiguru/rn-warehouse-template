/**
 * Ensure warm custom-scheme URLs reach React Native on iOS.
 *
 * Expo's generated AppDelegate asks ExpoAppDelegate to handle the URL before
 * RCTLinkingManager using a short-circuiting `||`. When Expo reports the URL as
 * handled, React Native never emits the `Linking` event to the running app.
 * Evaluate both handlers before combining their results so warm links are
 * delivered without changing the final UIApplicationDelegate return value.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const shortCircuitHandler =
  '    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';

const bridgedHandler = [
  '    let expoHandled = super.application(app, open: url, options: options)',
  '    let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)',
  '    return expoHandled || reactNativeHandled',
].join('\n');

function bridgeIosLinkingManager(source) {
  if (source.includes(bridgedHandler)) {
    return source;
  }

  if (!source.includes(shortCircuitHandler)) {
    throw new Error(
      'Unable to patch the generated iOS URL handler: expected AppDelegate pattern was not found.'
    );
  }

  return source.replace(shortCircuitHandler, bridgedHandler);
}

module.exports = function withIosLinkingManager(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'AppDelegate.swift'
      );
      const source = fs.readFileSync(appDelegatePath, 'utf8');
      const updated = bridgeIosLinkingManager(source);

      if (updated !== source) {
        fs.writeFileSync(appDelegatePath, updated);
      }

      return config;
    },
  ]);
};

module.exports.bridgeIosLinkingManager = bridgeIosLinkingManager;
