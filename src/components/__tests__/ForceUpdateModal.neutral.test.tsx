/**
 * WH-134: the force-update dialog of the NEUTRAL build, which has no store listing. The release workflow sets
 * EXPO_PUBLIC_UPDATE_URL to the project's latest-release page; the hook reads it once at start-up, so it is set here
 * before the component is loaded. Order of the Update app button: (1) a local-only facility's own download page
 * (WH-146), (2) this page, (3) the store (ForceUpdateModal.test.tsx).
 */
import React from 'react';
import { Linking, Platform } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';

const DOWNLOAD_PAGE = 'https://github.com/example-org/rn-warehouse-template/releases/latest';
process.env.EXPO_PUBLIC_UPDATE_URL = `  ${DOWNLOAD_PAGE} `; // untrimmed on purpose: the hook trims it
const { ForceUpdateModal } = require('../ForceUpdateModal') as typeof import('../ForceUpdateModal');

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
const user = userEvent.setup({ delay: 0 });

beforeEach(() => {
  mockConfig = { publicConfig: { minimumVersion: '2.0.0', storeUrls: { ios: 'https://apps.apple.com/app/id1', android: 'https://play.example.test/app' } } };
  mockServer = null;
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  open.mockClear();
  canOpen.mockClear();
  Platform.OS = 'android';
  setLanguage('en');
});
afterEach(() => {
  jest.restoreAllMocks();
});

const button = () => screen.getByRole('button');
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
const press = async (calls = 1) => {
  await user.press(button());
  await waitFor(() => expect(open).toHaveBeenCalledTimes(calls));
};

describe('the neutral build (EXPO_PUBLIC_UPDATE_URL is set)', () => {
  it('Update app opens the download page, not a store, on Android and on iOS, even when the server names store addresses', async () => {
    for (const os of ['android', 'ios'] as const) {
      Platform.OS = os;
      await render(<ForceUpdateModal />);
      await press(os === 'android' ? 1 : 2);
      expect(open).toHaveBeenLastCalledWith(DOWNLOAD_PAGE);
      await screen.unmount();
    }
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens it even when the phone says it cannot open that address (no canOpenURL gate)', async () => {
    await render(<ForceUpdateModal />);
    await press();
    expect(open).toHaveBeenCalledWith(DOWNLOAD_PAGE);
  });

  it('reads "Opens the download page" with a download icon, in Gujarati too', async () => {
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', 'Opens the download page');
    expect(iconNames()).toContain('download');
    expect(iconNames()).not.toContain('google-play');
    await screen.unmount();
    setLanguage('gu');
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', 'ડાઉનલોડ પેજ ખોલે છે');
  });

  it('a facility on its local network only comes first: its own page, its hint and its note; the download page is not opened', async () => {
    mockServer = { kind: 'local', lan: 'http://192.168.1.50:8000' };
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', "Opens your facility's download page");
    expect(screen.getByText("Opens your facility's download page")).toBeOnTheScreen();
    await press();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('http://192.168.1.50:8000/app');
  });

  it('a local-only server that offers no warehouse network address falls through to the download page', async () => {
    mockServer = { kind: 'local' };
    await render(<ForceUpdateModal />);
    expect(button()).toHaveProp('accessibilityHint', 'Opens the download page');
    await press();
    expect(open).toHaveBeenCalledWith(DOWNLOAD_PAGE);
  });
});
