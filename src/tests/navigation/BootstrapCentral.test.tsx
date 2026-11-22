/**
 * The start of the app with and without central login (app/_layout.tsx).
 *
 * Without it nothing can be shown until a facility's server is chosen. With it
 * the app shell renders without a server, so central sign-in and My facilities
 * can be reached, and the stored central session is read before the route guard
 * decides anything.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import RootLayout from '../../../app/_layout';
import { verifySelectedOperator } from '@/config/operatorBootstrap';
import { AppTooOldError, clearAppTooOld, getAppTooOld, reportAppTooOld } from '@/config/appTooOld';
import { restoreCentralSession } from '@/config/centralSession';
import { applyNetReachability, installNetReachability } from '@/config/netReachability';
import { startDailyLanCheck } from '@/config/lanCheck';
import { installConnectionHistory, readConnectionSession } from '@/config/connectionHistory';
import { leaveFacility, retryStaleFacilityCleanup } from '@/store/operatorSwitch';
import { useRootRouteGuard } from '@/navigation/RouteGuard';
import { store } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';
import { fakeAppState } from '../helpers/fakeRoute';

let mockCentralOn = false;
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));
jest.mock('@/config/centralSession', () => ({
  restoreCentralSession: jest.fn(async () => {}),
  retryCentralRestoreIfNeeded: jest.fn(async () => {}),
}));
jest.mock('@/store/operatorSwitch', () => ({
  leaveFacility: jest.fn(async () => 'left'),
  retryStaleFacilityCleanup: jest.fn(async () => true),
}));

const mockDispatch = jest.fn(() => ({ unwrap: async () => ({}) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' }, auth: {} }),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() }, persistor: {} }));
jest.mock('react-redux', () => ({ Provider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('redux-persist/integration/react', () => ({ PersistGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
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
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  // The stack and its screens draw what the test reads: a view, and one text per registered screen.
  const Stack = ({ children }: { children: React.ReactNode }) => React.createElement(View, { testID: 'app-stack' }, children);
  Stack.Screen = ({ name }: { name: string }) => React.createElement(Text, { testID: 'stack-screen' }, name);
  return {
    Stack,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('@/lib/queryClient', () => ({ queryClient: {} }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), Sentry: { wrap: (c: unknown) => c },
}));
jest.mock('@/config/supabaseConfig', () => ({
  initializeSupabase: jest.fn(), invalidateStoredTokenCache: jest.fn(), clearPendingEnrollment: jest.fn(), hasActiveOperatorMutation: jest.fn(() => false),
}));
jest.mock('@/components/OperatorServerSelection', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { OperatorServerSelection: () => React.createElement(Text, { testID: 'server-selection' }, 'Server address screen') };
});
// The stand-ins draw their title and the button the root passes a handler to, and call that handler.
jest.mock('@/components/ConfigErrorScreen', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: { onChangeServer: () => void }) =>
      React.createElement(Pressable, { testID: 'config-error', accessibilityRole: 'button', accessibilityLabel: 'Change server', onPress: props.onChangeServer },
        React.createElement(Text, null, 'Cannot reach the facility')),
  };
});
jest.mock('@/components/AppTooOldScreen', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { minimum: string; current: string; updateUrl: string; onClose: () => void }) =>
      React.createElement(View, { testID: 'app-too-old' },
        React.createElement(Text, { testID: 'app-too-old-versions' }, `needs ${props.minimum}, this app is ${props.current}, update at ${props.updateUrl}`),
        React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Back', onPress: props.onClose }, React.createElement(Text, null, 'Back'))),
  };
});
jest.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/AlertHost', () => ({ AlertHost: () => null }));
jest.mock('@/components/AppStateManager', () => ({ AppStateManager: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useColdStartDeepLink', () => ({ useColdStartDeepLink: jest.fn() }));
jest.mock('@/i18n/useAppLanguage', () => ({ useAppLanguage: () => ({ language: 'en', preference: 'system', setPreference: jest.fn() }) }));
jest.mock('@/i18n/useProfileLanguage', () => ({ useProfileLanguage: jest.fn() }));
jest.mock('@/navigation/RouteGuard', () => ({
  GuardedScreen: ({ children }: { children: React.ReactNode }) => children,
  useRootRouteGuard: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({ onOperatorServerChange: jest.fn(() => () => undefined), getActiveOperatorServer: jest.fn(() => null) }));
jest.mock('@/config/connectionHistory', () => ({ installConnectionHistory: jest.fn(), readConnectionSession: jest.fn() }));
jest.mock('@/config/lanCheck',() => ({ startDailyLanCheck: jest.fn(() => jest.fn()) }));
jest.mock('@/config/netReachability', () => ({ installNetReachability: jest.fn(), applyNetReachability: jest.fn() }));
jest.mock('@/config/operatorBootstrap', () => ({ verifySelectedOperator: jest.fn(), verifyForegroundOperator: jest.fn() }));
jest.mock('@/config/operatorResume', () => ({
  operatorResumeGate: { installVerifier: jest.fn(() => () => undefined), suspend: jest.fn() },
}));
jest.mock('@/config/resumeLifecycle', () => ({ createResumeLifecycle: jest.fn(() => jest.fn()) }));
jest.mock('@/config/nativeHandoff', () => ({ isNativeHandoffActive: jest.fn(() => false) }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({ initializeAuth: jest.fn(() => ({ type: 'auth/initialize' })), logout: jest.fn() }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn() } }));

let user: ReturnType<typeof userEvent.setup>;
async function start() {
  await render(<RootLayout />);
  // The bootstrap and the session restore settle over a few turns.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const IDS = { ServerSelection: 'server-selection', AppStack: 'app-stack', ConfigError: 'config-error', AppTooOld: 'app-too-old' } as const;
const on = (name: keyof typeof IDS) => expect(screen.getByTestId(IDS[name])).toBeOnTheScreen();
const off = (name: keyof typeof IDS) => expect(screen.queryAllByTestId(IDS[name], everything)).toHaveLength(0);
const screens = () => screen.queryAllByTestId('stack-screen', everything).map(node => node.props.children as string);

beforeEach(() => {
  user = userEvent.setup({ delay: 0 });
  jest.clearAllMocks();
  clearAppTooOld();
  mockCentralOn = false;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
});

describe('no facility server chosen yet', () => {
  beforeEach(() => jest.mocked(verifySelectedOperator).mockResolvedValue({ kind: 'selection' }));

  it('the daily check of the warehouse network address is started once with the app, and stopped with it', async () => {
    await start();
    expect(startDailyLanCheck).toHaveBeenCalledTimes(1);
    const stop = jest.mocked(startDailyLanCheck).mock.results[0].value as jest.Mock;
    expect(stop).not.toHaveBeenCalled();
    await screen.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('the reachability probe is installed and applied with no facility, which puts NetInfo back on its defaults', async () => {
    await start();
    expect(installNetReachability).toHaveBeenCalledTimes(1);
    expect(applyNetReachability).toHaveBeenCalledTimes(1);
  });

  it('central login off: only the server address screen is shown, as before', async () => {
    await start();
    on('ServerSelection');
    off('AppStack');
    expect(restoreCentralSession).not.toHaveBeenCalled();
    expect(useRootRouteGuard).not.toHaveBeenCalled();
  });

  it('central login on: the app shell renders without a server, with the central screens registered', async () => {
    mockCentralOn = true;
    await start();
    off('ServerSelection');
    on('AppStack');
    expect(screens()).toEqual(
      expect.arrayContaining(['central-login', 'central-otp', 'facilities', 'facility-catalogue', 'facility-address', 'facility-link', 'central-account'])
    );
  });

  it('central login on: the stored central session is read before the route guard may decide', async () => {
    mockCentralOn = true;
    let restored!: () => void;
    jest.mocked(restoreCentralSession).mockReturnValue(new Promise<void>(resolve => { restored = resolve; }));
    await start();
    expect(restoreCentralSession).toHaveBeenCalledTimes(1);
    // Until then the guard is told that nothing is known yet, and no screen is drawn.
    expect(jest.mocked(useRootRouteGuard).mock.calls.every(([settled]) => settled === false)).toBe(true);
    off('AppStack');
    await act(async () => { restored(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(useRootRouteGuard).toHaveBeenLastCalledWith(true);
    on('AppStack');
  });
});

// WH-182 item 5: the saved session is read for the connection history by bootstrapApp itself, once the saved server is loaded
// (after verifySelectedOperator, whatever its outcome). Every cold-start test of the history calls readConnectionSession()
// by hand, so only this test fails when the call is removed from app/_layout.tsx.
describe('the connection history reads the saved session at start', () => {
  const order = (): string[] => {
    const calls: string[] = [];
    jest.mocked(installConnectionHistory).mockImplementation(() => { calls.push('install'); });
    jest.mocked(readConnectionSession).mockImplementation(() => { calls.push('read'); });
    return calls;
  };

  it('a start with no facility chosen: installed first, the session read once after the saved server was looked at', async () => {
    const calls = order();
    jest.mocked(verifySelectedOperator).mockImplementation(async () => { calls.push('verify'); return { kind: 'selection' } as never; });
    await start();
    expect(calls).toEqual(['install', 'verify', 'read']);
  });

  it('a start where the facility cannot be reached (offline): the session is still read', async () => {
    const calls = order();
    jest.mocked(verifySelectedOperator).mockImplementation(async () => { calls.push('verify'); throw new Error('Server discovery timed out'); });
    await start();
    expect(calls).toEqual(['install', 'verify', 'read']);
  });
});

describe('the chosen facility cannot be reached', () => {
  beforeEach(() => jest.mocked(verifySelectedOperator).mockRejectedValue(new Error('Server discovery timed out')));
  const changeServer = async () => {
    await user.press(screen.getByRole('button', { name: 'Change server' }));
  };

  it('central login off: "change server" opens the server address screen and signs nothing out', async () => {
    await start();
    on('ConfigError');
    await changeServer();
    on('ServerSelection');
    expect(leaveFacility).not.toHaveBeenCalled();
  });

  it('central login on: "change server" leaves that facility for My facilities without sending it anything', async () => {
    mockCentralOn = true;
    await start();
    on('ConfigError');
    await changeServer();
    expect(leaveFacility).toHaveBeenCalledTimes(1);
    expect(leaveFacility).toHaveBeenCalledWith(store.dispatch, { localOnly: true });
    off('ServerSelection');
  });
});

describe('the chosen facility needs a newer app', () => {
  beforeEach(() =>
    jest.mocked(verifySelectedOperator).mockRejectedValue(new AppTooOldError('requires 0.7.0', '0.7.0', '0.6.0', 'https://updates.example.test/app.apk'))
  );

  it('shows the "Update the app" screen with the versions and the link, not the connection error', async () => {
    await start();
    off('ConfigError');
    expect(screen.getByTestId('app-too-old-versions')).toHaveTextContent('needs 0.7.0, this app is 0.6.0, update at https://updates.example.test/app.apk', { exact: true });
  });

  it('central login off: Back opens the server address screen and signs nothing out', async () => {
    await start();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    on('ServerSelection');
    expect(leaveFacility).not.toHaveBeenCalled();
  });

  it('central login on: Back leaves that facility for My facilities without sending it anything', async () => {
    mockCentralOn = true;
    await start();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(leaveFacility).toHaveBeenCalledWith(store.dispatch, { localOnly: true });
  });
});

describe('a facility that needs a newer app is found out while the app is open (the phone was resumed after an upgrade)', () => {
  // (Central login on and no facility chosen renders the app shell; the screen then replaces it as it would a facility's screens.)
  beforeEach(() => jest.mocked(verifySelectedOperator).mockResolvedValue({ kind: 'selection' }));
  const foundOut = () => act(async () => {
    reportAppTooOld(new AppTooOldError('requires 0.8.0', '0.8.0', '0.6.0', 'https://updates.example.test/app.apk'));
  });

  it('the app that was working is replaced by the "Update the app" screen with the new minimum', async () => {
    mockCentralOn = true;
    await start();
    on('AppStack');
    off('AppTooOld');
    await foundOut();
    off('AppStack');
    expect(screen.getByTestId('app-too-old-versions')).toHaveTextContent('needs 0.8.0, this app is 0.6.0, update at https://updates.example.test/app.apk', { exact: true });
  });

  it('central login off: Back opens the server address screen', async () => {
    jest.mocked(verifySelectedOperator).mockResolvedValue({ kind: 'verified', discovery: {} as never });
    await start();
    await foundOut();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    on('ServerSelection');
    expect(leaveFacility).not.toHaveBeenCalled();
  });

  it('central login on: Back leaves the facility, and the screen goes with it', async () => {
    mockCentralOn = true;
    await start();
    await foundOut();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(leaveFacility).toHaveBeenCalledWith(store.dispatch, { localOnly: true });
    expect(getAppTooOld()).toBeNull();
    off('AppTooOld');
  });
});

// Phone report 2026-10-12: with central login and no facility selected every start logged
// "[AuthSlice] Initialize auth error: Configuration must be loaded first." The restore itself
// is covered in src/store/__tests__/initializeAuthNoFacility.test.ts; here, what the root does.
describe('the facility session restore with no facility server chosen', () => {
  beforeEach(() => jest.mocked(verifySelectedOperator).mockResolvedValue({ kind: 'selection' }));

  it('central login off: it is never started, because nothing but the server address screen is shown', async () => {
    await start();
    on('ServerSelection');
    expect(initializeAuth).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('central login on: it is started once with the shell, and a restore that fails still releases the route guard', async () => {
    mockCentralOn = true;
    mockDispatch.mockReturnValueOnce({ unwrap: async () => { throw new Error('Configuration must be loaded first.'); } });
    await start();
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(restoreCentralSession).toHaveBeenCalledTimes(1);
    // The person is not left on the spinner: the guard is told the restore has settled.
    expect(useRootRouteGuard).toHaveBeenLastCalledWith(true);
    on('AppStack');
  });
});

// Ops review 2026-10-17, M08: a facility session that an exchange left on the phone for an
// earlier central sign-in (src/config/staleFacilitySession.ts) is ended at start and tried
// again on every return to the foreground, whether or not that facility can be reached.
describe("the cleanup of an earlier sign-in's facility session", () => {
  let appState: ReturnType<typeof fakeAppState>;
  beforeEach(() => {
    appState = fakeAppState();
    jest.mocked(verifySelectedOperator).mockResolvedValue({ kind: 'selection' });
  });
  afterEach(() => appState.restore());

  it('central login on: it runs once at start, again on each return to the foreground, and not when the app goes to the background', async () => {
    mockCentralOn = true;
    await start();
    expect(retryStaleFacilityCleanup).toHaveBeenCalledTimes(1);
    expect(retryStaleFacilityCleanup).toHaveBeenCalledWith(store.dispatch);
    await act(async () => { appState.setAppState('background'); });
    expect(retryStaleFacilityCleanup).toHaveBeenCalledTimes(1);
    await act(async () => { appState.setAppState('active'); });
    expect(retryStaleFacilityCleanup).toHaveBeenCalledTimes(2);
    await act(async () => { appState.setAppState('background'); appState.setAppState('active'); });
    expect(retryStaleFacilityCleanup).toHaveBeenCalledTimes(3);
  });

  it('central login on: the start-up cleanup runs even when the selected facility cannot be reached', async () => {
    mockCentralOn = true;
    jest.mocked(verifySelectedOperator).mockRejectedValue(new Error('Server discovery timed out'));
    await start();
    on('ConfigError');
    expect(retryStaleFacilityCleanup).toHaveBeenCalledTimes(1);
  });

  it('central login off: it never runs', async () => {
    await start();
    await act(async () => { appState.setAppState('background'); appState.setAppState('active'); });
    expect(retryStaleFacilityCleanup).not.toHaveBeenCalled();
  });
});
