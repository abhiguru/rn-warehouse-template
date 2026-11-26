/**
 * WH-298 (Design offline-capture.md 1.2): the phone copy's status bar pads for the system status bar itself.
 *  - What is below it adds no top inset again: the zero inset of the safe-area context, and, because native views
 *    measure the window themselves, the tabs' SafeAreaView, the stack's native header, the "Update the app" and
 *    facility screens and the upgrading banner leave the top edge out.
 *  - A Modal covers the bar and the phone's status bar, so it keeps the window's own top inset.
 *  - With the feature off, both are as before.
 *
 * The real root layout, tabs layout, copy-feature switch, safe-area library and components run. The window's insets
 * come from a safe-area provider above the root, where Expo Router puts one. The router, the status bar itself, the
 * sync engine, the camera, the photo pager, the charts and the server are stand-ins.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/slices/authSlice';
import { verifySelectedOperator } from '@/config/operatorBootstrap';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { noteUpgradeAnswer, resetUpgradeNotice } from '@/config/upgradeNotice';
import { AppTooOldError, clearAppTooOld } from '@/config/appTooOld';
import AppTooOldScreen from '@/components/AppTooOldScreen';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { CameraModal } from '@/components/CameraModal';
import { DialogCard, DialogOverlay } from '@/components/DialogFrame';
import { ImageOverlay } from '@/components/ImageOverlay';
import OrderManagement from '@/components/OrderManagement';
import { ItemsSummaryBottomSheet } from '@/components/common/ItemsSummaryBottomSheet';
import { StockTrendChart } from '@/components/reports/StockTrendChart';
import { SensorHistoryChart } from '@/components/sensors/SensorHistoryChart';
import { GRNAutocompleteBottomSheet } from '@/features/dispatch/components/GRNAutocompleteBottomSheet';
import { GrnRateSheet } from '@/features/grn/rates/GrnRateSheet';
import { priceRows, type RateContext } from '@/features/grn/rates/grnRateModel';
import { GRNAutocomplete } from '@/features/invoice/components/GRNAutocomplete';
import { PaymentFormModal } from '@/features/payments/PaymentFormModal';
import { space } from '@/theme/tokens';
import { t } from '@/i18n';
import RootLayout from '../../../app/_layout';

/** The window's top inset. No spacing token comes near it, so a padding that holds it is recognisable. */
const TOP = 101;
const SERVER = { origin: 'https://north-cold.example.test', instanceId: 'instance-north' };

// ---------------------------------------------------------------------------
// The store: the real auth slice. The restore reads a stored session of `mockRole`.
// ---------------------------------------------------------------------------
const makeStore = () =>
  configureStore({ reducer: { auth: authReducer }, middleware: getDefault => getDefault({ serializableCheck: false }) });
let mockStore = makeStore();
let mockRole = 'staff';
jest.mock('@/store', () => ({
  get store() {
    return mockStore;
  },
  persistor: {},
}));
jest.mock('react-redux', () => ({ Provider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector({ ...mockStore.getState(), theme: { preference: 'light', brand: 'orange' } })),
  };
});
jest.mock('@/config/supabaseConfig', () => ({
  initializeSupabase: jest.fn(),
  clearPendingEnrollment: jest.fn(async () => {}),
  hasActiveOperatorMutation: jest.fn(() => false),
  getSupabaseClient: () => ({}),
  getAuthenticatedClient: jest.fn(async () => ({ rpc: jest.fn(async () => ({ data: null, error: null })) })),
  getSessionIdentity: jest.fn(async () => null),
  getStoredToken: jest.fn(async () => ({
    isValid: true, type: 'jwt', authToken: 'stored-access', refreshToken: 'stored-refresh', expiresAt: Date.now() + 3600 * 1000,
  })),
  getCachedUserProfile: jest.fn(async () => ({ id: 'profile-a', auth_user_id: 'user-a', name: 'Asha Fictional', role: mockRole })),
  reloadUserProfile: jest.fn(async () => null),
  ensureValidTokens: jest.fn(async () => true),
  cacheUserProfile: jest.fn(async () => {}),
  clearStoredTokens: jest.fn(async () => {}),
  refreshCustomJWT: jest.fn(async () => null),
  signOut: jest.fn(async () => ({ success: true })),
  beginOperatorSwitch: jest.fn(), endOperatorSwitch: jest.fn(),
}));
jest.mock('@/store/slices/configSlice', () => ({
  fetchFullConfig: jest.fn(() => () => ({ unwrap: async () => {} })),
  clearFullConfig: jest.fn(() => ({ type: 'config/clearFullConfig' })),
}));
jest.mock('@/services/user-core-service', () => ({ getUserByIdDirect: jest.fn() }));
jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn() } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn() } }));
jest.mock('@/services/user-service', () => ({ UserService: { deleteAccount: jest.fn() } }));
jest.mock('@/utils/otpRateLimiter', () => ({ clearAllRateLimits: jest.fn() }));
jest.mock('@/utils/secureSessionMarker', () => ({ extendSessionMarker: jest.fn(async () => {}) }));
jest.mock('@/services/configService', () => ({
  __esModule: true,
  default: { clearCache: jest.fn(), clearAuthenticatedCache: jest.fn(), refreshPublicConfig: jest.fn() },
}));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@/store/loadAuthSlice', () => ({ loadAuthSlice: async () => require('@/store/slices/authSlice') }));

// ---------------------------------------------------------------------------
// The router: the stack records the options it is given and shows `mockRoute`; "(tabs)" mounts the real tabs layout,
// any other route draws `mockScreen`, under whatever the real root puts around the stack.
// ---------------------------------------------------------------------------
let mockRoute = 'settings';
let mockScreen: () => React.ReactNode = () => null;
let mockScreenOptions: Record<string, unknown> | undefined;
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const TabsLayout = require('../../../app/(tabs)/_layout').default;
  const Screen = () => mockScreen() as React.ReactElement;
  const Stack = ({ children, screenOptions }: { children: React.ReactNode; screenOptions: Record<string, unknown> }) => {
    mockScreenOptions = screenOptions;
    return React.createElement(View, null, children);
  };
  Stack.Screen = ({ name }: { name: string }) => {
    if (name !== mockRoute) return null;
    return React.createElement(name === '(tabs)' ? TabsLayout : Screen);
  };
  const Tabs = ({ children }: { children: React.ReactNode }) => React.createElement(View, { testID: 'protected-tabs' }, children);
  Tabs.Screen = () => null;
  const router = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
  return {
    Stack,
    Tabs,
    router,
    useRouter: () => router,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ---------------------------------------------------------------------------
// The phone copy: its bar and its sync engine are stand-ins; the switch that decides it is on is real.
// ---------------------------------------------------------------------------
jest.mock('@/components/OfflineStatusBar', () => {
  const { Text } = require('react-native');
  return { OfflineStatusBar: () => <Text>phone copy bar</Text> };
});
jest.mock('@/features/phone-copy/components/PhoneCopyLifecycle', () => ({ PhoneCopyLifecycle: () => null }));
jest.mock('@/features/phone-copy/copyDb', () => ({ eraseCopy: jest.fn(async () => {}) }));

// ---------------------------------------------------------------------------
// Everything else the root draws, as in RootIntoTabs.test.tsx.
// ---------------------------------------------------------------------------
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useIsOffline: () => mockOffline,
  useNetworkStatus: () => ({ isConnected: true }),
}));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/centralSession', () => ({ restoreCentralSession: jest.fn(async () => {}), retryCentralRestoreIfNeeded: jest.fn() }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left'), switchOperatorServer: jest.fn() }));
jest.mock('redux-persist/integration/react', () => ({ PersistGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-paper', () => ({
  PaperProvider: ({ children }: { children: React.ReactNode }) => children,
  MD3LightTheme: { colors: {} },
  MD3DarkTheme: { colors: {} },
  Surface: 'Surface',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setStyle: jest.fn() }));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  const styles = new Map<unknown, unknown>();
  return {
    useTheme: () => ({ brand: 'orange', resolvedMode: 'light', tokens, isDarkMode: false }),
    useTokens: () => tokens,
    useThemedStyles: (factory: (t: unknown) => unknown) => {
      if (!styles.has(factory)) styles.set(factory, factory(tokens));
      return styles.get(factory);
    },
  };
});
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: () => 0 } }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), Sentry: { wrap: (c: unknown) => c },
  setSentryUser: jest.fn(), clearSentryUser: jest.fn(),
}));
jest.mock('@/components/ConfigErrorScreen', () => ({ __esModule: true, default: () => null }));
// The root's crash guard lets everything through; the module's buttons (used by the "Update the app" screen) are real.
jest.mock('@/components/ErrorBoundary', () => ({
  ...jest.requireActual('@/components/ErrorBoundary'),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
// The native photo pager: its header and footer, which the app draws, are shown.
jest.mock('react-native-image-viewing', () => {
  const ReactMock = require('react');
  return (props: { HeaderComponent: React.ComponentType<{ imageIndex: number }>; FooterComponent: React.ComponentType<{ imageIndex: number }> }) =>
    ReactMock.createElement(
      'ImageViewing',
      null,
      ReactMock.createElement(props.HeaderComponent, { imageIndex: 0 }),
      ReactMock.createElement(props.FooterComponent, { imageIndex: 0 })
    );
});
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/AlertHost', () => ({ AlertHost: () => null }));
jest.mock('@/components/AppStateManager', () => ({ AppStateManager: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/FioriTabBar', () => () => null);
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));
jest.mock('@/hooks/useColdStartDeepLink', () => ({ useColdStartDeepLink: jest.fn() }));
jest.mock('@/hooks/useSessionGenerationGuard', () => ({ useSessionGenerationGuard: jest.fn() }));
jest.mock('@/i18n/useAppLanguage', () => ({ useAppLanguage: () => ({ language: 'en', preference: 'system', setPreference: jest.fn() }) }));
jest.mock('@/i18n/useProfileLanguage', () => ({ useProfileLanguage: jest.fn() }));
jest.mock('@/navigation/RouteGuard', () => ({
  GuardedScreen: ({ children }: { children: React.ReactNode }) => children,
  useRootRouteGuard: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({
  onOperatorServerChange: jest.fn(() => () => undefined),
  getActiveOperatorServer: () => ({ origin: 'https://north-cold.example.test', instanceId: 'instance-north' }),
  discoverOperator: jest.fn(), parseOperatorOrigin: jest.fn(),
}));
jest.mock('@/config/lanCheck', () => ({ startDailyLanCheck: jest.fn(() => jest.fn()) }));
jest.mock('@/config/netReachability', () => ({ installNetReachability: jest.fn(), applyNetReachability: jest.fn() }));
jest.mock('@/config/operatorBootstrap', () => ({ verifySelectedOperator: jest.fn(), verifyForegroundOperator: jest.fn() }));
jest.mock('@/config/operatorResume', () => ({
  operatorResumeGate: { installVerifier: jest.fn(() => () => undefined), suspend: jest.fn(), onVerified: jest.fn(() => () => undefined) },
}));
jest.mock('@/config/resumeLifecycle', () => ({ createResumeLifecycle: jest.fn(() => jest.fn()) }));
jest.mock('@/config/nativeHandoff', () => ({
  isNativeHandoffActive: jest.fn(() => false),
  withNativeHandoff: (run: () => unknown) => run(),
}));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));

// ---------------------------------------------------------------------------
// What the covering components need: native modules and the server.
// ---------------------------------------------------------------------------
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
let mockCameraGranted = true;
jest.mock('expo-camera', () => ({
  CameraView: ({ children }: { children?: React.ReactNode }) => children ?? null,
  useCameraPermissions: () => [{ granted: mockCameraGranted }, jest.fn()],
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { camera: 'camera', grnForm: 'grn-form', dispatchForm: 'dispatch-form' },
  registerLocalPhoto: jest.fn(async () => true),
  releaseLocalPhotos: jest.fn(async () => 0),
  sweepLocalPhotoFiles: jest.fn(async () => 0),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getInvoiceableGrns: jest.fn(async () => ({ success: true, data: [] })),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({
  searchGRNNumbers: jest.fn(async () => []),
  getGRNPrefixesWithStock: jest.fn(async () => []),
  getCustomerGRNsWithStock: jest.fn(async () => []),
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrCreateOrder: jest.fn(), getCustomerOrder: jest.fn() } }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(async () => []) } }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: jest.fn() }));
jest.mock('@/components/RecentDispatchesSection', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CustomerOrderSummary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ItemCatalogBrowser', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/OrderItemCard', () => ({ __esModule: true, default: () => null }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Node = NonNullable<typeof screen.root>;
const hosts = (match: (node: Node) => boolean): Node[] => screen.container.queryAll(match) as Node[];
const hostsOfType = (type: string) => hosts(node => node.type === type);
const turn = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

/** The window's insets, in the provider Expo Router puts above the root layout on a phone. */
const WINDOW = { insets: { top: TOP, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 393, height: 851 } };
async function start() {
  await render(
    <SafeAreaProvider initialMetrics={WINDOW}>
      <RootLayout />
    </SafeAreaProvider>
  );
  for (let i = 0; i < 5; i++) await turn();
}
const facilitySync = (sync: boolean) => setFacilityCapabilities(SERVER, { sync });

/** Draws a screen of the root stack: the element, beside a line that says which top inset a screen there is given. */
function ScreenInset() {
  return <Text>{`screen top inset ${useSafeAreaInsets().top}`}</Text>;
}
async function showOnStack(element: React.ReactNode) {
  mockScreen = () => (
    <>
      <ScreenInset />
      {element}
    </>
  );
  await start();
}
/** The state the test means to be in was reached: the bar is drawn (or not) and screens are told the matching inset. */
function expectBar(shown: boolean) {
  if (shown) expect(screen.getByText('phone copy bar')).toBeOnTheScreen();
  else expect(screen.queryByText('phone copy bar')).not.toBeOnTheScreen();
  expect(screen.getByText(`screen top inset ${shown ? 0 : TOP}`, { includeHiddenElements: true })).toBeOnTheScreen();
}
/** Every top padding or margin on the screen that holds the window's top inset. */
const topSpacings = () =>
  hosts(() => true)
    .flatMap(node => {
      const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as { paddingTop?: unknown; marginTop?: unknown };
      return [style.paddingTop, style.marginTop];
    })
    .filter((value): value is number => typeof value === 'number' && value >= TOP);
/** The edges each native SafeAreaView on the screen is asked to pad. */
const safeAreaEdges = () => hostsOfType('RNCSafeAreaView').map(node => node.props.edges);
const ALL_EDGES = { top: 'additive', right: 'additive', bottom: 'additive', left: 'additive' };
const NO_TOP = { top: 'off', right: 'additive', bottom: 'additive', left: 'additive' };
const TABS_TOP = { top: 'additive', right: 'off', bottom: 'off', left: 'off' };
const TABS_NONE = { top: 'off', right: 'off', bottom: 'off', left: 'off' };
const headerNativeProps = () => mockScreenOptions?.unstable_nativeProps;

// A development build holds the splash for three seconds (app/_layout.tsx).
const originalDev = (global as { __DEV__?: boolean }).__DEV__;
beforeAll(() => { (global as { __DEV__?: boolean }).__DEV__ = false; });
afterAll(() => { (global as { __DEV__?: boolean }).__DEV__ = originalDev; });
beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeStore();
  mockRole = 'staff';
  mockRoute = 'settings';
  mockScreen = () => null;
  mockScreenOptions = undefined;
  mockOffline = false;
  mockCameraGranted = true;
  facilitySync(true);
  jest.mocked(verifySelectedOperator).mockResolvedValue({
    kind: 'verified',
    discovery: { config: { supabaseUrl: SERVER.origin, anonKey: 'public-test-key' } },
  } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  resetFacilityCapabilities();
  resetUpgradeNotice();
  clearAppTooOld();
  jest.restoreAllMocks();
});

/** The feature off in each way it can be: the facility has no phone copy, or the person's role has none. */
const FEATURE_OFF: [string, () => void][] = [
  ['the facility has no phone copy', () => facilitySync(false)],
  ['a customer account', () => { mockRole = 'customer'; }],
];

describe('the tabs: no second top inset under the bar', () => {
  beforeEach(() => {
    mockRoute = '(tabs)';
  });

  it('with the bar shown, the tabs SafeAreaView leaves the top edge to the bar', async () => {
    await start();
    expect(screen.getByText('phone copy bar')).toBeOnTheScreen();
    expect(screen.getByTestId('protected-tabs')).toBeOnTheScreen();
    expect(safeAreaEdges()).toEqual([TABS_NONE]);
  });

  it.each(FEATURE_OFF)('without the bar (%s), the tabs pad the top edge as before', async (_name, off) => {
    off();
    await start();
    expect(screen.queryByText('phone copy bar')).not.toBeOnTheScreen();
    expect(safeAreaEdges()).toEqual([TABS_TOP]);
  });

  it('offline on a facility without the phone copy, the tabs ask for the top edge as before', async () => {
    facilitySync(false);
    mockOffline = true;
    await start();
    expect(safeAreaEdges()).toEqual([TABS_TOP]);
    expect(headerNativeProps()).toBeUndefined();
  });

  it('follows the feature while the app is open: turned off, the top edge comes back', async () => {
    await start();
    expect(safeAreaEdges()).toEqual([TABS_NONE]);
    await act(async () => { facilitySync(false); });
    expect(screen.queryByText('phone copy bar')).not.toBeOnTheScreen();
    expect(safeAreaEdges()).toEqual([TABS_TOP]);
    expect(headerNativeProps()).toBeUndefined();
  });
});

describe("the stack's native header", () => {
  it('with the bar shown, is told not to apply the top inset', async () => {
    await showOnStack(null);
    expectBar(true);
    expect(headerNativeProps()).toEqual({ headerConfig: { disableTopInsetApplication: true } });
  });

  it.each(FEATURE_OFF)('without the bar (%s), is given no native override', async (_name, off) => {
    off();
    await showOnStack(null);
    expectBar(false);
    expect(headerNativeProps()).toBeUndefined();
  });
});

describe('full screens under the bar', () => {
  const screens: [string, () => React.ReactElement, string][] = [
    ['"Update the app"', () => <AppTooOldScreen minimum="0.7.0" current="0.6.0" onClose={jest.fn()} />, 'Update the app'],
    ['facility address', () => <OperatorServerSelection />, t('auth.server.help')],
  ];

  describe.each(screens)('the %s screen', (_name, element, text) => {
    it('with the bar shown, leaves out the top edge and keeps the other three', async () => {
      await showOnStack(element());
      expectBar(true);
      expect(screen.getByText(text)).toBeOnTheScreen();
      expect(safeAreaEdges()).toEqual([NO_TOP]);
    });

    it('with the feature off, pads all four edges as before', async () => {
      facilitySync(false);
      await showOnStack(element());
      expectBar(false);
      expect(screen.getByText(text)).toBeOnTheScreen();
      expect(safeAreaEdges()).toEqual([ALL_EDGES]);
    });
  });

  it('"Update the app" shown in place of the whole app keeps its top edge, with the feature on', async () => {
    // The start-up check clears the notice and then learns it again, as a version refusal does.
    jest.mocked(verifySelectedOperator).mockRejectedValue(new AppTooOldError('Too old', '0.7.0', '0.6.0'));
    await start();
    expect(screen.getByText('Update the app')).toBeOnTheScreen();
    expect(safeAreaEdges()).toEqual([ALL_EDGES]);
  });

  it('a SafeAreaView inside the camera Modal (permission page) keeps its top edge under the bar', async () => {
    mockCameraGranted = false;
    await showOnStack(<CameraModal visible onClose={jest.fn()} onCapture={jest.fn()} />);
    expectBar(true);
    expect(safeAreaEdges()).toEqual([ALL_EDGES]);
  });
});

describe('the upgrading banner', () => {
  const MESSAGE = "The facility's server is being updated. Try again in a few minutes.";
  const upgrading = () =>
    act(async () => {
      await noteUpgradeAnswer({
        status: 503,
        headers: { get: () => '120' },
        clone() { return { json: async () => ({ code: 'upgrading' }) }; },
      } as unknown as Response);
    });
  /** The top padding of the banner: of the alert that holds the message. */
  const bannerTop = () => {
    let node: Node | null = screen.getByText(MESSAGE);
    while (node && node.props.accessibilityRole !== 'alert') node = node.parent as Node | null;
    return (StyleSheet.flatten(node!.props.style as never) as { paddingTop: number }).paddingTop;
  };

  it('below the bar, adds no top inset', async () => {
    await showOnStack(null);
    await upgrading();
    expectBar(true);
    expect(bannerTop()).toBe(0);
  });

  it('without the bar and online, pads for the status bar as before', async () => {
    facilitySync(false);
    await showOnStack(null);
    await upgrading();
    expect(bannerTop()).toBe(TOP);
  });

  it('below the offline banner (feature off), adds no top inset, as before', async () => {
    facilitySync(false);
    mockOffline = true;
    await showOnStack(null);
    await upgrading();
    expect(bannerTop()).toBe(0);
  });
});

describe('Modals cover the status bar: they keep the real top inset', () => {
  const ctx: RateContext = { customerId: 'cust-a', day: '2026-10-12', priceType: 'monthly' };
  const rateInput = { rates: [], ctx, standard: null };
  const rateRow = priceRows([{ key: 'gur|10', item_id: 'gur', item_name: 'Fictional Gur', weight: 10 }], { rates: [], ctx, grnRates: [], changes: [] })[0];
  const press = async (name: string | RegExp) => {
    await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name }));
  };
  const nothing = async () => {};

  /** [component, element, what opens it, text or label that shows it is open, the top spacings expected] */
  const modals: [string, () => React.ReactElement, () => Promise<void>, () => unknown, number[]][] = [
    [
      'the payment form',
      () => <PaymentFormModal visible invoiceId="invoice-fictional" invoiceNumber="FXI0001" editing={null} onClose={jest.fn()} onDone={jest.fn()} onRefused={jest.fn()} />,
      nothing,
      () => screen.getByTestId('payment-form-close'),
      [TOP],
    ],
    [
      'the GRN rate sheet',
      () => <GrnRateSheet visible onClose={jest.fn()} onSave={jest.fn()} row={rateRow} input={rateInput} customerName="Fictional Traders" priceTypeText="Monthly" grnNumber="A101" />,
      nothing,
      () => screen.getByTestId('rate-screen'),
      [TOP],
    ],
    [
      'a dialog that keeps clear of the system bars',
      () => (
        <DialogOverlay safeArea>
          <DialogCard><Text>Dialog body</Text></DialogCard>
        </DialogOverlay>
      ),
      nothing,
      () => screen.getByText('Dialog body'),
      [TOP + space.lg],
    ],
    [
      'the photo viewer',
      () => <ImageOverlay visible images={[{ imageUrl: 'https://north-cold.example.test/photo-1.jpg' }] as never} onClose={jest.fn()} />,
      nothing,
      () => screen.getByRole('button', { name: t('components.imageOverlay.close') }),
      [TOP + space.sm],
    ],
    [
      'the camera',
      () => <CameraModal visible onClose={jest.fn()} onCapture={jest.fn()} />,
      nothing,
      () => screen.getByRole('button', { name: 'Close camera' }),
      [TOP + space.sm],
    ],
    [
      'the full-screen stock trend',
      () => (
        <StockTrendChart
          trends={[
            { month: '2026-09', grn_count: 0, grn_quantity: 0, dispatch_count: 0, dispatch_quantity: 0, invoice_amount: 0, stock_level_end: 180 },
            { month: '2026-10', grn_count: 0, grn_quantity: 0, dispatch_count: 0, dispatch_quantity: 0, invoice_amount: 0, stock_level_end: 150 },
          ]}
        />
      ),
      () => press(/^Stock level trend\. /),
      () => screen.getByRole('radio', { name: 'Table of values' }),
      [TOP + space.xs],
    ],
    [
      'the full-screen sensor chart',
      () => (
        <SensorHistoryChart
          readings={[
            { timestamp: '2026-10-01T04:00:00Z', temperature: 3, humidity: 84 },
            { timestamp: '2026-10-02T04:00:00Z', temperature: 4, humidity: 85 },
          ]}
          aggregationInterval="1 hour"
          periodDays={7}
        />
      ),
      () => press(new RegExp(`^${t('sensors.chart.title')}`)),
      () => screen.getByRole('button', { name: t('sensors.chart.close') }),
      [TOP + space.xs],
    ],
    [
      'the invoice GRN search',
      () => <GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} currentValue={null} />,
      nothing,
      () => screen.getByRole('button', { name: 'Close' }),
      [TOP + space.lg],
    ],
    [
      'the dispatch GRN picker',
      () => <GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} />,
      nothing,
      () => screen.getByText('Choose GRN'),
      [TOP + space.sm],
    ],
    [
      'the items summary sheet',
      () => (
        <ItemsSummaryBottomSheet<{ id: string }>
          isVisible
          onClose={jest.fn()}
          items={[]}
          getItemKey={item => item.id}
          getItemName={item => item.id}
          renderItem={() => null}
          getTotals={() => []}
          onDeleteItem={jest.fn()}
          emptyTitle="Nothing added yet"
        />
      ),
      nothing,
      () => screen.getByText('Nothing added yet'),
      [TOP],
    ],
    [
      "the order screen's customer search",
      () => <OrderManagement />,
      nothing,
      () => screen.getByLabelText(t('customers.search.placeholder')),
      [TOP + space.xxl],
    ],
  ];

  describe.each(modals)('%s', (_name, element, open, opened, expected) => {
    it('with the bar shown, is padded by the window top inset although the screen under it is given none', async () => {
      await showOnStack(element());
      expectBar(true);
      await open();
      expect(opened()).toBeOnTheScreen();
      expect(topSpacings()).toEqual(expected);
    });

    it('with the feature off, is padded by the window top inset as before', async () => {
      facilitySync(false);
      await showOnStack(element());
      expectBar(false);
      await open();
      expect(opened()).toBeOnTheScreen();
      expect(topSpacings()).toEqual(expected);
    });
  });
});
