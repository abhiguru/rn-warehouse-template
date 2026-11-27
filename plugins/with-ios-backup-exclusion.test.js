jest.mock('@expo/config-plugins', () => ({
  withAppDelegate: jest.fn((config, mod) => mod(config)),
}));

const { withAppDelegate } = require('@expo/config-plugins');
const withIosBackupExclusion = require('./with-ios-backup-exclusion');
const { addBackupExclusion, EXCLUDED_FOLDERS } = withIosBackupExclusion;

describe('with-ios-backup-exclusion (WH-301)', () => {
  const sampleAppDelegate = `import Expo
import React

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

  it('calls excludeAppDataFromIosBackup() right before super.application and appends the helper for all three folders', () => {
    const updated = addBackupExclusion(sampleAppDelegate);

    expect(updated).toContain(
      '    excludeAppDataFromIosBackup()\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)'
    );
    expect(updated).toContain('func excludeAppDataFromIosBackup()');
    expect(updated).toContain('values.isExcludedFromBackup = true');
    expect(EXCLUDED_FOLDERS).toEqual(['SQLite', 'unsent-work', 'phone-copy-photos']);
    for (const folder of ['"SQLite"', '"unsent-work"', '"phone-copy-photos"']) {
      expect(updated).toContain(folder);
    }
  });

  it('is idempotent when applied twice', () => {
    const once = addBackupExclusion(sampleAppDelegate);
    const twice = addBackupExclusion(once);

    expect(twice).toBe(once);
    expect(twice.match(/excludeAppDataFromIosBackup\(\)/g)).toHaveLength(2);
  });

  it('throws loudly when the expected launch return line is missing', () => {
    expect(() => addBackupExclusion('public class AppDelegate: ExpoAppDelegate {}')).toThrow(
      'Unexpected iOS AppDelegate launch method; review the backup exclusion plugin.'
    );
  });

  it('wires addBackupExclusion through withAppDelegate', () => {
    withAppDelegate.mockClear();
    const result = withIosBackupExclusion({ modResults: { contents: sampleAppDelegate } });

    expect(withAppDelegate).toHaveBeenCalledTimes(1);
    expect(result.modResults.contents).toContain('excludeAppDataFromIosBackup()');
  });
});
