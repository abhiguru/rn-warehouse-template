/**
 * Review 2026-10-13 R2: a start of the app restores the session once.
 *
 * The root (app/_layout.tsx) restores the session (initializeAuth) and shows its
 * spinner until that settles; only then does the stack, and with it the tabs
 * layout (app/(tabs)/_layout.tsx), mount. The tabs layout used to restore the
 * session a second time and show a second spinner. Here the real root and the
 * real tabs layout run against a real auth slice and the real initializeAuth
 * thunk; the secure store, the server and the router are mocked. Restores are
 * counted by their pending actions.
 *
 * The stored session is read by a mock that answers only as many reads as a
 * test allows and holds every later one: a second restore at the start would
 * keep the tabs on a spinner, so a test can see it.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { verifySelectedOperator } from '@/config/operatorBootstrap';
import { onOperatorServerChange } from '@/config/operatorServer';
import { applyNetReachability, installNetReachability } from '@/config/netReachability';
import { useColdStartDeepLink } from '@/hooks/useColdStartDeepLink';
import { t } from '@/i18n';
import RootLayout from '../../../app/_layout';

// ---------------------------------------------------------------------------
// The store: the real auth slice, with every restore counted.
// ---------------------------------------------------------------------------
const mockRestores: string[] = [];
const countRestores: Middleware = () => next => action => {
  if ((action as { type?: string }).type === 'auth/initialize/pending') mockRestores.push('pending');
  return next(action);
};
const makeStore = () =>
  configureStore({
    reducer: { auth: authReducer },
    middleware: getDefault => getDefault({ serializableCheck: false }).concat(countRestores),
  });
let mockStore = makeStore();
jest.mock('@/store', () => ({
  get store() {
    return mockStore;
  },
  persistor: {},
}));
// react-redux ships ES modules that this Jest setup does not transform: the
// hooks read the same store through useSyncExternalStore.
jest.mock('react-redux', () => ({ Provider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: ReturnType<typeof mockStore.getState>) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});

// ---------------------------------------------------------------------------
// The stored session and the profile cache, as the restore reads them.
// ---------------------------------------------------------------------------
const profileA = { id: 'profile-a', auth_user_id: 'user-a', name: 'Asha Fictional', role: 'customer' };
const profileB = { id: 'profile-b', auth_user_id: 'user-b', name: 'Bhavin Sample', role: 'staff' };
let mockStored: { isValid: boolean; type?: 'jwt'; authToken?: string; refreshToken?: string; expiresAt?: number };
let mockProfile: unknown;
let mockReadsAnswered = 0;
/** How many reads of the stored session are answered at once; later ones are held. */
let mockReadsToAnswer = 1;
/** Held reads, answered (with what is stored then) by releaseHeldReads(). */
const mockHeld: Array<() => void> = [];
jest.mock('@/config/supabaseConfig', () => ({
  initializeSupabase: jest.fn(),
  clearPendingEnrollment: jest.fn(async () => {}),
  hasActiveOperatorMutation: jest.fn(() => false),
  getSupabaseClient: () => ({}),
  getStoredToken: jest.fn(() => {
    if (mockReadsAnswered >= mockReadsToAnswer)
      return new Promise(resolve => { mockHeld.push(() => resolve({ ...mockStored })); });
    mockReadsAnswered += 1;
    return Promise.resolve({ ...mockStored });
  }),
  getCachedUserProfile: jest.fn(async () => mockProfile),
  reloadUserProfile: jest.fn(async () => null),
  ensureValidTokens: jest.fn(async () => true),
  cacheUserProfile: jest.fn(async () => {}),
  clearStoredTokens: jest.fn(async () => {}),
  refreshCustomJWT: jest.fn(async () => null),
  signOut: jest.fn(async () => ({ success: true })),
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
// The tabs layout loads the auth slice lazily with import(), which this Jest
// setup cannot run: hand it the same module.
jest.mock('@/store/loadAuthSlice', () => ({ loadAuthSlice: async () => require('@/store/slices/authSlice') }));

// ---------------------------------------------------------------------------
// The router: the stack shows the route in `mockRoute`; "(tabs)" mounts the
// real tabs layout.
// ---------------------------------------------------------------------------
let mockRoute = '(tabs)';
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  const TabsLayout = require('../../../app/(tabs)/_layout').default;
  const Stack = ({ children }: { children: React.ReactNode }) => React.createElement('AppStack', null, children);
  Stack.Screen = ({ name }: { name: string }) => {
    if (name !== mockRoute) return null;
    return name === '(tabs)' ? React.createElement(TabsLayout) : React.createElement('DeepLinkedScreen', { name });
  };
  const Tabs = ({ children }: { children: React.ReactNode }) => React.createElement('ProtectedTabs', null, children);
  Tabs.Screen = ({ name }: { name: string }) => React.createElement('TabScreen', { name });
  return {
    Stack,
    Tabs,
    useRouter: () => ({ replace: mockReplace }),
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ---------------------------------------------------------------------------
// Everything else the root draws, as in BootstrapCentral.test.tsx.
// ---------------------------------------------------------------------------
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/centralSession', () => ({ restoreCentralSession: jest.fn(async () => {}), retryCentralRestoreIfNeeded: jest.fn() }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('redux-persist/integration/react', () => ({ PersistGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaInsetsContext: React.createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('react-native-paper', () => ({
  PaperProvider: ({ children }: { children: React.ReactNode }) => children,
  MD3LightTheme: { colors: {} },
  MD3DarkTheme: { colors: {} },
}));
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setStyle: jest.fn() }));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return {
    useTheme: () => ({ brand: 'orange', resolvedMode: 'light', tokens, isDarkMode: false }),
    useTokens: () => tokens,
  };
});
jest.mock('@/lib/queryClient', () => ({ queryClient: {} }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), Sentry: { wrap: (c: unknown) => c },
  setSentryUser: jest.fn(), clearSentryUser: jest.fn(),
}));
jest.mock('@/components/OperatorServerSelection', () => ({ OperatorServerSelection: () => null }));
jest.mock('@/components/ConfigErrorScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/UpgradingBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AlertHost', () => ({ AlertHost: () => null }));
jest.mock('@/components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
jest.mock('@/components/AppStateManager', () => ({ AppStateManager: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/FioriTabBar', () => () => null);
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
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
}));
jest.mock('@/config/lanCheck', () => ({ startDailyLanCheck: jest.fn(() => jest.fn()) }));
jest.mock('@/config/netReachability', () => ({ installNetReachability: jest.fn(), applyNetReachability: jest.fn() }));
jest.mock('@/config/operatorBootstrap', () => ({ verifySelectedOperator: jest.fn(), verifyForegroundOperator: jest.fn() }));
jest.mock('@/config/operatorResume', () => ({
  operatorResumeGate: { installVerifier: jest.fn(() => () => undefined), suspend: jest.fn() },
}));
jest.mock('@/config/resumeLifecycle', () => ({ createResumeLifecycle: jest.fn(() => jest.fn()) }));
jest.mock('@/config/nativeHandoff', () => ({ isNativeHandoffActive: jest.fn(() => false) }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));

// ---------------------------------------------------------------------------
let tree: ReactTestRenderer | undefined;
const turn = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
async function start() {
  await act(async () => { tree = create(<RootLayout />); });
  for (let i = 0; i < 5; i++) await turn();
}
const count = (type: string) => tree!.root.findAll(node => (node.type as unknown) === type).length;
const spinnerShown = () => tree!.root.findAll(node => node.props.accessibilityLabel === t('nav.loading')).length > 0;
/**
 * A server change re-runs the bootstrap (app/_layout.tsx): the splash, then a
 * new root content once the facility is verified again. The verification is
 * answered in its own turn, so the splash is drawn in between as on a phone.
 */
async function switchFacility() {
  const onServerChange = jest.mocked(onOperatorServerChange).mock.calls[0][0];
  let verified!: () => void;
  jest.mocked(verifySelectedOperator).mockImplementationOnce(
    () => new Promise(resolve => { verified = () => resolve(verifiedFacility as never); })
  );
  await act(async () => { onServerChange(); });
  await turn();
  expect(count('AppStack')).toBe(0);
  await act(async () => { verified(); });
  await turn();
}
const verifiedFacility = {
  kind: 'verified',
  discovery: { config: { supabaseUrl: 'https://north-cold.example.test', anonKey: 'public-test-key' } },
};
const releaseHeldReads = () => act(async () => {
  for (const release of mockHeld.splice(0)) release();
  await new Promise(resolve => setTimeout(resolve, 0));
});
const tabsShown = () => count('ProtectedTabs') > 0;
const signedIn = () => {
  mockStored = { isValid: true, type: 'jwt', authToken: 'stored-access', refreshToken: 'stored-refresh', expiresAt: Date.now() + 3600 * 1000 };
  mockProfile = profileA;
};
const originalDev = (global as { __DEV__?: boolean }).__DEV__;

beforeAll(() => { (global as { __DEV__?: boolean }).__DEV__ = false; });
afterAll(() => { (global as { __DEV__?: boolean }).__DEV__ = originalDev; });
beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeStore();
  mockRestores.length = 0;
  mockReadsAnswered = 0;
  mockReadsToAnswer = 1;
  mockHeld.length = 0;
  mockRoute = '(tabs)';
  mockStored = { isValid: false };
  mockProfile = null;
  jest.mocked(verifySelectedOperator).mockResolvedValue(verifiedFacility as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

it('signed in: a cold start reaches the tabs with one restore and no second spinner', async () => {
  signedIn();
  await start();
  expect(mockRestores).toHaveLength(1);
  expect(mockStore.getState().auth.userProfile).toEqual(profileA);
  expect(tabsShown()).toBe(true);
  expect(spinnerShown()).toBe(false);
  expect(mockReplace).not.toHaveBeenCalled();
});

it('signed out: one restore, and the tabs send the person to sign-in at once', async () => {
  await start();
  expect(mockRestores).toHaveLength(1);
  expect(tabsShown()).toBe(false);
  expect(mockReplace).toHaveBeenCalledWith('/login');
});

it('a cold start deep link: the link waits for the one restore, and the tabs opened later restore nothing', async () => {
  signedIn();
  mockRoute = 'grn-details/[id]';
  await start();
  expect(mockRestores).toHaveLength(1);
  expect(count('DeepLinkedScreen')).toBe(1);
  // The deep link is handled only once the root restore has settled.
  const settledArgs = jest.mocked(useColdStartDeepLink).mock.calls.map(([settled]) => settled);
  expect(settledArgs[0]).toBe(false);
  expect(settledArgs.at(-1)).toBe(true);

  // Back to the home tabs.
  mockRoute = '(tabs)';
  await act(async () => { tree!.update(<RootLayout />); });
  await turn();
  expect(mockRestores).toHaveLength(1);
  expect(tabsShown()).toBe(true);
  expect(spinnerShown()).toBe(false);
});

it('a facility switch rebuilds the tree: the root restores again, the tabs do not', async () => {
  signedIn();
  await start();
  expect(mockRestores).toHaveLength(1);

  // The server change rebuilds the root content, which restores again.
  mockReadsToAnswer = 2;
  mockProfile = profileB;
  await switchFacility();
  for (let i = 0; i < 3; i++) await turn();
  expect(mockRestores).toHaveLength(2);
  expect(mockStore.getState().auth.userProfile).toEqual(profileB);
  expect(tabsShown()).toBe(true);
  expect(spinnerShown()).toBe(false);
});

it('a facility sign-in during the rebuild began a new session: the tabs restore it once', async () => {
  signedIn();
  await start();
  expect(mockRestores).toHaveLength(1);

  // The rebuilt root restores; its read is held while the facility sign-in
  // stores a new session and sets the profile (src/config/openFacility.ts).
  await switchFacility();
  expect(mockRestores).toHaveLength(2);
  expect(spinnerShown()).toBe(true);
  advanceSessionGeneration();
  mockProfile = profileB;
  await act(async () => { mockStore.dispatch(setUserProfile(profileB as never)); });
  expect(mockStore.getState().auth.initializeStatus).toBe('idle');

  // The root's restore ends (its answer belongs to the old session and is
  // ignored); the stack mounts and the tabs restore the new session once.
  await releaseHeldReads();
  for (let i = 0; i < 3; i++) await turn();
  expect(mockRestores).toHaveLength(3);
  expect(tabsShown()).toBe(false);
  expect(spinnerShown()).toBe(true);
  await releaseHeldReads();
  for (let i = 0; i < 3; i++) await turn();
  expect(mockRestores).toHaveLength(3);
  expect(mockStore.getState().auth.userProfile).toEqual(profileB);
  expect(tabsShown()).toBe(true);
  expect(spinnerShown()).toBe(false);
});

it('every bootstrap points the reachability probe at the selected facility, after its server was read', async () => {
  const order: string[] = [];
  jest.mocked(installNetReachability).mockImplementation(() => { order.push('install'); });
  jest.mocked(applyNetReachability).mockImplementation(() => { order.push('apply'); });
  jest.mocked(verifySelectedOperator).mockImplementation(async () => { order.push('verify'); return verifiedFacility as never; });
  await start();
  expect(order).toEqual(['install', 'verify', 'apply']);
  await switchFacility();
  expect(installNetReachability).toHaveBeenCalledTimes(2);
  expect(applyNetReachability).toHaveBeenCalledTimes(2);
});

it('the probe is applied again when the saved facility could not be verified (the phone is offline at start)', async () => {
  jest.mocked(verifySelectedOperator).mockRejectedValue(new Error('Server discovery timed out.'));
  await start();
  expect(installNetReachability).toHaveBeenCalledTimes(1);
  expect(applyNetReachability).toHaveBeenCalledTimes(1);
});
