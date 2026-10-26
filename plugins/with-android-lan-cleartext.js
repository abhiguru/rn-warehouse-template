/**
 * Android network security config for the warehouse network fallback (WS-L, owner decision 2026-10-26,
 * which amends D24).
 *
 * The phone may fall back to the server's address on the warehouse network, plain http to a private IPv4
 * address, when the public address fails (`src/config/lanTransport.ts`). Android blocks cleartext by
 * default since API 28, so the app needs a network security config that allows it.
 *
 * It is as narrow as the platform allows, which is not narrow: a `<domain-config>` names a host or one exact
 * IP address, never a range, and the address of a facility's server is not known when the app is built (the
 * operator's DHCP chooses it and it can change). A rule such as "cleartext only to 10/8, 172.16/12 and
 * 192.168/16" cannot be written. So `base-config` permits cleartext, and the app is what keeps it to
 * private addresses:
 *
 *  - the only cleartext URL the app builds comes from `src/config/lanAddress.ts`, which accepts nothing but
 *    `http://<RFC 1918 IPv4>:<port>`; every other address it takes (a facility, the association service, the
 *    catalogue) must be https (`parseOperatorOrigin`, `parseCentralOrigin`);
 *  - the transport uses it only after the public address failed and the LAN address proved to be the same
 *    facility (`src/config/lanTransport.ts`);
 *  - `src/config/__tests__/lanCallSites.test.ts` fails when another module builds a cleartext URL.
 *
 * Trust anchors stay the system's: user-installed certificates are not trusted, as for any app targeting
 * API 24 or later. The accepted exposure is in the backend's `docs/CONTAINER_SECURITY.md`.
 *
 * The plugin adds `android:networkSecurityConfig` to the application and writes
 * `res/xml/network_security_config.xml`. No dependency (`expo-build-properties` would add one).
 * `android/` is generated and never committed.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const CONFIG_NAME = 'network_security_config';

const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Warehouse network fallback (owner decision 2026-10-26, amends D24).
  Android cannot limit cleartext to an address range, so it is allowed here and the app limits it to
  private IPv4 addresses (src/config/lanAddress.ts). See plugins/with-android-lan-cleartext.js.
-->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/** Points the application at `res/xml/network_security_config.xml`. Safe to call twice. */
function setNetworkSecurityConfig(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.$['android:networkSecurityConfig'] = `@xml/${CONFIG_NAME}`;
  // The attribute decides; a blanket flag next to it would only be a second, wider switch.
  delete application.$['android:usesCleartextTraffic'];
  return androidManifest;
}

/** Writes `res/xml/network_security_config.xml` under the generated Android project. */
function writeNetworkSecurityConfig(platformProjectRoot) {
  const directory = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${CONFIG_NAME}.xml`);
  fs.writeFileSync(file, NETWORK_SECURITY_CONFIG_XML, 'utf8');
  return file;
}

module.exports = function withAndroidLanCleartext(config) {
  config = withAndroidManifest(config, modConfig => {
    modConfig.modResults = setNetworkSecurityConfig(modConfig.modResults);
    return modConfig;
  });
  return withDangerousMod(config, [
    'android',
    async modConfig => {
      writeNetworkSecurityConfig(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);
};
module.exports.CONFIG_NAME = CONFIG_NAME;
module.exports.NETWORK_SECURITY_CONFIG_XML = NETWORK_SECURITY_CONFIG_XML;
module.exports.setNetworkSecurityConfig = setNetworkSecurityConfig;
module.exports.writeNetworkSecurityConfig = writeNetworkSecurityConfig;
