/**
 * Keep the phone's own data out of iCloud and iTunes backups on iOS (WH-301 security finding, product/tech/app-offline-unsent-work.md section 1).
 *
 * The unsent work (`unsent-work.db`, unencrypted by the owner's decision of 2026-11-26) lives in `Documents/SQLite/` and its
 * photos and saved forms in `Documents/unsent-work/`; the phone copy's photos sit in `Documents/phone-copy-photos/`. iOS backs up
 * all of `Documents/` unless an item carries `NSURLIsExcludedFromBackupKey`, and neither expo-file-system nor expo-sqlite offers a
 * way to set it. This is the iOS counterpart of `plugins/with-data-extraction-rules.js` (Android).
 *
 * The plugin adds a function to the generated `AppDelegate.swift` and calls it at launch before the app starts. It creates the
 * three folders when missing and flags each one; the flag on a folder covers everything inside it, now and later, so no file is
 * moved and existing installs are covered by their next launch. Setting the flag never fails the launch: a problem is logged.
 * A folder deleted and created again while the app runs (the phone copy's photo folder, on erase) has no flag until the next launch.
 *
 * `ios/` is generated and never committed.
 */
const { withAppDelegate } = require('@expo/config-plugins');

/** Folders of `Documents/` kept out of backups. `SQLite` also holds the phone copy's encrypted file. */
const EXCLUDED_FOLDERS = ['SQLite', 'unsent-work', 'phone-copy-photos'];

const CALL = '    excludeAppDataFromIosBackup()';
const RETURN_LINE = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';

const HELPER = `
// WH-301: the phone copy, the unsent work and their photos never go into iCloud or iTunes backups (plugins/with-ios-backup-exclusion.js).
func excludeAppDataFromIosBackup() {
  guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
  for name in [${EXCLUDED_FOLDERS.map(name => `"${name}"`).join(', ')}] {
    var folder = documents.appendingPathComponent(name, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try folder.setResourceValues(values)
    } catch {
      NSLog("[backup] could not keep %@ out of backups: %@", name, String(describing: error))
    }
  }
}
`;

function addBackupExclusion(source) {
  if (source.includes('excludeAppDataFromIosBackup()')) return source;
  if (!source.includes(RETURN_LINE)) {
    throw new Error('Unexpected iOS AppDelegate launch method; review the backup exclusion plugin.');
  }
  return `${source.replace(RETURN_LINE, `${CALL}\n${RETURN_LINE}`).trimEnd()}\n${HELPER}`;
}

module.exports = function withIosBackupExclusion(config) {
  return withAppDelegate(config, config => {
    config.modResults.contents = addBackupExclusion(config.modResults.contents);
    return config;
  });
};
module.exports.addBackupExclusion = addBackupExclusion;
module.exports.EXCLUDED_FOLDERS = EXCLUDED_FOLDERS;
