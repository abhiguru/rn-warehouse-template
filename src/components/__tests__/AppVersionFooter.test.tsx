/**
 * SR-12: Settings and Profile showed "Management System v1.0", a literal, while the
 * app is 0.1.0. The footer now reads the version and build from the app's own
 * metadata (expo-constants), and Help adds a block of support details that can be
 * shared. Identifiers (version, build) keep their 0-9 digits in Gujarati.
 */
import React from 'react';
import { Platform, Share, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';

let mockConfig: Record<string, unknown> | null = null;
// What expo-constants' native module reports about the binary (iOS: CFBundleVersion; Android: nothing).
let mockPlatform: Record<string, unknown> | undefined;
let mockEnvironment = 'bare';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
    get platform() {
      return mockPlatform;
    },
    get executionEnvironment() {
      return mockEnvironment;
    },
  },
}));
// The installed binary's own version and build (expo-application); null where it has none.
let mockNative: { version: string | null; build: string | null } = { version: null, build: null };
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockNative.version;
  },
  get nativeBuildVersion() {
    return mockNative.build;
  },
}));

const mockServer = jest.fn();
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

import { AppVersionFooter, buildDiagnostics, getAppVersionInfo } from '../AppVersionFooter';

const ANDROID = { version: '2.3.4', android: { versionCode: 7 }, ios: { buildNumber: '3' } };
const FACILITY = {
  origin: 'https://north-cold.example.test',
  instanceId: 'instance-north',
  displayName: 'North',
  companyName: 'North Cold Store',
};

const originalOS = Platform.OS;
let share: jest.SpyInstance;

beforeEach(() => {
  mockConfig = ANDROID;
  mockPlatform = undefined;
  mockEnvironment = 'bare';
  mockNative = { version: null, build: null };
  mockServer.mockReturnValue(FACILITY);
  Platform.OS = 'android';
  setLanguage('en');
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

afterEach(() => {
  Platform.OS = originalOS;
  setLanguage('en');
  share.mockRestore();
});

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));

const byTestID = (tree: ReactTestRenderer, id: string) =>
  tree.root.findAll((node) => node.props.testID === id && typeof node.type !== 'string');

describe('getAppVersionInfo', () => {
  it('reads the Android build from versionCode', () => {
    expect(getAppVersionInfo()).toEqual({ version: '2.3.4', build: '7' });
  });

  it('reads the iOS build from buildNumber', () => {
    Platform.OS = 'ios';
    expect(getAppVersionInfo()).toEqual({ version: '2.3.4', build: '3' });
  });

  // SR-12 (L4): an EAS build with appVersionSource "remote" numbers the binary itself and may
  // leave the embedded config at app.json's build 1. The binary tells its own version and build.
  describe('the build of the installed app', () => {
    const EMBEDDED = { version: '0.0.9', android: { versionCode: 1 }, ios: { buildNumber: '1' } };

    it.each(['android', 'ios'])('on %s, the native version and build win over the embedded config', os => {
      Platform.OS = os as typeof Platform.OS;
      mockConfig = EMBEDDED;
      mockPlatform = { ios: { buildNumber: '7' } };
      mockNative = { version: '0.1.0', build: '42' };
      expect(getAppVersionInfo()).toEqual({ version: '0.1.0', build: '42' });
    });

    it('on Android, falls back to the embedded config when the native values are null', () => {
      mockConfig = EMBEDDED;
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '1' });
    });

    it('in Expo Go, ignores the native values (they are Expo Go\'s own) and reads the embedded config', () => {
      mockEnvironment = 'storeClient';
      mockConfig = EMBEDDED;
      mockNative = { version: '57.0.0', build: '300' };
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '1' });
    });

    it('on Android, the footer and the support details follow the native values', async () => {
      mockConfig = EMBEDDED;
      mockNative = { version: '0.1.0', build: '42' };
      expect(buildDiagnostics().split('\n')[1]).toBe('Version: 0.1.0 (build 42)');
      const tree = await render(<AppVersionFooter />);
      expect(texts(tree)).toContain('Management System v0.1.0 (build 42)');
    });

    it('on iOS without a native build from expo-application, takes CFBundleVersion from expo-constants', () => {
      Platform.OS = 'ios';
      mockConfig = EMBEDDED;
      mockPlatform = { ios: { buildNumber: '42' } };
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '42' });
    });

    it('on iOS, falls back to the embedded config when every native build is null or missing', () => {
      Platform.OS = 'ios';
      mockConfig = EMBEDDED;
      mockPlatform = { ios: { buildNumber: null } };
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '1' });
      mockPlatform = undefined;
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '1' });
    });

    it('on Android, never takes the iOS build of expo-constants', () => {
      mockConfig = EMBEDDED;
      mockPlatform = { android: {}, ios: { buildNumber: '42' } };
      expect(getAppVersionInfo()).toEqual({ version: '0.0.9', build: '1' });
    });
  });

  it('falls back to the app.json version and no build when the metadata is missing', () => {
    mockConfig = null;
    expect(getAppVersionInfo()).toEqual({ version: '0.1.0', build: null });
  });
});

describe('AppVersionFooter', () => {
  it('shows the installed version and build, never the old literal 1.0', async () => {
    const tree = await render(<AppVersionFooter />);
    const shown = texts(tree);
    expect(shown).toContain('Management System v2.3.4 (build 7)');
    expect(shown.join('\n')).not.toContain('v1.0');
    // Without `diagnostics` there is no support block and no share button.
    expect(byTestID(tree, 'app-diagnostics')).toHaveLength(0);
    expect(byTestID(tree, 'app-diagnostics-share')).toHaveLength(0);
  });

  it('shows the version alone when no build number is known', async () => {
    mockConfig = { version: '0.1.0' };
    const tree = await render(<AppVersionFooter />);
    expect(texts(tree)).toContain('Management System v0.1.0');
  });

  it('keeps 0-9 in the version and build in Gujarati', async () => {
    setLanguage('gu');
    const tree = await render(<AppVersionFooter />);
    const line = texts(tree).find((text) => text.includes('2.3.4'));
    expect(line).toBe('મેનેજમેન્ટ સિસ્ટમ v2.3.4 (બિલ્ડ 7)');
    expect(line).not.toMatch(/[૦-૯]/);
  });

  it('shares the support details on a long press of the version', async () => {
    const tree = await render(<AppVersionFooter />);
    const footer = byTestID(tree, 'app-version-footer')[0];
    await act(async () => {
      footer.props.onLongPress();
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0]).toEqual({ message: buildDiagnostics(), title: 'Details for support' });
  });

  it('with diagnostics, lists the details and shares them from the button', async () => {
    const tree = await render(<AppVersionFooter diagnostics />);
    const block = byTestID(tree, 'app-diagnostics')[0];
    const lines = block.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
    expect(lines).toEqual(
      expect.arrayContaining([
        'Details for support',
        'Version: 2.3.4 (build 7)',
        'Facility: North Cold Store',
        'Server: https://north-cold.example.test',
      ])
    );
    const button = byTestID(tree, 'app-diagnostics-share')[0];
    expect(button.props.accessibilityRole).toBe('button');
    await act(async () => {
      button.props.onPress();
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].message).toBe(buildDiagnostics());
  });
});

describe('buildDiagnostics', () => {
  it('names the app, version, build, phone system, facility and server, one per line', () => {
    const text = buildDiagnostics();
    const lines = text.split('\n');
    expect(lines[1]).toBe('Version: 2.3.4 (build 7)');
    expect(lines[2]).toMatch(/^Phone: Android /);
    expect(lines).toContain('Facility: North Cold Store');
    expect(lines).toContain('Server: https://north-cold.example.test');
  });

  it('uses the display name when the facility has no company name', () => {
    mockServer.mockReturnValue({ ...FACILITY, companyName: '' });
    expect(buildDiagnostics()).toContain('Facility: North');
  });

  it('says no facility is chosen, with no server line, when none is', () => {
    mockServer.mockReturnValue(null);
    const text = buildDiagnostics();
    expect(text).toContain('No facility is chosen on this phone.');
    expect(text).not.toMatch(/^Server:/m);
  });

  it('never carries a sign-in token, the instance id or anyone’s phone number', () => {
    const text = buildDiagnostics();
    expect(text).not.toContain('instance-north');
    expect(text).not.toMatch(/token|password|\d{10}/i);
  });

  it('writes the lines in Gujarati with the version digits unchanged', () => {
    setLanguage('gu');
    const text = buildDiagnostics();
    expect(text).toContain('2.3.4');
    expect(text).not.toMatch(/Version:|Facility:/);
    expect(text.split('\n')[1]).not.toMatch(/[૦-૯]/);
  });
});
