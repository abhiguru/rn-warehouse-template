/**
 * Declare the iOS App Transport Security (ATS) policy instead of taking Expo's template default.
 *
 * Expo's generated Info.plist ships `NSAllowsArbitraryLoads = true` plus an http exception for
 * `localhost`, so every installed copy could speak cleartext to any host. This app already
 * insists on https in code (`src/config/operatorServer.ts`, `src/config/envConfig.ts`), so the
 * platform should refuse cleartext as well (ops review 2026-10-17, M12, decision D24).
 *
 * Owner decision 2026-10-26 (WS-L, amends D24): the phone may fall back to the server's address on the
 * warehouse network, plain http to a private IPv4 address, when the public address fails
 * (`src/config/lanTransport.ts`; `src/config/lanAddress.ts` is the only place a cleartext URL is built
 * and accepts nothing but a private address). So every build, Debug and Release alike, has exactly:
 *
 * - `NSAppTransportSecurity`: `NSAllowsArbitraryLoads = false` and `NSAllowsLocalNetworking = true`, and
 *   no exception domain and no other key. Apple's text for the key: it enables loads from "unqualified
 *   domains, `.local` domains, and IP addresses using IPv4 or IPv6". It does NOT say "local only": the
 *   platform lets the app load over http from any IP-address literal, so `src/config/lanAddress.ts` (private
 *   RFC 1918 addresses only) is the limit, as on Android. Since iOS 17 ATS blocks IP-address connections by
 *   default, so the key is REQUIRED for this feature, not just a declaration. It is also what lets a Debug
 *   build load the JavaScript bundle from Metro (localhost, the developer machine's address, or the USB
 *   link-local address of `plugins/with-ios-usb.js`).
 * - `NSLocalNetworkUsageDescription`: the sentence iOS shows when the app first reaches a device on the
 *   local network (the Local Network prompt). Without it iOS refuses the access.
 *
 * The Release build phase added below fails an archive whose built `Info.plist` allows arbitrary loads,
 * has an exception domain or either arbitrary-load exemption. A development-only prebuild with
 * `WAREHOUSE_IOS_USB_HOST` (the USB helper) is refused under the EAS `preview` and `production`
 * profiles.
 *
 * `ios/` is generated and never committed.
 */
const { withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const RELEASE_PROFILES = ['preview', 'production'];

/** The text of the iOS Local Network prompt. `$(PRODUCT_NAME)` is the app's name, filled in by Xcode. */
const LOCAL_NETWORK_USAGE_DESCRIPTION =
  "$(PRODUCT_NAME) reaches your cold storage's server over the warehouse network when the internet is not working. " +
  'Allow this so the app keeps working during an outage.';

/** The USB development flow's host must never be built into a store or internal-distribution release. */
function refuseUsbHostInRelease(env = process.env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (env.WAREHOUSE_IOS_USB_HOST && RELEASE_PROFILES.includes(profile)) {
    throw new Error(
      `WAREHOUSE_IOS_USB_HOST is for development builds; the "${profile}" build profile must not use it.`
    );
  }
}

/** The `NSAppTransportSecurity` dictionary of every build: exactly these two keys. */
function transportPolicy() {
  return { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true };
}

const GUARD_PHASE_NAME = 'Refuse a wider transport policy in Release';
// One line on purpose (the project file stores it as one quoted string). In a Release build it
// fails when the built Info.plist allows arbitrary loads (also for web content or media) or has any
// exception domain, so an archive whose transport policy is wider than the two keys above cannot be
// produced. It also fails when it cannot look (PlistBuddy missing, the plist missing or unreadable): a
// check that cannot run must not let the build pass (ops review N1). NSAllowsLocalNetworking itself is
// allowed: it is the warehouse network fallback (owner decision 2026-10-26).
const PLISTBUDDY = '/usr/libexec/PlistBuddy';
const GUARD_SCRIPT = [
  'if [ "$CONFIGURATION" = "Release" ]; then',
  `PB="${PLISTBUDDY}";`,
  'PLIST="$TARGET_BUILD_DIR/$INFOPLIST_PATH";',
  'if [ ! -x "$PB" ]; then echo "error: PlistBuddy is missing, so the Release transport policy cannot be checked (ops review N1)." >&2; exit 1; fi;',
  'if [ ! -r "$PLIST" ]; then echo "error: the built Info.plist at $PLIST is missing or unreadable, so the Release transport policy cannot be checked (ops review N1)." >&2; exit 1; fi;',
  'if ! "$PB" -c "Print :CFBundleIdentifier" "$PLIST" >/dev/null 2>&1; then echo "error: the built Info.plist cannot be parsed, so the Release transport policy cannot be checked (ops review N1)." >&2; exit 1; fi;',
  'if "$PB" -c "Print :NSAppTransportSecurity:NSExceptionDomains" "$PLIST" >/dev/null 2>&1; then echo "error: NSExceptionDomains is set in a Release Info.plist (ops review N1)." >&2; exit 1; fi;',
  'if "$PB" -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent" "$PLIST" >/dev/null 2>&1; then echo "error: NSAllowsArbitraryLoadsInWebContent is set in a Release Info.plist (D24)." >&2; exit 1; fi;',
  'if "$PB" -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoadsForMedia" "$PLIST" >/dev/null 2>&1; then echo "error: NSAllowsArbitraryLoadsForMedia is set in a Release Info.plist (D24)." >&2; exit 1; fi;',
  'if [ "$("$PB" -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads" "$PLIST" 2>/dev/null)" = "true" ]; then echo "error: NSAllowsArbitraryLoads is true in a Release Info.plist (ops review M12)." >&2; exit 1; fi;',
  'fi',
].join(' ');

/** Adds the Release-only guard as a Run Script phase of the app target; safe to call twice. */
function addReleaseGuardPhase(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
  const present = Object.values(phases).some(
    phase => typeof phase === 'object' && phase.name === `"${GUARD_PHASE_NAME}"`
  );
  if (!present) {
    project.addBuildPhase([], 'PBXShellScriptBuildPhase', GUARD_PHASE_NAME, project.getFirstTarget().uuid, {
      shellPath: '/bin/sh',
      shellScript: GUARD_SCRIPT,
      inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'],
    });
  }
  return project;
}

module.exports = function withIosTransportPolicy(config) {
  refuseUsbHostInRelease();
  config = withInfoPlist(config, modConfig => {
    // Replaced as a whole: Expo's template exception domains must not survive.
    modConfig.modResults.NSAppTransportSecurity = transportPolicy();
    modConfig.modResults.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE_DESCRIPTION;
    return modConfig;
  });
  return withXcodeProject(config, modConfig => {
    modConfig.modResults = addReleaseGuardPhase(modConfig.modResults);
    return modConfig;
  });
};
module.exports.addReleaseGuardPhase = addReleaseGuardPhase;
module.exports.GUARD_PHASE_NAME = GUARD_PHASE_NAME;
module.exports.GUARD_SCRIPT = GUARD_SCRIPT;
module.exports.LOCAL_NETWORK_USAGE_DESCRIPTION = LOCAL_NETWORK_USAGE_DESCRIPTION;
module.exports.PLISTBUDDY = PLISTBUDDY;
module.exports.refuseUsbHostInRelease = refuseUsbHostInRelease;
module.exports.transportPolicy = transportPolicy;
