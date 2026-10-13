/**
 * Opening a facility from My facilities, end to end through the router
 * (docs/CENTRAL_LOGIN.md, "Not tested"): the open commits a new server, the
 * server change rebuilds the navigation tree as BootstrapApp in app/_layout.tsx
 * does (splash, then the auth restore, then the stack at its first route), and
 * the answer must still reach its screen afterwards. Then the ways back from
 * those screens: each must leave one My facilities, and one stack.
 *
 * The real expo-router (ExpoRoot with a route table), the real route guard
 * (useRootRouteGuard and GuardedScreen, as app/_layout.tsx wires them), the
 * real My facilities, waiting and linking screens, the real openFacility and
 * the real server-switch sequence. Mocked: the network answers (discovery, the
 * central token, the facility's exchange and its code request) and the store.
 * Time passes in short steps, each its own `act`, so React renders in between
 * as it does on a phone.
 *
 * Phone report 2026-10-12 (B3, E7): `pending` and `link_required` left the
 * person on My facilities. The answer was there before the rebuilt tree: the
 * guard read the route from useSegments(), which is a render behind the
 * navigator after the rebuild; it replaced the already-shown My facilities a
 * second time, after My facilities had asked for the waiting or linking screen,
 * and so threw that navigation away. Only an answer that arrives DURING the
 * splash shows that fault; the "after the tree is back" cases passed before the
 * fix too and are kept as regression guards for the late answer.
 *
 * Second report, same day: the "My facilities" control of the waiting screen
 * and of the code step replaced the focused route, leaving two My facilities
 * in the stack, both mounted and both acting on the next answer.
 *
 * From the reviews of those fixes: central sign-in left itself under My
 * facilities (a second My facilities after a central session that ended on a
 * central screen); Back from the code step while a code is being checked; and
 * a forced sign-out on a facility screen, which left the facility's home under
 * My facilities and a second home on it after the next open.
 *
 * From the review after that: the guard's own "entering a facility" rule, through the real
 * router; a facility's own SMS sign-in that clears `facilitySmsOrigin` as the app does; a
 * facility session that ends after the central one (the guard replaced only the top route
 * with central sign-in, leaving the home under it); Back during the central code check; and
 * the waiting screen after a facility's own SMS sign-in (it left that sign-in under My
 * facilities).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Slot, Stack, router } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { routingQueue } from 'expo-router/build/global-state/routingQueue';
import FacilitiesScreen from '../../../app/facilities';
import PendingEnrollmentScreen from '../../../app/pending-enrollment';
import FacilityLinkScreen from '../../../app/facility-link';
import CentralOtpScreen from '../../../app/central-otp';
import { GuardedScreen, useRootRouteGuard } from '@/navigation/RouteGuard';
import { getCentralState, nextOutcomeId, resetCentralStateForTests, setCentralState, type OpenOutcome } from '@/config/centralState';
import { addMyFacility, loadMyFacilities, noteFacilitySmsSignIn, updateMyFacility } from '@/config/centralFacilities';
import { hasAcceptedTerms } from '@/config/centralTerms';
import { discoverOperator, onOperatorServerChange, saveOperatorServer } from '@/config/operatorServer';
import { requestFacilityToken, verifyCentralCode } from '@/config/centralSession';
import { exchangeCentralIdentity, getPendingEnrollmentToken, signInWithPhone, signOutPendingEnrollment } from '@/config/supabaseConfig';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/utils/alert';

require('expo-router/build/testing-library/mocks');

const ISSUER = 'https://identity.example.test';
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => jest.fn(),
    useAppSelector: (select: (state: unknown) => unknown) => {
      const auth = useSyncExternalStore(mockAuthStore.subscribe, mockAuthStore.get, mockAuthStore.get);
      return select({ theme: { preference: 'light', brand: 'orange' }, auth });
    },
  };
});
jest.mock('@/store', () => ({
  store: {
    getState: () => ({ auth: {} }),
    dispatch: jest.fn((action: { type: string; payload?: unknown }) => {
      if (action.type === 'test/logout') return { unwrap: async () => { mockAuthStore.set(null); } };
      if (action.type === 'auth/setUserProfile') mockAuthStore.set(action.payload);
      return action;
    }),
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
jest.mock('@/config/centralSession', () => ({
  requestFacilityToken: jest.fn(),
  fetchCentralProfile: jest.fn(async () => ({ ok: true })),
  requestCentralCode: jest.fn(),
  verifyCentralCode: jest.fn(),
}));
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

/**
 * The facility session as the screens and the guard read it. It starts signed in centrally
 * only (no facility profile, no facility session); the store's setUserProfile fills it in.
 */
const mockAuthStore = (() => {
  let auth: { userProfile: unknown; session: null; user: null } = { userProfile: null, session: null, user: null };
  const listeners = new Set<() => void>();
  return {
    get: () => auth,
    set: (userProfile: unknown) => {
      auth = { userProfile, session: null, user: null };
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
})();

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
  // The tab group has its own layout in the app, so the root stack's route is "(tabs)".
  '(tabs)/_layout': () => <Slot />,
  '(tabs)/index': () => <Text>facility home</Text>,
  facilities: FacilitiesScreen,
  'pending-enrollment': PendingEnrollmentScreen,
  'facility-link': FacilityLinkScreen,
  'central-login': () => <Text>central sign-in</Text>,
  'central-otp': CentralOtpScreen,
  'facility-catalogue': () => <Text>add facility</Text>,
  // A screen inside the facility, pushed over its home.
  settings: () => <Text>facility settings</Text>,
  // A form with its own stack, as app/grn-form.
  'grn-form/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  'grn-form/step1': () => <Text>form step 1</Text>,
  'grn-form/step2': () => <Text>form step 2</Text>,
  login: () => <Text>facility sign-in</Text>,
  otp: () => <Text>facility code</Text>,
};

let tree: ReactTestRenderer | undefined;
/** Every navigation asked of the router, in order: [kind, href]. */
let navigations: Array<[string, string]> = [];
const originalAdd = routingQueue.add;

type NavState = { routes: Array<{ name: string; key?: string; state?: NavState }> };
const pathname = () => routerStore.getRouteInfo().pathname;
/** The routes of the app's root stack, bottom first, below expo-router's own wrapper route. */
const rootRoutes = (): string[] => {
  let state = routerStore.navigationRef.current?.getRootState() as NavState | undefined;
  while (state && state.routes.length === 1 && state.routes[0].name === '__root') state = state.routes[0].state;
  return state ? state.routes.map(route => route.name) : [];
};
/**
 * The navigator's key of each route of the root stack, bottom first. A route that was
 * replaced gets a new key, and so a new mount of its screen; a pop to the route that is
 * already shown leaves the key as it was.
 */
const rootKeys = (): string[] => {
  let state = routerStore.navigationRef.current?.getRootState() as NavState | undefined;
  while (state && state.routes.length === 1 && state.routes[0].name === '__root') state = state.routes[0].state;
  return state ? state.routes.map(route => String(route.key)) : [];
};
const mountedFacilities = () => tree!.root.findAllByType(FacilitiesScreen).length;
const texts = () =>
  tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
/** Time passes in steps, each its own `act`: React renders between them, as on a phone. */
const STEP_MS = 100;
const wait = async (ms: number) => {
  for (let left = ms; left > 0; left -= STEP_MS)
    await act(async () => { await jest.advanceTimersByTimeAsync(Math.min(STEP_MS, left)); });
};
/** Tap the facility on the My facilities that is on top. */
const tapFacility = async () => {
  const cells = tree!.root.findAll(node => node.props.testID === `facility-${ORIGIN}` && typeof node.props.onPress === 'function');
  await act(async () => { cells[cells.length - 1].props.onPress(); });
};
const pressButton = async (label: string) => {
  const found = tree!.root.findAllByType(Button).filter(node => node.props.children === label || node.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no button "${label}"`);
  await act(async () => { await found[found.length - 1].props.onPress(); });
  await wait(STEP_MS);
};
/** The hardware Back button: the navigator's GO_BACK. */
const pressBack = async () => {
  await act(async () => { router.back(); });
  await wait(STEP_MS);
};
const enterCode = async (code: string) => {
  const input = tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
  await act(async () => { input.props.onChangeText(code); });
  await pressButton('Verify code');
};
const pushes = (href: string) => navigations.filter(([kind, to]) => kind === 'PUSH' && to === href).length;

async function start(location = '/facilities') {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await act(async () => {
    tree = create(<ExpoRoot context={getMockContext(ROUTES)} location={location} />);
  });
  await wait(STEP_MS);
  expect(pathname()).toBe(location);
  navigations = [];
}
const mountedHomes = () => texts().filter(text => text === 'facility home').length;
const go = async (navigate: () => void) => {
  await act(async () => { navigate(); });
  await wait(STEP_MS);
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAuthStore.set(null);
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
  // A test that holds the facility sign-out back replaces this; the next one starts with it returning at once.
  jest.mocked(signOutPendingEnrollment).mockImplementation(async () => undefined);
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

type Answer = () => Promise<unknown>;
/** The facility's next answers, in order (the last one repeats), each after `answerMs`. */
function answerWith(answers: Answer | Answer[], answerMs: number) {
  const queue = [...([] as Answer[]).concat(answers)];
  jest.mocked(exchangeCentralIdentity).mockImplementation(async () => {
    const answer = queue.length > 1 ? queue.shift()! : queue[0];
    await new Promise(resolve => setTimeout(resolve, answerMs));
    return (await answer()) as never;
  });
}

const PENDING: Answer = async () => {
  // As completeOperatorSignIn does: the enrollment token is stored before the answer returns.
  jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-token');
  return { success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } };
};
const LINK_REQUIRED: Answer = async () => ({ success: false, code: 'link_required' });
const REVOKED: Answer = async () => ({ success: false, code: 'account_unavailable' });
const WRONG_CODE: Answer = async () => ({ success: false, code: 'invalid_otp' });
const PROFILE = { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' };
const LOGIN: Answer = async () => ({ success: true, data: { action: 'login', session: null, user: null, userProfile: PROFILE, customAuth: true } });

/** While the splash is up, and half a second after the rebuilt tree has shown My facilities. */
const DURING_SPLASH = 500;
const AFTER_TREE = BOOTSTRAP_MS + 500;

/**
 * Tap the facility and let the rebuild and the answer happen. With a late answer the
 * rebuilt tree really is back first: My facilities is shown, still opening.
 */
async function openAndSettle(answerMs: number) {
  await tapFacility();
  if (answerMs > BOOTSTRAP_MS) {
    await wait(BOOTSTRAP_MS + 100);
    expect(pathname()).toBe('/facilities');
    expect(getCentralState().opening).toBe(ORIGIN);
    await wait(1400);
  } else await wait(BOOTSTRAP_MS + 1500);
  expect(getCentralState().opening).toBeNull();
}

describe.each([
  ['during the splash (the phone report: failed before the guard fix)', DURING_SPLASH],
  ['after the tree is back (regression guard: passed before the fix too)', AFTER_TREE],
])('the facility answers %s', (_when, answerMs) => {
  it('`pending`: the waiting screen is shown and stays, and nothing sends the person back to My facilities', async () => {
    answerWith(PENDING, answerMs);
    await start();
    await openAndSettle(answerMs);

    expect((await loadMyFacilities('asha'))[0].status).toBe('requested');
    expect(pathname()).toBe('/pending-enrollment');
    expect(texts()).toContain('Waiting for approval');
    expect(rootRoutes()).toEqual(['facilities', 'pending-enrollment']);
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
    await openAndSettle(answerMs);

    expect((await loadMyFacilities('asha'))[0].status).toBe('link_needed');
    expect(signInWithPhone).toHaveBeenCalledWith(USER.phoneNumber);
    expect(getCentralState().pendingLink).toEqual({ origin: ORIGIN, name: NAME, phoneNumber: USER.phoneNumber });
    expect(pathname()).toBe('/facility-link');
    expect(texts().join('\n')).toContain(`Confirm your number at ${NAME}`);
    expect(rootRoutes()).toEqual(['facilities', 'facility-link']);
    const last = navigations.map(([, href]) => href).lastIndexOf('/facility-link');
    expect(last).toBeGreaterThanOrEqual(0);
    expect(navigations.slice(last + 1)).toEqual([]);

    await wait(20000);
    expect(pathname()).toBe('/facility-link');
  });

  it('a refusal (`account_unavailable`) stays on My facilities with its message, as before', async () => {
    answerWith(REVOKED, answerMs);
    await start();
    await openAndSettle(answerMs);

    expect((await loadMyFacilities('asha'))[0].status).toBe('revoked');
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(getCentralState().outcome).toBeNull();
  });

  it('`login`: the facility is entered and nothing of the central screens stays under it', async () => {
    answerWith(LOGIN, answerMs);
    await start();
    await openAndSettle(answerMs);

    expect((await loadMyFacilities('asha'))[0].status).toBe('approved');
    expect(texts()).toContain('facility home');
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(router.canGoBack()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// The ways back. Hardware Back and the screens' own "My facilities" control both return to
// the My facilities the screen was opened from: one instance, nothing on top of it.
describe('back from the waiting screen (reached from My facilities)', () => {
  const openToWaiting = async () => {
    answerWith(PENDING, DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    expect(rootRoutes()).toEqual(['facilities', 'pending-enrollment']);
    navigations = [];
  };

  it('hardware Back: My facilities with "Requested"; nothing is asked of the facility', async () => {
    await openToWaiting();
    await pressBack();

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Requested');
    // The request and its token stay as they are; the next open of a facility deals with the token.
    expect(signOutPendingEnrollment).not.toHaveBeenCalled();
  });

  it('no request to wait for (the enrollment token is missing): back on the one My facilities', async () => {
    // The waiting screen leaves for the facility's sign-in, which is not for this person.
    answerWith(async () => ({ success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } }), DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    await wait(500);

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).not.toContain('facility sign-in');
  });

  it('"My facilities": the same My facilities, not a second one on top', async () => {
    await openToWaiting();
    await pressButton('My facilities');

    expect(signOutPendingEnrollment).toHaveBeenCalledTimes(1);
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Requested');
    expect(router.canGoBack()).toBe(false);
  });

  it('"My facilities", then hardware Back before the facility sign-out returns: the late return leaves the one My facilities as it is', async () => {
    await openToWaiting();
    // The waiting screen signs out at the facility first and goes back only when that returns.
    let finishSignOut: () => void = () => undefined;
    jest.mocked(signOutPendingEnrollment).mockImplementation(
      () => new Promise<void>(resolve => { finishSignOut = () => resolve(); })
    );
    const controls = tree!.root.findAllByType(Button).filter(node => node.props.children === 'My facilities');
    await act(async () => { controls[controls.length - 1].props.onPress(); });
    await wait(STEP_MS);
    expect(signOutPendingEnrollment).toHaveBeenCalledTimes(1);
    // Nothing has left the waiting screen yet.
    expect(rootRoutes()).toEqual(['facilities', 'pending-enrollment']);

    await pressBack();
    expect(rootRoutes()).toEqual(['facilities']);
    const keysBefore = rootKeys();
    navigations = [];

    // The sign-out returns now: `returnToMyFacilities` runs with My facilities already shown, alone.
    await act(async () => { finishSignOut(); });
    await wait(300);

    // A replace would give the route a new key and mount a second My facilities after the first
    // was thrown away. Going to the route that is shown changes nothing.
    expect(rootRoutes()).toEqual(['facilities']);
    expect(rootKeys()).toEqual(keysBefore);
    expect(navigations.filter(([kind]) => kind === 'REPLACE')).toEqual([]);
    expect(pathname()).toBe('/facilities');
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Requested');
    expect(router.canGoBack()).toBe(false);
  });

  it('opening the facility again after "My facilities" shows one waiting screen, and one Back leaves it', async () => {
    await openToWaiting();
    await pressButton('My facilities');
    navigations = [];

    // The facility is the selected server now: no rebuild this time.
    await tapFacility();
    await wait(DURING_SPLASH + 300);
    expect(pushes('/pending-enrollment')).toBe(1);
    expect(rootRoutes()).toEqual(['facilities', 'pending-enrollment']);

    await pressBack();
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
  });

  it('a refusal after "My facilities" is said once', async () => {
    answerWith([PENDING, REVOKED], DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    await pressButton('My facilities');
    jest.mocked(showAlert).mockClear();

    await tapFacility();
    await wait(DURING_SPLASH + 300);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(rootRoutes()).toEqual(['facilities']);
    expect(texts()).toContain('Revoked');
  });
});

describe('back from the code step', () => {
  const openToCodeStep = async () => {
    answerWith(LINK_REQUIRED, DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    expect(rootRoutes()).toEqual(['facilities', 'facility-link']);
    expect(getCentralState().pendingLink).not.toBeNull();
    navigations = [];
  };

  it('hardware Back: My facilities with "Confirm number", and the pending link is cleared as by the control', async () => {
    await openToCodeStep();
    await pressBack();

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Confirm number');
    expect(getCentralState().pendingLink).toBeNull();
    // Leaving is the only navigation: the cleared link does not send the person anywhere else.
    expect(navigations.filter(([, href]) => href !== '')).toEqual([]);
  });

  it('"My facilities": the same My facilities, not a second one on top; the pending link is cleared', async () => {
    await openToCodeStep();
    await pressButton('Back to My facilities');

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Confirm number');
    expect(getCentralState().pendingLink).toBeNull();
    expect(router.canGoBack()).toBe(false);
  });

  it('opening the facility again after "My facilities" shows one code step, and one Back leaves it', async () => {
    await openToCodeStep();
    await pressButton('Back to My facilities');
    navigations = [];

    await tapFacility();
    await wait(DURING_SPLASH + 300);
    expect(pushes('/facility-link')).toBe(1);
    expect(rootRoutes()).toEqual(['facilities', 'facility-link']);

    await pressBack();
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(getCentralState().pendingLink).toBeNull();
  });

  it('a code that leaves the request waiting: the waiting screen replaces the code step, and Back is My facilities', async () => {
    answerWith([LINK_REQUIRED, PENDING], DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    await enterCode('482913');
    await wait(DURING_SPLASH + 300);

    expect(pathname()).toBe('/pending-enrollment');
    expect(rootRoutes()).toEqual(['facilities', 'pending-enrollment']);
    await pressButton('My facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).toContain('Requested');
  });

  describe('Back while the code is being checked', () => {
    const backDuringVerification = async (answer: Answer) => {
      answerWith([LINK_REQUIRED, answer], DURING_SPLASH);
      await start();
      await openAndSettle(DURING_SPLASH);
      jest.mocked(showAlert).mockClear();
      await enterCode('482913');
      // The facility has not answered yet.
      expect(exchangeCentralIdentity).toHaveBeenCalledTimes(2);
      expect(pathname()).toBe('/facility-link');
      navigations = [];
      await pressBack();
      expect(pathname()).toBe('/facilities');
      expect(getCentralState().pendingLink).toBeNull();
      navigations = [];
      await wait(DURING_SPLASH + 300);
    };

    it('then a wrong code: nothing is said over My facilities and nothing is left to confirm', async () => {
      await backDuringVerification(WRONG_CODE);

      expect(showAlert).not.toHaveBeenCalled();
      expect(getCentralState().pendingLink).toBeNull();
      expect(navigations).toEqual([]);
      expect(rootRoutes()).toEqual(['facilities']);
      expect(mountedFacilities()).toBe(1);
      expect(texts()).toContain('Confirm number');
    });

    it('then `pending`: My facilities stays, with "Requested"; the waiting screen does not take its place', async () => {
      await backDuringVerification(PENDING);

      expect(navigations).toEqual([]);
      expect(pathname()).toBe('/facilities');
      expect(rootRoutes()).toEqual(['facilities']);
      expect(mountedFacilities()).toBe(1);
      expect(texts()).toContain('Requested');
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('then `login`: the facility is entered, once', async () => {
      await backDuringVerification(LOGIN);

      expect(rootRoutes()).toEqual(['(tabs)']);
      expect(mountedHomes()).toBe(1);
      expect(router.canGoBack()).toBe(false);
      expect(showAlert).not.toHaveBeenCalled();
    });
  });

  it('a correct code enters the facility, and nothing of the central screens stays under it', async () => {
    answerWith([LINK_REQUIRED, LOGIN], DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    await enterCode('482913');
    await wait(DURING_SPLASH + 300);

    expect(exchangeCentralIdentity).toHaveBeenLastCalledWith('identity-token', { otpCode: '482913' });
    expect((await loadMyFacilities('asha'))[0].status).toBe('approved');
    expect(getCentralState().pendingLink).toBeNull();
    expect(texts()).toContain('facility home');
    // Back on the facility's home has nothing central to fall back to (as after a plain open).
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(router.canGoBack()).toBe(false);
  });
});

describe("the waiting screen after a facility's own SMS sign-in (reached by replace: no My facilities under it)", () => {
  it('"My facilities" leaves My facilities alone: the facility\'s sign-in does not stay under it', async () => {
    // As after beginFacilitySmsSignIn and the code screen: the facility's sign-in is at the
    // bottom of the stack and the waiting screen has taken the code screen's place.
    jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-token');
    await start();
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['login']);
    await act(async () => { router.push('/pending-enrollment'); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['login', 'pending-enrollment']);
    navigations = [];

    await pressButton('My facilities');
    expect(getCentralState().facilitySmsOrigin).toBeNull();
    // The facility's sign-in is taken off the stack: My facilities alone, so Back has nothing
    // to go back to (before, [login, facilities]: one Back showed a spinner and the guard
    // brought My facilities back).
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(router.canGoBack()).toBe(false);
    expect(texts()).not.toContain('facility sign-in');
    expect(texts()).not.toContain('Waiting for approval');
    // The guard added nothing to the control's own navigation: the stack is taken down and
    // My facilities replaces the sign-in, and that is all.
    expect(navigations.map(([kind]) => kind)).toEqual(['POP_TO_TOP', 'REPLACE']);
    expect(navigations[1][1]).toBe('/facilities');
  });
});

describe("a facility's own SMS sign-in that ends in a session", () => {
  /**
   * As the app does it: app/otp.tsx stores the profile and replaces the code screen by the
   * home, and `noteFacilitySmsSignIn` (centralFacilities.ts) clears `facilitySmsOrigin` a
   * moment later, once the list is written. The real function is called, not a copy of it.
   */
  const signInWithOwnSms = async () => {
    await start();
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    await go(() => router.push('/otp'));
    expect(rootRoutes()).toEqual(['login', 'otp']);
    navigations = [];

    await act(async () => { mockAuthStore.set(PROFILE); router.replace('/'); });
    await wait(STEP_MS);
    await act(async () => { await noteFacilitySmsSignIn('approved'); });
    await wait(STEP_MS);
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  };

  it('is left as in a build without central login: the home over that sign-in, nothing taken off the stack', async () => {
    await signInWithOwnSms();
    expect(rootRoutes()).toEqual(['login', '(tabs)']);
    expect(mountedHomes()).toBe(1);
    // The guard adds nothing to the code screen's own navigation.
    expect(navigations).toEqual([['REPLACE', '/']]);
  });

  it('then a forced sign-out ends on My facilities alone, not on the facility\'s sign-in', async () => {
    await signInWithOwnSms();
    expect(rootRoutes()).toEqual(['login', '(tabs)']);

    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(mountedHomes()).toBe(0);
    expect(texts()).not.toContain('facility sign-in');
    expect(router.canGoBack()).toBe(false);
  });
});

describe('two My facilities mounted at once, however that came about', () => {
  const publish = async (outcome: OpenOutcome) => {
    await act(async () => { setCentralState({ outcome: { id: nextOutcomeId(), origin: ORIGIN, name: NAME, outcome } }); });
    await wait(STEP_MS);
  };
  const twoInstances = async () => {
    await start();
    await act(async () => { router.push('/facilities'); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['facilities', 'facilities']);
    expect(mountedFacilities()).toBe(2);
    navigations = [];
  };

  it('a refusal is said once', async () => {
    await twoInstances();
    await publish({ kind: 'failed', reason: 'account_unavailable', message: 'Dev Cold Storage has withdrawn your access.' });
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(getCentralState().outcome).toBeNull();
  });

  it('`pending` opens one waiting screen', async () => {
    jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-token');
    await twoInstances();
    await publish({ kind: 'pending' });
    expect(pushes('/pending-enrollment')).toBe(1);
    expect(rootRoutes()).toEqual(['facilities', 'facilities', 'pending-enrollment']);
  });

  it('`link_required` opens one code step', async () => {
    await twoInstances();
    await act(async () => { setCentralState({ pendingLink: { origin: ORIGIN, name: NAME, phoneNumber: USER.phoneNumber } }); });
    await publish({ kind: 'link_required', codeSent: true });
    expect(pushes('/facility-link')).toBe(1);
    expect(rootRoutes()).toEqual(['facilities', 'facilities', 'facility-link']);
  });
});

// ---------------------------------------------------------------------------------------
describe('central sign-in', () => {
  const PHONE = '+919000000001';
  beforeEach(() => {
    // As the real one: the session is stored and the central state says who is signed in.
    jest.mocked(verifyCentralCode).mockImplementation(async () => {
      setCentralState({ status: 'signedIn', user: USER, endedMessage: null });
      return { ok: true, user: USER } as never;
    });
  });
  const signIn = async () => {
    await act(async () => { setCentralState({ signInPhone: PHONE }); });
    await go(() => router.push('/central-otp'));
    await enterCode('482913');
    await wait(300);
    expect(verifyCentralCode).toHaveBeenCalledWith(PHONE, '482913', '2025-12');
  };

  it('a fresh sign-in ends on My facilities alone: Back has nothing to go back to', async () => {
    setCentralState({ status: 'signedOut', user: null });
    await start('/central-login');
    expect(rootRoutes()).toEqual(['central-login']);
    await signIn();

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(router.canGoBack()).toBe(false);
    expect(texts()).not.toContain('central sign-in');
  });

  it('the central session ends on "Add facility"; signing in again leaves one My facilities', async () => {
    await start();
    await go(() => router.push('/facility-catalogue'));
    expect(rootRoutes()).toEqual(['facilities', 'facility-catalogue']);

    // A signed central call was refused (endLocally in centralSession.ts): no rebuild of the tree.
    await act(async () => {
      setCentralState({
        status: 'signedOut', user: null, signInPhone: null, endedMessage: 'Your sign-in has ended. Sign in again.',
        facilitySmsOrigin: null, opening: null, outcome: null, pendingLink: null,
      });
    });
    await wait(STEP_MS);
    expect(pathname()).toBe('/central-login');
    expect(mountedFacilities()).toBe(0);
    await signIn();

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(router.canGoBack()).toBe(false);
  });

  describe('Back while the code is being checked', () => {
    /** The central service answers when the test says so. */
    let answer: (result: { ok: true } | { ok: false; message: string }) => void;
    const WRONG = 'That code is wrong or has expired.';
    const checkThenBack = async (back: boolean) => {
      setCentralState({ status: 'signedOut', user: null });
      await start('/central-login');
      jest.mocked(verifyCentralCode).mockImplementation(
        () =>
          new Promise(resolve => {
            answer = result => {
              // As the real one: the session is stored, and the central state says who is signed in.
              if (result.ok) setCentralState({ status: 'signedIn', user: USER, endedMessage: null });
              resolve({ ...result, user: USER } as never);
            };
          })
      );
      await act(async () => { setCentralState({ signInPhone: PHONE }); });
      await go(() => router.push('/central-otp'));
      await enterCode('482913');
      // The service has not answered yet.
      expect(verifyCentralCode).toHaveBeenCalledTimes(1);
      expect(rootRoutes()).toEqual(['central-login', 'central-otp']);
      if (back) {
        await pressBack();
        expect(pathname()).toBe('/central-login');
        expect(rootRoutes()).toEqual(['central-login']);
      }
      jest.mocked(showAlert).mockClear();
      navigations = [];
    };

    it('then a correct code: My facilities alone, once; the removed code step does not navigate again', async () => {
      await checkThenBack(true);
      await act(async () => { answer({ ok: true }); });
      await wait(500);

      expect(pathname()).toBe('/facilities');
      expect(rootRoutes()).toEqual(['facilities']);
      expect(mountedFacilities()).toBe(1);
      // The guard's own redirect (central sign-in is shown to a person who is signed in now) is
      // the only navigation: the code step, already removed, adds none.
      expect(navigations).toEqual([['REPLACE', '/facilities']]);
      expect(router.canGoBack()).toBe(false);
      // The sign-in itself is complete: the session is stored, and the terms tick is remembered.
      expect(getCentralState().status).toBe('signedIn');
      expect(await hasAcceptedTerms(PHONE)).toBe(true);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('then the code step is opened again, and the first check succeeds: My facilities alone, once', async () => {
      await checkThenBack(true);
      // "Send the code again" from central sign-in: a new code step, with a new check not yet made.
      await go(() => router.push('/central-otp'));
      expect(rootRoutes()).toEqual(['central-login', 'central-otp']);
      expect(verifyCentralCode).toHaveBeenCalledTimes(1);
      navigations = [];

      // The first check was made on the code step that is gone; the guard allows the new code
      // step to a person who is signed in, so nothing else would take them off it.
      await act(async () => { answer({ ok: true }); });
      await wait(500);

      expect(getCentralState().status).toBe('signedIn');
      expect(rootRoutes()).toEqual(['facilities']);
      expect(pathname()).toBe('/facilities');
      expect(mountedFacilities()).toBe(1);
      expect(texts()).not.toContain('central sign-in');
      expect(router.canGoBack()).toBe(false);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('then a second code step whose own (wrong) code is checked while the first check finishes: one navigation, from the shown step, and no message (A1)', async () => {
      await checkThenBack(true);
      const answerFirst = answer;
      await go(() => router.push('/central-otp'));
      expect(rootRoutes()).toEqual(['central-login', 'central-otp']);
      // The first check's last step, remembering the terms tick, is held: the window of backlog A1.
      let releaseTerms!: () => void;
      const termsHeld = new Promise<void>(resolve => { releaseTerms = resolve; });
      // AsyncStorage is already a mock here: its own implementation is wrapped, and put back below.
      const setItem = jest.mocked(AsyncStorage.setItem);
      const ordinarySetItem = setItem.getMockImplementation()!;
      setItem.mockImplementation(async (key: string, value: string) => {
        if (key.startsWith('central_terms_accepted_v1:')) await termsHeld;
        return ordinarySetItem(key, value);
      });
      // The first check stores the session (as the real one does) and waits in that last step.
      await act(async () => { answerFirst({ ok: true }); });
      await wait(STEP_MS);
      expect(getCentralState().status).toBe('signedIn');
      expect(rootRoutes()).toEqual(['central-login', 'central-otp']);
      navigations = [];

      // The shown code step checks a code of its own, and it is wrong.
      await enterCode('573910');
      expect(verifyCentralCode).toHaveBeenCalledTimes(2);
      await act(async () => { answer({ ok: false, message: WRONG }); });
      await wait(500);
      // Then the first check finishes.
      await act(async () => { releaseTerms(); });
      await wait(500);
      setItem.mockImplementation(ordinarySetItem);

      expect(showAlert).not.toHaveBeenCalled();
      expect(pathname()).toBe('/facilities');
      expect(rootRoutes()).toEqual(['facilities']);
      expect(mountedFacilities()).toBe(1);
      expect(router.canGoBack()).toBe(false);
      // One navigation to My facilities: the shown step's; the step that is gone adds none.
      expect(navigations.filter(([, href]) => href === '/facilities')).toHaveLength(1);
      // My facilities had its one chance to skip the list; nothing set it free again afterwards.
      expect(getCentralState().autoOpenSpent).toBe(true);
      expect(await hasAcceptedTerms(PHONE)).toBe(true);
    });

    it('with one approved facility, then a correct code: the facility opens by itself, once', async () => {
      await updateMyFacility('asha', ORIGIN, { status: 'approved', opened: true });
      answerWith(LOGIN, DURING_SPLASH);
      await checkThenBack(true);
      // Nothing has been opened yet.
      expect(discoverOperator).not.toHaveBeenCalled();
      expect(exchangeCentralIdentity).not.toHaveBeenCalled();

      // The code step that is gone set the start-up skip free before it stopped there: the
      // person signed in just now, so the one approved facility is opened without the list.
      await act(async () => { answer({ ok: true }); });
      await wait(BOOTSTRAP_MS + 2000);

      expect(discoverOperator).toHaveBeenCalledTimes(1);
      expect(exchangeCentralIdentity).toHaveBeenCalledTimes(1);
      expect(rootRoutes()).toEqual(['(tabs)']);
      expect(mountedHomes()).toBe(1);
      expect(mountedFacilities()).toBe(0);
      expect(router.canGoBack()).toBe(false);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('then a wrong code: nothing is said over the screen that is shown now', async () => {
      await checkThenBack(true);
      await act(async () => { answer({ ok: false, message: WRONG }); });
      await wait(500);

      expect(showAlert).not.toHaveBeenCalled();
      expect(pathname()).toBe('/central-login');
      expect(rootRoutes()).toEqual(['central-login']);
      expect(navigations).toEqual([]);
    });

    it('without Back, a wrong code is said once on the code step (the control for the case above)', async () => {
      await checkThenBack(false);
      await act(async () => { answer({ ok: false, message: WRONG }); });
      await wait(500);

      expect(showAlert).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(expect.any(String), WRONG);
      expect(rootRoutes()).toEqual(['central-login', 'central-otp']);
    });
  });
});

describe('a forced sign-out on a facility screen (the facility stays selected: no rebuild)', () => {
  const insideOnSettings = async () => {
    answerWith(LOGIN, DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    expect(rootRoutes()).toEqual(['(tabs)']);
    await go(() => router.push('/settings'));
    expect(rootRoutes()).toEqual(['(tabs)', 'settings']);
    // The facility ended the session; the central session is untouched.
    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);
  };

  it('My facilities, with nothing of the facility under it', async () => {
    await insideOnSettings();

    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(mountedHomes()).toBe(0);
    expect(router.canGoBack()).toBe(false);
  });

  it('inside a form with its own stack, past its first step: the same, the whole stack and not only the form\'s', async () => {
    answerWith(LOGIN, DURING_SPLASH);
    await start();
    await openAndSettle(DURING_SPLASH);
    await go(() => router.push('/grn-form/step1'));
    await go(() => router.push('/grn-form/step2'));
    expect(rootRoutes()).toEqual(['(tabs)', 'grn-form']);
    expect(texts()).toContain('form step 2');
    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);

    // The guard's pop has no target, but the form's own stack is unmounted with the refused
    // form before it runs, so it reaches the root stack (the comment at dismissAll in RouteGuard.tsx).
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(mountedHomes()).toBe(0);
    expect(texts().some(text => text.startsWith('form step'))).toBe(false);
    expect(router.canGoBack()).toBe(false);
  });

  it('opening the same facility again: one home, and Back has nothing central or doubled under it', async () => {
    await insideOnSettings();
    await tapFacility();
    await wait(DURING_SPLASH + 300);

    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(mountedHomes()).toBe(1);
    expect(mountedFacilities()).toBe(0);
    expect(router.canGoBack()).toBe(false);
  });
});

describe('the facility session ends after the central session has ended (no rebuild)', () => {
  /** Inside the facility on a screen pushed over its home; the central session ended on its own. */
  const insideWithoutCentralSession = async () => {
    mockAuthStore.set(PROFILE);
    await start('/');
    await go(() => router.push('/settings'));
    expect(rootRoutes()).toEqual(['(tabs)', 'settings']);
    // A signed central call was refused (endLocally in centralSession.ts); the facility keeps its session.
    await act(async () => {
      setCentralState({
        status: 'signedOut', user: null, signInPhone: null, endedMessage: 'Your sign-in has ended. Sign in again.',
        facilitySmsOrigin: null, opening: null, outcome: null, pendingLink: null,
      });
    });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['(tabs)', 'settings']);
    navigations = [];
  };

  it('then the facility session ends on that screen: central sign-in alone, and Back has nothing to go back to', async () => {
    await insideWithoutCentralSession();
    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);

    expect(pathname()).toBe('/central-login');
    // Not [(tabs), central-login]: one Back from there showed a spinner and then central sign-in again.
    expect(rootRoutes()).toEqual(['central-login']);
    expect(texts()).toContain('central sign-in');
    expect(mountedHomes()).toBe(0);
    expect(router.canGoBack()).toBe(false);
    expect(navigations.map(([kind]) => kind)).toEqual(['POP_TO_TOP', 'REPLACE']);
    expect(navigations[1][1]).toBe('/central-login');
  });

  it('on the home itself there is nothing to take off: central sign-in replaces it, as before', async () => {
    mockAuthStore.set(PROFILE);
    await start('/');
    await act(async () => { setCentralState({ status: 'signedOut', user: null, endedMessage: null }); });
    await wait(STEP_MS);
    navigations = [];
    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);

    expect(rootRoutes()).toEqual(['central-login']);
    expect(navigations).toEqual([['REPLACE', '/central-login']]);
  });
});

describe('sign-in is a start, also from a screen that has a stack of its own', () => {
  /** On the second step of a form that has its own stack, pushed over the facility's home. */
  const onSecondStepOfForm = async () => {
    mockAuthStore.set(PROFILE);
    await start('/');
    await go(() => router.push('/grn-form/step1'));
    await go(() => router.push('/grn-form/step2'));
    expect(rootRoutes()).toEqual(['(tabs)', 'grn-form']);
    expect(texts()).toContain('form step 2');
  };

  it('both sessions end: central sign-in alone, and Back has nothing to go back to', async () => {
    await onSecondStepOfForm();
    // The central session ends first (a refused signed call); the facility's session stays.
    await act(async () => { setCentralState({ status: 'signedOut', user: null, endedMessage: null }); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['(tabs)', 'grn-form']);
    navigations = [];

    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);

    // Not [(tabs), central-login]: one Back from there showed a spinner and then central sign-in again.
    expect(pathname()).toBe('/central-login');
    expect(rootRoutes()).toEqual(['central-login']);
    expect(texts()).toContain('central sign-in');
    expect(texts().some(text => text.startsWith('form step'))).toBe(false);
    expect(mountedHomes()).toBe(0);
    expect(router.canGoBack()).toBe(false);
    expect(navigations.map(([kind]) => kind)).toEqual(['POP_TO_TOP', 'REPLACE']);
  });

  it("the facility's own sign-in is in use: the facility's sign-in alone, and Back has nothing to go back to", async () => {
    await onSecondStepOfForm();
    // The person got in through the facility's own SMS sign-in, and the facility ends the session.
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['(tabs)', 'grn-form']);
    navigations = [];

    await act(async () => { mockAuthStore.set(null); });
    await wait(STEP_MS);

    expect(pathname()).toBe('/login');
    expect(rootRoutes()).toEqual(['login']);
    expect(texts()).toContain('facility sign-in');
    expect(texts().some(text => text.startsWith('form step'))).toBe(false);
    expect(mountedHomes()).toBe(0);
    expect(router.canGoBack()).toBe(false);
    expect(navigations.map(([kind]) => kind)).toEqual(['POP_TO_TOP', 'REPLACE']);
  });
});

describe("My facilities reached while the facility's own sign-in is in use", () => {
  it('a route that sends the person to the facility\'s sign-in takes the stack down first: one sign-in', async () => {
    await start();
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['login']);

    // A central route over the facility's sign-in (the origin still names a facility that is signed into by SMS).
    await go(() => router.push('/facilities'));
    expect(rootRoutes()).toEqual(['login']);
    expect(texts().filter(text => text === 'facility sign-in')).toHaveLength(1);
    expect(router.canGoBack()).toBe(false);
  });
});

describe('a facility session that arrives while a central screen is shown with anything under it', () => {
  it('My facilities pushed over the home of the facility the person is inside: the home alone, once', async () => {
    mockAuthStore.set(PROFILE);
    await start('/');
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(mountedHomes()).toBe(1);
    navigations = [];

    await go(() => router.push('/facilities'));
    // Not [(tabs), (tabs)]: replacing only My facilities put a second home on the first.
    expect(pathname()).toBe('/');
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(mountedHomes()).toBe(1);
    expect(mountedFacilities()).toBe(0);
    expect(router.canGoBack()).toBe(false);
    expect(navigations.map(([kind]) => kind)).toEqual(['PUSH', 'POP_TO_TOP', 'REPLACE']);
  });

  it('My facilities over a facility sign-in, and then a facility session: the home alone, not on top of the sign-in', async () => {
    jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-token');
    await start();
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    await go(() => router.push('/pending-enrollment'));
    expect(rootRoutes()).toEqual(['login', 'pending-enrollment']);
    // The way the waiting screen's control used to leave it: the sign-in under My facilities.
    // (The waiting screen is allowed with or without the facility's sign-in in use, so the guard
    // does not act between the two steps.)
    await act(async () => { setCentralState({ facilitySmsOrigin: null }); router.replace('/facilities'); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['login', 'facilities']);
    expect(mountedFacilities()).toBe(1);
    navigations = [];

    await act(async () => { mockAuthStore.set(PROFILE); });
    await wait(STEP_MS);
    expect(pathname()).toBe('/');
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(mountedHomes()).toBe(1);
    expect(mountedFacilities()).toBe(0);
    expect(router.canGoBack()).toBe(false);
    expect(navigations.map(([kind]) => kind)).toEqual(['POP_TO_TOP', 'REPLACE']);
  });
});
