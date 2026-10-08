const { withInfoPlist, withAppDelegate } = require('@expo/config-plugins');
const defaultBundle = 'RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")';
const usbBundle = `if let host = Bundle.main.object(forInfoDictionaryKey: "WarehouseUSBHost") as? String {
      return URL(string: "http://\\(host)/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false")
    }
    return ${defaultBundle}`;

function patchBundle(contents) {
  if (contents.includes(usbBundle)) return contents;
  if (!contents.includes(defaultBundle)) throw new Error('Unexpected iOS bundle resolver; review USB plugin.');
  return contents.replace(
    new RegExp(`(?:return\\s+)?${defaultBundle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), usbBundle
  );
}

module.exports = function withIosUsb(config) {
  const host = process.env.WAREHOUSE_IOS_USB_HOST;
  if (host) {
    const match = /^169\.254\.(\d+)\.(\d+):(\d+)$/.exec(host);
    if (!match || +match[1] < 1 || +match[1] > 254 || +match[2] > 255 || +match[3] < 1024 || +match[3] > 65535) {
      throw new Error('WAREHOUSE_IOS_USB_HOST must be a USB link-local IPv4 host and unprivileged port.');
    }
  }
  config = withInfoPlist(config, config => {
    if (host) config.modResults.WarehouseUSBHost = host;
    else delete config.modResults.WarehouseUSBHost;
    return config;
  });
  return withAppDelegate(config, config => {
    config.modResults.contents = patchBundle(config.modResults.contents);
    return config;
  });
};
module.exports.patchBundle = patchBundle;
