/**
 * WH-134 / WH-146: the force-update dialog of a build WITHOUT EXPO_PUBLIC_UPDATE_URL (the store build). Where the
 * Update app button goes, in order: (1) the facility's own download page on its local network, (2) the download page
 * of a neutral build (ForceUpdateModal.neutral.test.tsx), (3) the store. This file covers 1 and 3; the neutral build
 * reads its variable once at start-up, so it has its own file.
 */
import React from 'react';
import { Linking, Platform } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { ForceUpdateModal } from '../ForceUpdateModal';
import { setLanguage } from '@/i18n';

let mockConfig: { publicConfig: Record<string, unknown> | null };
let mockServer: Record<string, unknown> | null;
/** An element of the rendered tree, as the queries return it. */
type HostElement = ReturnType<typeof screen.getByRole>;

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

let open: jest.SpyInstance;
let canOpen: jest.SpyInstance;
const PLAY = 'https://play.google.com/store/apps/details?id=com.example.warehousemanager';
const APP_STORE = 'https://apps.apple.com/app/id0000000000';
const user = userEvent.setup({ delay: 0 });

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
  jest.restoreAllMocks();
});

const button = () => screen.getByRole('button', { name: 'Update app' });
/** The icons have no role or text: they are the mocked `Icon` elements, read from the rendered tree. */
const iconNames = () => {
  const names: string[] = [];
  const walk = (node: HostElement) => {
    if ((node.type as unknown) === 'Icon') names.push(node.props.name);
    node.children.forEach(child => typeof child !== 'string' && walk(child));
  };
  walk(screen.root!);
  return names;
};
const press = async () => {
  await user.press(button());
  await waitFor(() => expect(open).toHaveBeenCalled());
};

describe('when the dialog shows', () => {
  it('shows nothing while the config has not loaded, or while this build is new enough', async () => {
    mockConfig = { publicConfig: null };
    await render(<ForceUpdateModal />);
    expect(screen.toJSON()).toBeNull();
    await screen.unmount();
    mockConfig = { publicConfig: { minimumVersion: '1.0.0' } };
    await render(<ForceUpdateModal />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows both versions when this build is older than the minimum', async () => {
    await render(<ForceUpdateModal />);
    ['Your version', '1.0.0', 'Required version', '2.0.0', 'Update app'].forEach(text => expect(screen.getByText(text)).toBeOnTheScreen());
  });
});

describe('the Update app button goes to the store when nothing else applies', () => {
  it('Android: the Play Store address from the server, with its hint and icon', async () => {
    mockConfig = { publicConfig: { minimumVersion: '2.0.0', storeUrls: { ios: APP_STORE, android: 'https://play.example.test/app' } } };
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', 'Opens the Play Store');
    expect(iconNames()).toContain('google-play');
    await press();
    expect(open).toHaveBeenCalledWith('https://play.example.test/app');
  });

  it('Android without store addresses from the server: the default Play listing', async () => {
    await render(<ForceUpdateModal />);
    await press();
    expect(open).toHaveBeenCalledWith(PLAY);
  });

  it('iOS: the App Store, with its hint', async () => {
    Platform.OS = 'ios';
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', 'Opens the App Store');
    await press();
    expect(open).toHaveBeenCalledWith(APP_STORE);
  });

  it('shows the hint in Gujarati in a Gujarati app', async () => {
    setLanguage('gu');
    await render(<ForceUpdateModal />);
    expect(screen.getByRole('button')).toHaveProp('accessibilityHint', 'Play Store ખોલે છે');
  });
});

describe('a facility on its local network only (WH-146) comes first', () => {
  it('opens the facility\'s own download page, with that hint and a note, never the store', async () => {
    mockServer = { kind: 'local', lan: 'http://192.168.1.50:8000' };
    mockConfig = { publicConfig: { minimumVersion: '2.0.0', storeUrls: { ios: APP_STORE, android: 'https://play.example.test/app' } } };
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', "Opens your facility's download page");
    expect(iconNames()).toContain('download');
    expect(screen.getByText("Opens your facility's download page")).toBeOnTheScreen();
    await press();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('http://192.168.1.50:8000/app');
    expect(canOpen).not.toHaveBeenCalled();
  });

  it('a facility that is not local-only keeps the store, even though it has a warehouse network address', async () => {
    mockServer = { lan: 'http://192.168.1.50:8000' };
    await render(<ForceUpdateModal />);
    await press();
    expect(open).toHaveBeenCalledWith(PLAY);
  });
});
