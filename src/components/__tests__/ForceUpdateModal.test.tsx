/**
 * WH-134 / WH-146: the force-update dialog of a build WITHOUT EXPO_PUBLIC_UPDATE_URL (the store build). Where the
 * Update app button goes, in order: (1) the facility's own download page on its local network, (2) the download page
 * of a neutral build (ForceUpdateModal.neutral.test.tsx), (3) the store. This file covers 1 and 3; the neutral build
 * reads its variable once at start-up, so it has its own file.
 */
import React from 'react';
import { Linking, Platform, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ForceUpdateModal } from '../ForceUpdateModal';
import { setLanguage } from '@/i18n';

let mockConfig: { publicConfig: Record<string, unknown> | null };
let mockServer: Record<string, unknown> | null;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ config: mockConfig, theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => mockServer,
  lanAddressOf: (server: { lan?: string } | null | undefined) => server?.lan ?? null,
}));

let tree: ReactTestRenderer | undefined;
let open: jest.SpyInstance;
let canOpen: jest.SpyInstance;
const PLAY = 'https://play.google.com/store/apps/details?id=com.example.warehousemanager';
const APP_STORE = 'https://apps.apple.com/app/id0000000000';

beforeEach(() => {
  mockConfig = { publicConfig: { minimumVersion: '2.0.0' } };
  mockServer = null;
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  open.mockClear(); // RN's jest setup may hand back the same mock each time
  canOpen.mockClear();
  Platform.OS = 'android';
  setLanguage('en');
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

async function render() {
  await act(async () => {
    tree = create(<ForceUpdateModal />);
  });
}
const button = (): ReactTestInstance =>
  tree!.root.find(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const iconNames = () => tree!.root.findAll(node => node.type === ('Icon' as never)).map(node => node.props.name);
const press = async () => {
  await act(async () => {
    await button().props.onPress();
  });
};

describe('when the dialog shows', () => {
  it('shows nothing while the config has not loaded, or while this build is new enough', async () => {
    mockConfig = { publicConfig: null };
    await render();
    expect(tree!.toJSON()).toBeNull();
    act(() => tree?.unmount());
    mockConfig = { publicConfig: { minimumVersion: '1.0.0' } };
    await render();
    expect(tree!.toJSON()).toBeNull();
  });

  it('shows both versions when this build is older than the minimum', async () => {
    await render();
    expect(texts()).toEqual(expect.arrayContaining(['Your version', '1.0.0', 'Required version', '2.0.0', 'Update app']));
  });
});

describe('the Update app button goes to the store when nothing else applies', () => {
  it('Android: the Play Store address from the server, with its hint and icon', async () => {
    mockConfig = { publicConfig: { minimumVersion: '2.0.0', storeUrls: { ios: APP_STORE, android: 'https://play.example.test/app' } } };
    await render();
    expect(button().props.accessibilityHint).toBe('Opens the Play Store');
    expect(iconNames()).toContain('google-play');
    await press();
    expect(open).toHaveBeenCalledWith('https://play.example.test/app');
  });

  it('Android without store addresses from the server: the default Play listing', async () => {
    await render();
    await press();
    expect(open).toHaveBeenCalledWith(PLAY);
  });

  it('iOS: the App Store, with its hint', async () => {
    Platform.OS = 'ios';
    await render();
    expect(button().props.accessibilityHint).toBe('Opens the App Store');
    await press();
    expect(open).toHaveBeenCalledWith(APP_STORE);
  });

  it('shows the hint in Gujarati in a Gujarati app', async () => {
    setLanguage('gu');
    await render();
    expect(button().props.accessibilityHint).toBe('Play Store ખોલે છે');
  });
});

describe('a facility on its local network only (WH-146) comes first', () => {
  it('opens the facility\'s own download page, with that hint and a note, never the store', async () => {
    mockServer = { kind: 'local', lan: 'http://192.168.1.50:8000' };
    mockConfig = { publicConfig: { minimumVersion: '2.0.0', storeUrls: { ios: APP_STORE, android: 'https://play.example.test/app' } } };
    await render();
    expect(button().props.accessibilityHint).toBe("Opens your facility's download page");
    expect(iconNames()).toContain('download');
    expect(texts()).toContain("Opens your facility's download page");
    await press();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('http://192.168.1.50:8000/app');
    expect(canOpen).not.toHaveBeenCalled();
  });

  it('a facility that is not local-only keeps the store, even though it has a warehouse network address', async () => {
    mockServer = { lan: 'http://192.168.1.50:8000' };
    await render();
    await press();
    expect(open).toHaveBeenCalledWith(PLAY);
  });
});
