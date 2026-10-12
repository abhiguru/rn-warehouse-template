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
import { addMyFacility, loadMyFacilities } from '@/config/centralFacilities';
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

type NavState = { routes: Array<{ name: string; state?: NavState }> };
const pathname = () => routerStore.getRouteInfo().pathname;
/** The routes of the app's root stack, bottom first, below expo-router's own wrapper route. */
const rootRoutes = (): string[] => {
  let state = routerStore.navigationRef.current?.getRootState() as NavState | undefined;
  while (state && state.routes.length === 1 && state.routes[0].name === '__root') state = state.routes[0].state;
  return state ? state.routes.map(route => route.name) : [];
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
  it('"My facilities" leaves exactly one My facilities', async () => {
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

    await pressButton('My facilities');
    expect(getCentralState().facilitySmsOrigin).toBeNull();
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes().filter(name => name === 'facilities')).toHaveLength(1);
    expect(mountedFacilities()).toBe(1);
    // The facility's sign-in is not shown to a person who belongs on My facilities.
    expect(texts()).not.toContain('facility sign-in');
    expect(rootRoutes()).toEqual(['login', 'facilities']);

    // Back passes the hidden sign-in route under it once; the guard brings My facilities back, alone.
    await pressBack();
    expect(pathname()).toBe('/facilities');
    expect(rootRoutes()).toEqual(['facilities']);
    expect(mountedFacilities()).toBe(1);
    expect(texts()).not.toContain('facility sign-in');
  });
});

describe("a facility's own SMS sign-in that ends in a session", () => {
  it('is left as in a build without central login: the home over that sign-in, nothing taken off the stack', async () => {
    await start();
    await act(async () => { setCentralState({ facilitySmsOrigin: ORIGIN }); });
    await wait(STEP_MS);
    await go(() => router.push('/otp'));
    expect(rootRoutes()).toEqual(['login', 'otp']);
    navigations = [];

    // As app/otp.tsx after a correct code: the profile, then its own replace.
    await act(async () => { mockAuthStore.set(PROFILE); router.replace('/'); });
    await wait(STEP_MS);
    expect(rootRoutes()).toEqual(['login', '(tabs)']);
    expect(mountedHomes()).toBe(1);
    // The guard adds nothing to the code screen's own navigation.
    expect(navigations).toEqual([['REPLACE', '/']]);
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
