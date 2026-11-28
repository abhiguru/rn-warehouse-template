/**
 * Ensure warm custom-scheme URLs reach React Native on iOS.
 *
 * SDK 58+ (scene life cycle, required by iOS 27):
 * `AppDelegate.swift` subclasses `ExpoAppDelegate` without overriding
 * `application(_:open:url:options:)`, and `SceneDelegate.swift` subclasses
 * `ExpoAppSceneDelegate`. `ExpoAppSceneDelegate.scene(_:openURLContexts:)`
 * routes every URL context through `SceneEventForwarder.open`, which discards
 * the `ExpoAppDelegate` Bool return value (no short-circuiting `||`) and always
 * calls `RCTLinkingManager.scene(_:openURLContexts:)` unless
 * `RCTOpenURLNotification` was already posted. In this case no source patch is
 * needed, and the plugin verifies that both delegate files keep that shape
 * rather than letting a template or plugin change silently break warm links.
 *
 * Legacy SDK <= 57 (AppDelegate life cycle):
 * Expo's generated AppDelegate asked ExpoAppDelegate to handle the URL before
 * RCTLinkingManager using a short-circuiting `||`. When Expo reported the URL
 * as handled, React Native never emitted the `Linking` event to the running
 * app. Evaluate both handlers before combining their results so warm links are
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

const EXPO_APP_DELEGATE_CLASS = /\bclass\s+AppDelegate\s*:\s*[^{]*\bExpoAppDelegate\b/;
const APP_DELEGATE_OPEN_URL =
  /\bfunc\s+application\s*\([^)]*\bopen\s+\w+\s*:\s*(?:Foundation\.)?URL\b/;
const EXPO_SCENE_DELEGATE_CLASS = /\bclass\s+SceneDelegate\s*:\s*[^{]*\bExpoAppSceneDelegate\b/;
const SCENE_DELEGATE_OPEN_URL = /\bfunc\s+scene\s*\([^)]*\bopenURLContexts\b/;

function hasSceneDelegateUrlForwarding(appDelegateSource, sceneDelegateSource) {
  if (typeof sceneDelegateSource !== 'string') {
    return false;
  }

  return (
    EXPO_APP_DELEGATE_CLASS.test(appDelegateSource) &&
    !APP_DELEGATE_OPEN_URL.test(appDelegateSource) &&
    EXPO_SCENE_DELEGATE_CLASS.test(sceneDelegateSource) &&
    !SCENE_DELEGATE_OPEN_URL.test(sceneDelegateSource)
  );
}

function bridgeIosLinkingManager(source, sceneDelegateSource) {
  if (source.includes(bridgedHandler)) {
    return source;
  }

  if (source.includes(shortCircuitHandler)) {
    return source.replace(shortCircuitHandler, bridgedHandler);
  }

  if (hasSceneDelegateUrlForwarding(source, sceneDelegateSource)) {
    return source;
  }

  if (typeof sceneDelegateSource === 'string' && !APP_DELEGATE_OPEN_URL.test(source)) {
    throw new Error(
      'Unable to verify the generated iOS URL handler: SceneDelegate must inherit from ExpoAppSceneDelegate without overriding scene(_:openURLContexts:), and AppDelegate must inherit from ExpoAppDelegate.'
    );
  }

  throw new Error(
    'Unable to patch the generated iOS URL handler: expected AppDelegate pattern was not found.'
  );
}

module.exports = function withIosLinkingManager(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectDir = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName
      );
      const appDelegatePath = path.join(projectDir, 'AppDelegate.swift');
      const sceneDelegatePath = path.join(projectDir, 'SceneDelegate.swift');
      const source = fs.readFileSync(appDelegatePath, 'utf8');
      const sceneDelegateSource = fs.existsSync(sceneDelegatePath)
        ? fs.readFileSync(sceneDelegatePath, 'utf8')
        : undefined;
      const updated = bridgeIosLinkingManager(source, sceneDelegateSource);

      if (updated !== source) {
        fs.writeFileSync(appDelegatePath, updated);
      }

      return config;
    },
  ]);
};

module.exports.bridgeIosLinkingManager = bridgeIosLinkingManager;
module.exports.hasSceneDelegateUrlForwarding = hasSceneDelegateUrlForwarding;
