const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@expo/config-plugins', () => ({
  withDangerousMod: jest.fn(),
}));

const { withDangerousMod } = require('@expo/config-plugins');
const withIosLinkingManager = require('./with-ios-linking-manager');
const {
  bridgeIosLinkingManager,
  hasSceneDelegateUrlForwarding,
} = withIosLinkingManager;

describe('with-ios-linking-manager', () => {
  const generatedHandler = `  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }`;

  const sdk58AppDelegate = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;

  const sdk58SceneDelegate = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}`;

  beforeEach(() => {
    withDangerousMod.mockClear();
  });

  it('invokes both iOS URL handlers before combining their results', () => {
    const updated = bridgeIosLinkingManager(generatedHandler);

    expect(updated).toContain(
      'let expoHandled = super.application(app, open: url, options: options)'
    );
    expect(updated).toContain(
      'let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)'
    );
    expect(updated).toContain('return expoHandled || reactNativeHandled');
    expect(updated).not.toContain(
      'return super.application(app, open: url, options: options) || RCTLinkingManager.application'
    );
  });

  it('is idempotent', () => {
    const updated = bridgeIosLinkingManager(generatedHandler);

    expect(bridgeIosLinkingManager(updated)).toBe(updated);
  });

  it('fails loudly when the generated AppDelegate shape changes', () => {
    expect(() => bridgeIosLinkingManager('class AppDelegate {}')).toThrow(
      'expected AppDelegate pattern was not found'
    );
  });

  it('accepts the SDK 58 ExpoAppDelegate and ExpoAppSceneDelegate shape as a verified no-op', () => {
    expect(hasSceneDelegateUrlForwarding(sdk58AppDelegate, sdk58SceneDelegate)).toBe(true);
    expect(bridgeIosLinkingManager(sdk58AppDelegate, sdk58SceneDelegate)).toBe(sdk58AppDelegate);
  });

  it('fails closed when SceneDelegate.swift is missing on an SDK 58 AppDelegate', () => {
    expect(hasSceneDelegateUrlForwarding(sdk58AppDelegate, undefined)).toBe(false);
    expect(() => bridgeIosLinkingManager(sdk58AppDelegate, undefined)).toThrow(
      'expected AppDelegate pattern was not found'
    );
  });

  it('fails closed when SceneDelegate no longer inherits from ExpoAppSceneDelegate', () => {
    const driftedSceneDelegate = `import UIKit

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
}`;

    expect(hasSceneDelegateUrlForwarding(sdk58AppDelegate, driftedSceneDelegate)).toBe(false);
    expect(() => bridgeIosLinkingManager(sdk58AppDelegate, driftedSceneDelegate)).toThrow(
      'SceneDelegate must inherit from ExpoAppSceneDelegate without overriding scene(_:openURLContexts:), and AppDelegate must inherit from ExpoAppDelegate.'
    );
  });

  it('fails closed when SceneDelegate overrides scene(_:openURLContexts:)', () => {
    const overriddenSceneDelegate = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(
    _ scene: UIScene,
    openURLContexts URLContexts: Set<UIOpenURLContext>
  ) {
    super.scene(scene, openURLContexts: URLContexts)
  }
}`;

    expect(hasSceneDelegateUrlForwarding(sdk58AppDelegate, overriddenSceneDelegate)).toBe(false);
    expect(() => bridgeIosLinkingManager(sdk58AppDelegate, overriddenSceneDelegate)).toThrow(
      'SceneDelegate must inherit from ExpoAppSceneDelegate without overriding scene(_:openURLContexts:), and AppDelegate must inherit from ExpoAppDelegate.'
    );
  });

  it('fails closed when AppDelegate no longer inherits from ExpoAppDelegate', () => {
    const driftedAppDelegate = `import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
}`;

    expect(hasSceneDelegateUrlForwarding(driftedAppDelegate, sdk58SceneDelegate)).toBe(false);
    expect(() => bridgeIosLinkingManager(driftedAppDelegate, sdk58SceneDelegate)).toThrow(
      'SceneDelegate must inherit from ExpoAppSceneDelegate without overriding scene(_:openURLContexts:), and AppDelegate must inherit from ExpoAppDelegate.'
    );
  });

  it('fails closed when AppDelegate overrides application(_:open:url:options:) with an unexpected body', () => {
    const overriddenAppDelegate = `${sdk58AppDelegate.slice(0, -1)}
  public override func application(
    _ app: UIApplication,
    open url: Foundation.URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }
}`;

    expect(hasSceneDelegateUrlForwarding(overriddenAppDelegate, sdk58SceneDelegate)).toBe(false);
    expect(() => bridgeIosLinkingManager(overriddenAppDelegate, sdk58SceneDelegate)).toThrow(
      'expected AppDelegate pattern was not found'
    );
  });

  it('still patches legacy SDK <= 57 short-circuit handlers even if a SceneDelegate file exists', () => {
    const updated = bridgeIosLinkingManager(generatedHandler, sdk58SceneDelegate);

    expect(updated).toContain(
      'let expoHandled = super.application(app, open: url, options: options)'
    );
    expect(updated).toContain(
      'let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)'
    );
    expect(updated).toContain('return expoHandled || reactNativeHandled');
  });

  describe('withIosLinkingManager dangerous mod', () => {
    let tempRoot;

    beforeEach(() => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wh376-linking-'));
    });

    afterEach(() => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    function runDangerousMod(projectName) {
      withIosLinkingManager({ name: projectName });
      expect(withDangerousMod).toHaveBeenCalledTimes(1);
      const [, [platform, mod]] = withDangerousMod.mock.calls[0];
      expect(platform).toBe('ios');
      return mod({
        modRequest: {
          platformProjectRoot: tempRoot,
          projectName,
        },
      });
    }

    it('reads SceneDelegate.swift alongside AppDelegate.swift and leaves SDK 58 files untouched', async () => {
      const projectDir = path.join(tempRoot, 'WarehouseManager');
      fs.mkdirSync(projectDir, { recursive: true });
      const appDelegatePath = path.join(projectDir, 'AppDelegate.swift');
      const sceneDelegatePath = path.join(projectDir, 'SceneDelegate.swift');
      fs.writeFileSync(appDelegatePath, sdk58AppDelegate);
      fs.writeFileSync(sceneDelegatePath, sdk58SceneDelegate);

      const writeSpy = jest.spyOn(fs, 'writeFileSync');
      try {
        await runDangerousMod('WarehouseManager');
        expect(writeSpy).not.toHaveBeenCalled();
        expect(fs.readFileSync(appDelegatePath, 'utf8')).toBe(sdk58AppDelegate);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('writes the bridged handler for legacy AppDelegate without SceneDelegate.swift', async () => {
      const projectDir = path.join(tempRoot, 'WarehouseManager');
      fs.mkdirSync(projectDir, { recursive: true });
      const appDelegatePath = path.join(projectDir, 'AppDelegate.swift');
      fs.writeFileSync(appDelegatePath, generatedHandler);

      await runDangerousMod('WarehouseManager');

      const written = fs.readFileSync(appDelegatePath, 'utf8');
      expect(written).toContain(
        'let expoHandled = super.application(app, open: url, options: options)'
      );
      expect(written).toContain('return expoHandled || reactNativeHandled');
    });

    it('throws from the mod when SceneDelegate.swift drifts', async () => {
      const projectDir = path.join(tempRoot, 'WarehouseManager');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'AppDelegate.swift'), sdk58AppDelegate);
      fs.writeFileSync(
        path.join(projectDir, 'SceneDelegate.swift'),
        'class SceneDelegate: UIResponder {}'
      );

      await expect(runDangerousMod('WarehouseManager')).rejects.toThrow(
        'SceneDelegate must inherit from ExpoAppSceneDelegate without overriding scene(_:openURLContexts:), and AppDelegate must inherit from ExpoAppDelegate.'
      );
    });
  });
});
