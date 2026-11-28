// Optional native identity for an isolated operator test installation.
// Defaults remain in app.json; no credentials belong in these variables.
const { withAndroidManifest } = require('expo/config-plugins');
const { loadBrandPack, checkLegalText } = require('./brand-packs/loadBrandPack.cjs');

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

// A lowercase reverse-domain application ID, as the Android package and the iOS bundle identifier both take.
const REVERSE_DOMAIN_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = ({ config }) => {
  const packageName = process.env.WAREHOUSE_ANDROID_PACKAGE;
  const iosBundleId = process.env.WAREHOUSE_IOS_BUNDLE_ID;
  const easProjectId = process.env.WAREHOUSE_EAS_PROJECT_ID;
  const name = process.env.WAREHOUSE_APP_NAME;
  const scheme = process.env.WAREHOUSE_APP_SCHEME;
  const code = process.env.WAREHOUSE_ANDROID_VERSION_CODE;
  if (packageName && !REVERSE_DOMAIN_ID.test(packageName)) {
    throw new Error('WAREHOUSE_ANDROID_PACKAGE must be a lowercase reverse-domain Android application ID.');
  }
  if (iosBundleId && !REVERSE_DOMAIN_ID.test(iosBundleId)) {
    throw new Error('WAREHOUSE_IOS_BUNDLE_ID must be a lowercase reverse-domain iOS bundle identifier.');
  }
  if (easProjectId && !UUID.test(easProjectId)) {
    throw new Error('WAREHOUSE_EAS_PROJECT_ID must be an Expo project ID (a UUID).');
  }
  if (scheme && !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error('WAREHOUSE_APP_SCHEME must be a valid lowercase URI scheme.');
  }
  if (code && (!/^\d+$/.test(code) || Number(code) < 1 || Number(code) > 2100000000)) {
    throw new Error('WAREHOUSE_ANDROID_VERSION_CODE must be an integer from 1 to 2100000000.');
  }
  // Optional brand pack (brand-packs/README.md): checked here, so a bad pack stops the build.
  const brandPackDir = process.env.WAREHOUSE_BRAND_PACK;
  const brandPack = brandPackDir ? loadBrandPack(brandPackDir) : null;
  checkLegalText(process.env.EXPO_PUBLIC_LEGAL_TEXT, brandPack);
  return {
    ...config,
    extra: {
      ...config.extra,
      ...(brandPack ? { brandPack } : {}),
      ...(easProjectId ? { eas: { ...(config.extra && config.extra.eas), projectId: easProjectId } } : {}),
    },
    ...(name ? { name } : {}),
    ...(scheme ? { scheme } : {}),
    ...(iosBundleId ? { ios: { ...config.ios, bundleIdentifier: iosBundleId } } : {}),
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
