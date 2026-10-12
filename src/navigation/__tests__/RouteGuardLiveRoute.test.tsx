/**
 * The root guard and the navigator's own state.
 *
 * useSegments() can be a render behind the navigator (after a server change rebuilt the
 * navigation tree): with central login the guard goes by the route the navigator really
 * shows. Entering a facility from a central screen takes the central screens off the
 * stack. Without central login the navigator's state is not consulted and nothing changes.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { anythingBelow, centralScreensInTheWay, liveRootRoute, myFacilitiesBelow, ROUTER_ROOT, useRootRouteGuard } from '../RouteGuard';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';

const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
/** The router calls in the order the guard made them. */
let mockCalls: string[] = [];
let mockSegments: string[] = [];
let mockRootState: unknown;
let mockCentralOn = true;
let mockAuth: { userProfile: unknown; session: unknown; user: unknown } = { userProfile: null, session: null, user: null };

jest.mock('expo-router', () => {
  const router = {
    replace: (href: string) => { mockCalls.push(`replace ${href}`); mockReplace(href); },
    dismissAll: () => { mockCalls.push('dismissAll'); mockDismissAll(); },
    dismissTo: (href: string) => { mockCalls.push(`dismissTo ${href}`); },
  };
  const navigationRef = { isReady: () => true, addListener: () => () => undefined, getRootState: () => mockRootState };
  return { useRouter: () => router, useSegments: () => mockSegments, useNavigationContainerRef: () => navigationRef };
});
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: mockAuth }),
}));
jest.mock('@/hooks/useTheme', () => ({ useTokens: () => ({ background: { base: 'bg' }, brand: { tint: 'tint' } }) }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' };
/** expo-router's root state: its own wrapper route, then the app's root stack. */
const rootState = (...names: string[]) => ({
  index: 0,
  routes: [{ name: '__root', state: { index: names.length - 1, routes: names.map(name => ({ name })) } }],
});

const STAFF = { id: 'profile-1', role: 'staff' };
const CUSTOMER = { id: 'profile-1', role: 'customer' };

function Root() {
  useRootRouteGuard(true);
  return null;
}
let renderer: ReactTestRenderer | undefined;
const render = async () => {
  await act(async () => { renderer = create(<Root />); });
};
const rerender = async () => {
  await act(async () => { renderer!.update(<Root />); });
};

beforeEach(() => {
  mockReplace.mockReset();
  mockDismissAll.mockReset();
  mockCalls = [];
  mockCentralOn = true;
  mockAuth = { userProfile: null, session: null, user: null };
  mockRootState = undefined;
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

describe("expo-router's wrapper route", () => {
  it('is still named as the guard expects (a change in expo-router must be followed in RouteGuard.tsx)', () => {
    // Read from the package itself, not from the mock above.
    const { INTERNAL_SLOT_NAME } = jest.requireActual('expo-router/build/constants');
    expect(typeof INTERNAL_SLOT_NAME).toBe('string');
    expect(ROUTER_ROOT).toBe(INTERNAL_SLOT_NAME);
  });
});

describe('liveRootRoute', () => {
  it('names the focused route of the root stack, below expo-router\'s wrapper', () => {
    expect(liveRootRoute(rootState('facilities', 'pending-enrollment') as never)).toBe('pending-enrollment');
    expect(liveRootRoute(rootState('(tabs)') as never)).toBe('(tabs)');
    expect(liveRootRoute({ routes: [{ name: 'grn-details/[id]' }] })).toBe('grn-details/[id]');
  });
  it('is undefined when there is nothing to read', () => {
    expect(liveRootRoute(undefined)).toBeUndefined();
    expect(liveRootRoute({ routes: [] })).toBeUndefined();
    expect(liveRootRoute({ index: 0, routes: [{ name: '__root' }] })).toBeUndefined();
  });
});

describe('segments behind the navigator', () => {
  it('central login: the stack already shows My facilities, so the stale "(tabs)" is not replaced again', async () => {
    mockSegments = ['(tabs)'];
    mockRootState = rootState('facilities');
    await render();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('central login: a screen My facilities has just opened on top is not replaced either', async () => {
    mockSegments = ['(tabs)'];
    mockRootState = rootState('facilities', 'facility-link');
    await render();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('central login: when the navigator shows a refused route too, the person is sent to My facilities', async () => {
    mockSegments = ['(tabs)'];
    mockRootState = rootState('(tabs)');
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/facilities');
  });

  it('central login: with no navigator state to read, the segments decide as before', async () => {
    mockSegments = ['(tabs)'];
    mockRootState = undefined;
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/facilities');
  });

  it('central login off: the navigator state is not consulted; a refused route goes to sign-in as before', async () => {
    mockCentralOn = false;
    mockSegments = ['(tabs)'];
    mockRootState = rootState('login');
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});

describe('centralScreensInTheWay', () => {
  it('is true when My facilities or central sign-in lies under the route that is shown', () => {
    expect(centralScreensInTheWay(rootState('facilities', 'facility-link') as never)).toBe(true);
    expect(centralScreensInTheWay(rootState('central-login', 'facilities') as never)).toBe(true);
    expect(centralScreensInTheWay(rootState('facilities', '(tabs)') as never)).toBe(true);
  });
  it('is true when a central screen is shown with anything under it', () => {
    expect(centralScreensInTheWay(rootState('(tabs)', 'facilities') as never)).toBe(true);
    expect(centralScreensInTheWay(rootState('login', 'facilities') as never)).toBe(true);
  });
  it('is false for a single route, for facility screens only, and when nothing can be read', () => {
    expect(centralScreensInTheWay(rootState('facilities') as never)).toBe(false);
    expect(centralScreensInTheWay(rootState('(tabs)', 'settings', 'grn-details/[id]') as never)).toBe(false);
    expect(centralScreensInTheWay(rootState('login', 'otp') as never)).toBe(false);
    expect(centralScreensInTheWay(undefined)).toBe(false);
  });
});

describe('anythingBelow', () => {
  it('is true only when the route that is shown has a route under it', () => {
    expect(anythingBelow(rootState('(tabs)', 'settings') as never)).toBe(true);
    expect(anythingBelow(rootState('(tabs)') as never)).toBe(false);
    expect(anythingBelow(undefined)).toBe(false);
  });
});

describe('a refused screen on top of My facilities', () => {
  it('myFacilitiesBelow: true only when My facilities lies under the route that is shown', () => {
    expect(myFacilitiesBelow(rootState('facilities', 'login') as never)).toBe(true);
    expect(myFacilitiesBelow(rootState('facilities') as never)).toBe(false);
    expect(myFacilitiesBelow(rootState('login', 'facilities') as never)).toBe(false);
    expect(myFacilitiesBelow(undefined)).toBe(false);
  });

  it("the facility's sign-in over My facilities: back to that My facilities, not a second one", async () => {
    mockSegments = ['login'];
    mockRootState = rootState('facilities', 'login');
    await render();
    expect(mockCalls).toEqual(['dismissTo /facilities']);
  });

  it('with no My facilities under the refused screen it is replaced, as before', async () => {
    mockSegments = ['login'];
    mockRootState = rootState('login');
    await render();
    expect(mockCalls).toEqual(['replace /facilities']);
  });
});

describe('a facility session that ends on a screen pushed over the home (no rebuild)', () => {
  it('My facilities takes the place of the whole stack, not of that one screen', async () => {
    mockSegments = ['settings'];
    mockRootState = rootState('(tabs)', 'settings');
    await render();
    expect(mockCalls).toEqual(['dismissAll', 'replace /facilities']);
  });

  it('on the home itself there is nothing to take off: it is replaced, as before', async () => {
    mockSegments = ['(tabs)'];
    mockRootState = rootState('(tabs)');
    await render();
    expect(mockCalls).toEqual(['replace /facilities']);
  });

  it('central login off: the screen is replaced by sign-in and the stack is left alone, as before', async () => {
    mockCentralOn = false;
    mockSegments = ['settings'];
    mockRootState = rootState('(tabs)', 'settings');
    await render();
    expect(mockCalls).toEqual(['replace /login']);
  });
});

describe('a facility session and the central screens', () => {
  it('a facility session while the navigator shows My facilities: the facility is entered', async () => {
    mockAuth = { userProfile: STAFF, session: null, user: null };
    mockSegments = ['facilities'];
    mockRootState = rootState('facilities');
    await render();
    // My facilities alone in the stack: replacing it is all it takes.
    expect(mockCalls).toEqual(['replace /']);
  });

  it('a facility session on the code step: the central screens under it are left first, then the facility is entered', async () => {
    mockAuth = { userProfile: STAFF, session: null, user: null };
    mockSegments = ['facility-link'];
    mockRootState = rootState('facilities', 'facility-link');
    await render();
    expect(mockCalls).toEqual(['dismissAll', 'replace /']);
  });

  it('a facility session while My facilities lies over a hidden home: the stack is taken down first, so there is one home', async () => {
    mockAuth = { userProfile: STAFF, session: null, user: null };
    mockSegments = ['facilities'];
    mockRootState = rootState('(tabs)', 'facilities');
    await render();
    expect(mockCalls).toEqual(['dismissAll', 'replace /']);
  });

  it('inside a facility a refused screen is replaced by home, and nothing else is taken off the stack', async () => {
    mockAuth = { userProfile: CUSTOMER, session: null, user: null };
    mockSegments = ['users'];
    mockRootState = rootState('(tabs)', 'settings', 'users');
    await render();
    expect(mockCalls).toEqual(['replace /']);
  });

  it('a central sign-out while the navigator shows a facility route: central sign-in', async () => {
    mockAuth = { userProfile: STAFF, session: null, user: null };
    mockSegments = ['(tabs)'];
    mockRootState = rootState('(tabs)');
    await render();
    expect(mockCalls).toEqual([]);

    // Signing out centrally also ends the facility session.
    mockAuth = { userProfile: null, session: null, user: null };
    await act(async () => { setCentralState({ status: 'signedOut', user: null }); });
    expect(mockCalls).toEqual(['replace /central-login']);
  });
});

describe('when the guard acts', () => {
  // The effect runs on a new decision, a new path or readiness, and on nothing else: a
  // profile that changes while the decision and the path stay the same asks for nothing new.
  it('central login off: a changed role with the same decision and path does not replace again', async () => {
    mockCentralOn = false;
    mockAuth = { userProfile: CUSTOMER, session: null, user: null };
    mockSegments = ['users'];
    mockRootState = rootState('(tabs)', 'users');
    await render();
    expect(mockCalls).toEqual(['replace /']);

    // Still a role that is not offered the screen: the decision is "home" as before.
    mockAuth = { userProfile: { id: 'profile-1', role: 'staff' }, session: null, user: null };
    await rerender();
    expect(mockCalls).toEqual(['replace /']);
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('central login off: entering after sign-in replaces the sign-in screen only, as before', async () => {
    mockCentralOn = false;
    mockAuth = { userProfile: STAFF, session: null, user: null };
    mockSegments = ['login'];
    // Even a state that names central screens is not read without central login.
    mockRootState = rootState('facilities', 'login');
    await render();
    expect(mockCalls).toEqual(['replace /']);
  });

  it('central login on: a changed role with the same decision and path does not replace again either', async () => {
    mockAuth = { userProfile: CUSTOMER, session: null, user: null };
    mockSegments = ['users'];
    mockRootState = rootState('(tabs)', 'users');
    await render();
    expect(mockCalls).toEqual(['replace /']);

    mockAuth = { userProfile: { id: 'profile-1', role: 'staff' }, session: null, user: null };
    await rerender();
    expect(mockCalls).toEqual(['replace /']);
  });
});
