// Optional native identity for an isolated operator test installation.
// Defaults remain in app.json; no credentials belong in these variables.
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
  };
};
