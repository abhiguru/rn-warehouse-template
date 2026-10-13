// Optional native identity for an isolated operator test installation.
// Defaults remain in app.json; no credentials belong in these variables.
const { withAndroidManifest } = require('expo/config-plugins');

// expo-application's Android module brings Google Play's install-referrer library, which
// asks for this permission. A self-hosted facility app never reads the Play install
// referrer, so the merged manifest drops it (scripts/artifact-audit.mjs refuses it).
const INSTALL_REFERRER_PERMISSION = 'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE';
const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

/** Adds `<uses-permission android:name=… tools:node="remove"/>` and the tools namespace it needs. */
function removeInstallReferrerPermission(androidManifest) {
  const manifest = androidManifest.manifest;
  manifest.$ = { ...manifest.$, 'xmlns:tools': (manifest.$ && manifest.$['xmlns:tools']) || TOOLS_NAMESPACE };
  const others = (manifest['uses-permission'] || []).filter(
    permission => !(permission.$ && permission.$['android:name'] === INSTALL_REFERRER_PERMISSION)
  );
  manifest['uses-permission'] = [
    ...others,
    { $: { 'android:name': INSTALL_REFERRER_PERMISSION, 'tools:node': 'remove' } },
  ];
  return androidManifest;
}

function withoutInstallReferrerPermission(config) {
  return withAndroidManifest(config, modConfig => {
    modConfig.modResults = removeInstallReferrerPermission(modConfig.modResults);
    return modConfig;
  });
}

module.exports = ({ config }) => {
  const packageName = process.env.WAREHOUSE_ANDROID_PACKAGE;
  const name = process.env.WAREHOUSE_APP_NAME;
  const scheme = process.env.WAREHOUSE_APP_SCHEME;
  const code = process.env.WAREHOUSE_ANDROID_VERSION_CODE;
  if (packageName && !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(packageName)) {
    throw new Error('WAREHOUSE_ANDROID_PACKAGE must be a lowercase reverse-domain Android application ID.');
  }
  if (scheme && !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error('WAREHOUSE_APP_SCHEME must be a valid lowercase URI scheme.');
  }
  if (code && (!/^\d+$/.test(code) || Number(code) < 1 || Number(code) > 2100000000)) {
    throw new Error('WAREHOUSE_ANDROID_VERSION_CODE must be an integer from 1 to 2100000000.');
  }
  return {
    ...config,
    ...(name ? { name } : {}),
    ...(scheme ? { scheme } : {}),
    android: {
      ...config.android,
      ...(packageName ? { package: packageName } : {}),
      ...(code ? { versionCode: Number(code) } : {}),
    },
    plugins: [...(config.plugins || []), withoutInstallReferrerPermission],
  };
};

module.exports.INSTALL_REFERRER_PERMISSION = INSTALL_REFERRER_PERMISSION;
module.exports.removeInstallReferrerPermission = removeInstallReferrerPermission;
module.exports.withoutInstallReferrerPermission = withoutInstallReferrerPermission;
