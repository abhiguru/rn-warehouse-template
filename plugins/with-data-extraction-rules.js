/**
 * Android backup and device-transfer rules for the phone copy (WH-298, product/tech/app-offline-copy-and-sync.md 2).
 *
 * The phone copy (expo-sqlite, `files/SQLite/`) and the secure store that holds its key (`shared_prefs/SecureStore.xml`)
 * must never leave the phone, and so must the photos kept for it (`phone-copy-photos/`, WH-299). `android:allowBackup="false"` (app.json) stops cloud backup, but Android 12 and later
 * ignore it for device-to-device transfer: only `android:dataExtractionRules` excludes data there. Android 11 and
 * earlier read `android:fullBackupContent`. Both are written here, each excluding the two locations; the key is also
 * wrapped by the Android Keystore, so a copy that did travel could not be opened (it is then erased when found).
 *
 * The plugin adds both attributes to the manifest and writes `res/xml/data_extraction_rules.xml` and
 * `res/xml/backup_rules.xml`. No dependency. `android/` is generated and never committed.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const EXTRACTION_NAME = 'data_extraction_rules';
const BACKUP_NAME = 'backup_rules';

const EXCLUDES = `        <exclude domain="file" path="SQLite/" />
        <exclude domain="file" path="phone-copy-photos/" />
        <exclude domain="sharedpref" path="SecureStore.xml" />`;

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- The phone copy and its key never leave the phone (plugins/with-data-extraction-rules.js). -->
<data-extraction-rules>
    <cloud-backup>
${EXCLUDES}
    </cloud-backup>
    <device-transfer>
${EXCLUDES}
    </device-transfer>
</data-extraction-rules>
`;

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 and earlier: the phone copy and its key never leave the phone (plugins/with-data-extraction-rules.js). -->
<full-backup-content>
${EXCLUDES.replace(/^ {4}/gm, '')}
</full-backup-content>
`;

/** Points the application at both rule files. Safe to call twice. */
function setExtractionRules(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_NAME}`;
  application.$['android:fullBackupContent'] = `@xml/${BACKUP_NAME}`;
  return androidManifest;
}

/** Writes both rule files under the generated Android project. */
function writeExtractionRules(platformProjectRoot) {
  const directory = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${EXTRACTION_NAME}.xml`), DATA_EXTRACTION_RULES_XML, 'utf8');
  fs.writeFileSync(path.join(directory, `${BACKUP_NAME}.xml`), BACKUP_RULES_XML, 'utf8');
}

module.exports = function withDataExtractionRules(config) {
  config = withAndroidManifest(config, modConfig => {
    modConfig.modResults = setExtractionRules(modConfig.modResults);
    return modConfig;
  });
  return withDangerousMod(config, [
    'android',
    async modConfig => {
      writeExtractionRules(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);
};
module.exports.DATA_EXTRACTION_RULES_XML = DATA_EXTRACTION_RULES_XML;
module.exports.BACKUP_RULES_XML = BACKUP_RULES_XML;
module.exports.setExtractionRules = setExtractionRules;
module.exports.writeExtractionRules = writeExtractionRules;
