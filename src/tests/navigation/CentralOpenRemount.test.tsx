/**
 * Opening a facility from My facilities, end to end through the router
 * (docs/CENTRAL_LOGIN.md, "Not tested"): the open commits a new server, the
 * server change rebuilds the navigation tree as BootstrapApp in app/_layout.tsx
 * does (splash, then the auth restore, then the stack at its first route), and
 * the answer must still reach its screen afterwards.
 *
 * The real expo-router (ExpoRoot with a route table), the real route guard
 * (useRootRouteGuard and GuardedScreen, as app/_layout.tsx wires them), the
 * real My facilities, waiting and linking screens, the real openFacility and
 * the real server-switch sequence. Mocked: the network answers (discovery, the
 * central token, the facility's exchange and its code request) and the store.
 *
 * Phone report 2026-10-12 (B3, E7): `pending` and `link_required` left the
 * person on My facilities. The guard read the route from useSegments(), which
 * lags one render behind the navigator after the rebuild; it replaced the
 * already-shown My facilities a second time, after My facilities had asked for
 * the waiting or linking screen, and so threw that navigation away.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { routingQueue } from 'expo-router/build/global-state/routingQueue';
import FacilitiesScreen from '../../../app/facilities';
import PendingEnrollmentScreen from '../../../app/pending-enrollment';
import FacilityLinkScreen from '../../../app/facility-link';
import { GuardedScreen, useRootRouteGuard } from '@/navigation/RouteGuard';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { addMyFacility, loadMyFacilities } from '@/config/centralFacilities';
import { discoverOperator, onOperatorServerChange, saveOperatorServer } from '@/config/operatorServer';
import { requestFacilityToken } from '@/config/centralSession';
import { exchangeCentralIdentity, getPendingEnrollmentToken, signInWithPhone } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';

require('expo-router/build/testing-library/mocks');

const ISSUER = 'https://identity.example.test';
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  // Signed in centrally only: no facility profile and no facility session.
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: null, session: null, user: null } }),
}));
jest.mock('@/store', () => ({
  store: {
    getState: () => ({ auth: {} }),
    dispatch: jest.fn((action: { type: string }) =>
      action.type === 'test/logout' ? { unwrap: async () => undefined } : action),
  },
}));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  setUserProfile: jest.fn((payload: unknown) => ({ type: 'auth/setUserProfile', payload })),
}));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => undefined) }));
jest.mock('@/store/centralSignOut', () => ({ signOutEverywhere: jest.fn(), deleteAccountEverywhere: jest.fn() }));
jest.mock('@/services/configService', () => ({ __esModule: true, default: { clearCache: jest.fn(async () => undefined) } }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: () => 0 } }));
jest.mock('@/config/centralSession', () => ({ requestFacilityToken: jest.fn(), fetchCentralProfile: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/config/operatorServer', () => ({ ...jest.requireActual('@/config/operatorServer'), discoverOperator: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(() => true),
  endOperatorSwitch: jest.fn(),
  getPendingEnrollmentToken: jest.fn(async () => null),
  clearPendingEnrollment: jest.fn(async () => undefined),
  signOutPendingEnrollment: jest.fn(async () => undefined),
  getEnrollmentStatus: jest.fn(async () => ({ success: true, status: 'pending' })),
  initializeSupabase: jest.fn(),
  exchangeCentralIdentity: jest.fn(),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '' };
const ORIGIN = 'https://dev-cold.example.test';
const NAME = 'Dev Cold Storage';
const server = { origin: ORIGIN, instanceId: 'instance-dev', displayName: 'Dev', companyName: NAME };
const previous = { origin: 'https://south-cold.example.test', instanceId: 'instance-south', displayName: 'South', companyName: 'South Cold Store' };

/** How long the rebuild keeps the splash up: discovery and the development build's 3 second wait. */
const BOOTSTRAP_MS = 3000;

/**
 * BootstrapApp and ThemedContent of app/_layout.tsx, reduced to what decides the
 * navigation: a server change takes the whole tree down for the splash and brings
 * it back; the restored auth state releases the guard; the root stack wraps every
 * screen in GuardedScreen.
 */
function Shell() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) setSettled(true); });
    return () => { mounted = false; };
  }, []);
  useRootRouteGuard(settled);
  if (!settled) return <ActivityIndicator accessibilityLabel="Loading" />;
  return (
    <Stack
      screenLayout={({ route, children }) => <GuardedScreen routeName={route.name}>{children}</GuardedScreen>}
      screenOptions={{ headerShown: false, animation: 'none' }}
    />
  );
}
function Root() {
  const [ready, setReady] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onOperatorServerChange(() => {
      setReady(false);
      clearTimeout(timer);
      timer = setTimeout(() => setReady(true), BOOTSTRAP_MS);
    });
    return () => { stop(); clearTimeout(timer); };
  }, []);
  if (!ready) return <Text>splash</Text>;
  return <Shell />;
}

const ROUTES = {
  _layout: Root,
  '(tabs)/index': () => <Text>facility home</Text>,
  facilities: FacilitiesScreen,
  'pending-enrollment': PendingEnrollmentScreen,
  'facility-link': FacilityLinkScreen,
  'central-login': () => <Text>central sign-in</Text>,
  login: () => <Text>facility sign-in</Text>,
};

let tree: ReactTestRenderer | undefined;
/** Every navigation asked of the router, in order: [kind, href]. */
let navigations: Array<[string, string]> = [];
const originalAdd = routingQueue.add;

const pathname = () => routerStore.getRouteInfo().pathname;
const texts = () =>
  tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
const wait = async (ms: number) => {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
};
const tapFacility = async () => {
  const cell = tree!.root.find(node => node.props.testID === `facility-${ORIGIN}` && typeof node.props.onPress === 'function');
  await act(async () => { cell.props.onPress(); });
};

async function start() {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    tree = create(<ExpoRoot context={getMockContext(ROUTES)} location="/facilities" />);
  });
  await wait(50);
  expect(pathname()).toBe('/facilities');
  navigations = [];
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER, autoOpenSpent: true });
  await addMyFacility('asha', { origin: ORIGIN, name: NAME, city: 'Unjha' });
  // Another facility was selected before; opening this one is a real server change.
  await saveOperatorServer(previous, false);
  jest.mocked(discoverOperator).mockResolvedValue({
    server,
    config: { supabaseUrl: ORIGIN, anonKey: 'anon-key', centralLogin: { issuer: ISSUER } },
  } as never);
  jest.mocked(requestFacilityToken).mockResolvedValue({ ok: true, identityToken: 'identity-token' } as never);
  jest.mocked(signInWithPhone).mockResolvedValue({ success: true, data: {} } as never);
  jest.mocked(getPendingEnrollmentToken).mockResolvedValue(null);
  navigations = [];
  routingQueue.add = (action: { type: string; payload?: { href?: unknown; options?: { event?: string } } }) => {
    navigations.push([String(action.payload?.options?.event ?? action.type), String(action.payload?.href ?? '')]);
    originalAdd(action as never);
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  routingQueue.add = originalAdd;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The facility answers after `answerMs`: during the splash, or after the tree is back. */
function answerWith(answer: () => Promise<unknown>, answerMs: number) {
  jest.mocked(exchangeCentralIdentity).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, answerMs));
    return (await answer()) as never;
  });
}

const PENDING = async () => {
  // As completeOperatorSignIn does: the enrollment token is stored before the answer returns.
  jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-token');
  return { success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } };
};
const LINK_REQUIRED = async () => ({ success: false, code: 'link_required' });

describe.each([
  ['during the splash', 500],
  ['after the tree is back', BOOTSTRAP_MS + 500],
])('the facility answers %s', (_when, answerMs) => {
  it('`pending`: the waiting screen is shown and stays, and nothing sends the person back to My facilities', async () => {
    answerWith(PENDING, answerMs);
    await start();
    await tapFacility();
    await wait(BOOTSTRAP_MS + 1500);

    expect((await loadMyFacilities('asha'))[0].status).toBe('requested');
    expect(getCentralState().opening).toBeNull();
    expect(pathname()).toBe('/pending-enrollment');
    expect(texts()).toContain('Waiting for approval');
    // The waiting screen is the last navigation: no replace to My facilities after it.
    const last = navigations.map(([, href]) => href).lastIndexOf('/pending-enrollment');
    expect(last).toBeGreaterThanOrEqual(0);
    expect(navigations.slice(last + 1)).toEqual([]);

    // Still there later (the phone looked again at 10 s and 25 s).
    await wait(20000);
    expect(pathname()).toBe('/pending-enrollment');
  });

  it('`link_required`: the code step for that facility is shown and stays', async () => {
    answerWith(LINK_REQUIRED, answerMs);
    await start();
    await tapFacility();
    await wait(BOOTSTRAP_MS + 1500);

    expect((await loadMyFacilities('asha'))[0].status).toBe('link_needed');
    expect(signInWithPhone).toHaveBeenCalledWith(USER.phoneNumber);
    expect(getCentralState().pendingLink).toEqual({ origin: ORIGIN, name: NAME, phoneNumber: USER.phoneNumber });
    expect(pathname()).toBe('/facility-link');
    expect(texts().join('\n')).toContain(`Confirm your number at ${NAME}`);
    const last = navigations.map(([, href]) => href).lastIndexOf('/facility-link');
    expect(last).toBeGreaterThanOrEqual(0);
    expect(navigations.slice(last + 1)).toEqual([]);

    await wait(20000);
    expect(pathname()).toBe('/facility-link');
  });

  it('a refusal (`account_unavailable`) stays on My facilities with its message, as before', async () => {
    answerWith(async () => ({ success: false, code: 'account_unavailable' }), answerMs);
    await start();
    await tapFacility();
    await wait(BOOTSTRAP_MS + 1500);

    expect((await loadMyFacilities('asha'))[0].status).toBe('revoked');
    expect(pathname()).toBe('/facilities');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(getCentralState().outcome).toBeNull();
  });
});
