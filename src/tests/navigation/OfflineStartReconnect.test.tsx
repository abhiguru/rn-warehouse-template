/**
 * WH-298 phone finding S5, the screens' side: after an offline start the facility check stays required (app/_layout.tsx
 * suspends the identity gate). When the server answers again and the gate opens, a list that failed while it was shut
 * ("Warehouse identity verification required") must load again, with no restart: the app's query client has no NetInfo, so
 * nothing else asks again.
 *
 * Real: `RootLayout`, `operatorResumeGate`, the app's own `queryClient` and TanStack Query. Faked: the launch result
 * (`verifySelectedOperator` answers an offline start, as the network does with aeroplane mode on), the gate's verifier (the
 * server answers or not), and the screens' collaborators, as in BootstrapCentral.test.tsx.
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 phone S5) =====
 *  - Only outcomes are asserted: an ACTIVE query that failed while the gate was shut is fetched again after the gate's first
 *    true verification. Nothing is refetched while the gate
 *    stays shut, and a refusal (the verifier answers false) refetches nothing.
 *  - The mechanism (a gate listener `onVerified` subscribed by the offline branch of the layout) is Development's; it is not
 *    named here, so any wiring passes.
 * =====================================================
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import RootLayout from '../../../app/_layout';
import { verifySelectedOperator, verifyForegroundOperator } from '@/config/operatorBootstrap';
import { operatorResumeGate } from '@/config/operatorResume';
import { queryClient } from '@/lib/queryClient';
import { QueryObserver } from '@tanstack/react-query';
import { clearAppTooOld } from '@/config/appTooOld';

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
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
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
jest.mock('@/config/resumeLifecycle', () => ({ createResumeLifecycle: jest.fn(() => jest.fn()) }));
jest.mock('@/config/nativeHandoff', () => ({ isNativeHandoffActive: jest.fn(() => false) }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn(async () => {}) }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({ initializeAuth: jest.fn(() => ({ type: 'auth/initialize' })), logout: jest.fn() }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn() } }));

const IDENTITY = 'Warehouse identity verification required';
const KEY = ['wh298-s5'];
const offlineStart = {
  kind: 'offline' as const,
  server: { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' },
  config: { supabaseUrl: 'https://warehouse.example.test', anonKey: 'anon-key' } as never,
};
async function start() {
  await render(<RootLayout />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

let unsubscribe: Array<() => void> = [];
/** A list on screen (an active query) whose answer is the identity error while `shut` is true. */
function listOnScreen(key: string[]) {
  const state = { shut: true };
  const queryFn = jest.fn(async () => { if (state.shut) throw new Error(IDENTITY); return 'loaded'; });
  const observer = new QueryObserver(queryClient, { queryKey: key, queryFn, retry: false, staleTime: 60_000 });
  unsubscribe.push(observer.subscribe(() => undefined));
  return { state, queryFn, observer };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAppTooOld();
  mockCentralOn = false;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(verifySelectedOperator).mockResolvedValue(offlineStart);
});
afterEach(() => {
  unsubscribe.forEach(stop => stop());
  unsubscribe = [];
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('after an offline start, when the server answers and the identity gate opens', () => {
  it('the list on screen that failed while the gate was shut loads again, with no restart', async () => {
    jest.mocked(verifyForegroundOperator).mockResolvedValue(true);
    await start();
    expect(operatorResumeGate.isVerified()).toBe(false);
    const list = listOnScreen([...KEY, 'active']);
    await waitFor(() => expect(list.observer.getCurrentResult().isError).toBe(true));
    list.state.shut = false;
    expect(await operatorResumeGate.ensureVerified()).toBe(true);
    await waitFor(() => expect(list.observer.getCurrentResult().data).toBe('loaded'));
    expect(list.queryFn).toHaveBeenCalledTimes(2);
  });

  it('while the server still does not answer (the gate stays shut) nothing is asked again', async () => {
    jest.mocked(verifyForegroundOperator).mockResolvedValue(false);
    await start();
    const list = listOnScreen([...KEY, 'refused']);
    await waitFor(() => expect(list.observer.getCurrentResult().isError).toBe(true));
    list.state.shut = false;
    expect(await operatorResumeGate.ensureVerified()).toBe(false);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(list.queryFn).toHaveBeenCalledTimes(1);
    expect(list.observer.getCurrentResult().isError).toBe(true);
  });
});
