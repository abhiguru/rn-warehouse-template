/**
 * Declare the iOS App Transport Security (ATS) policy instead of taking Expo's template default.
 *
 * Expo's generated Info.plist ships `NSAllowsArbitraryLoads = true` plus an http exception for
 * `localhost`, so every installed copy could speak cleartext to any host. This app already
 * insists on https in code (`src/config/operatorServer.ts`, `src/config/envConfig.ts`), so the
 * platform should refuse cleartext as well (ops review 2026-10-17, M12, decision D24).
 *
 * - Release (the default): `NSAllowsArbitraryLoads = false` and nothing else. No exception
 *   domains, no local-networking exception.
 * - Development: the same, plus `NSAllowsLocalNetworking = true`, so a debug build can load the
 *   JavaScript bundle from Metro over http (localhost, the developer machine's address, or the
 *   USB link-local address of `plugins/with-ios-usb.js`). It is switched on only by:
 *     - `WAREHOUSE_IOS_LOCAL_NETWORKING=1`;
 *     - `WAREHOUSE_IOS_USB_HOST`, which only the USB development flow sets;
 *     - the EAS `development` build profile (`EAS_BUILD_PROFILE=development`).
 *
 * Info.plist is shared by the Debug and Release configurations, so this is decided when the
 * native project is generated (`expo prebuild`), not when Xcode builds. A project generated
 * for development must never be archived for release: generate it again without these
 * variables first. Asking for the development policy under the EAS `preview` or `production`
 * profile stops the build.
 *
 * `ios/` is generated and never committed.
 */
const { withInfoPlist } = require('@expo/config-plugins');

const LOCAL_NETWORKING_VARIABLE = 'WAREHOUSE_IOS_LOCAL_NETWORKING';
const RELEASE_PROFILES = ['preview', 'production'];

/** True when this prebuild is for a development build that may reach Metro over http. */
function isDevelopmentBuild(env = process.env) {
  const flag = env[LOCAL_NETWORKING_VARIABLE];
  if (flag !== undefined && flag !== '' && flag !== '0' && flag !== '1') {
    throw new Error(`${LOCAL_NETWORKING_VARIABLE} must be 1 (development) or unset.`);
  }
  const requested = flag === '1' || Boolean(env.WAREHOUSE_IOS_USB_HOST);
  const profile = env.EAS_BUILD_PROFILE;
  if (requested && RELEASE_PROFILES.includes(profile)) {
    throw new Error(
      `${LOCAL_NETWORKING_VARIABLE} and WAREHOUSE_IOS_USB_HOST are for development builds; ` +
        `the "${profile}" build profile must not allow cleartext local networking.`
    );
  }
  return requested || profile === 'development';
}

/** The `NSAppTransportSecurity` dictionary for a release or a development build. */
function transportPolicy(development) {
  return development
    ? { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true }
    : { NSAllowsArbitraryLoads: false };
}

module.exports = function withIosTransportPolicy(config) {
  const development = isDevelopmentBuild();
  return withInfoPlist(config, modConfig => {
    // Replaced as a whole: Expo's template exception domains must not survive.
    modConfig.modResults.NSAppTransportSecurity = transportPolicy(development);
    return modConfig;
  });
};
module.exports.isDevelopmentBuild = isDevelopmentBuild;
module.exports.transportPolicy = transportPolicy;
