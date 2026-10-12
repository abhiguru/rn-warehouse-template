/**
 * The root guard when useSegments() is behind the navigator (after a server change
 * rebuilt the navigation tree): with central login it goes by the route the navigator
 * really shows; without central login nothing changes.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { liveRootRoute, useRootRouteGuard } from '../RouteGuard';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockRootState: unknown;
let mockCentralOn = true;

jest.mock('expo-router', () => {
  const router = { replace: (...args: unknown[]) => mockReplace(...args) };
  const navigationRef = { isReady: () => true, addListener: () => () => undefined, getRootState: () => mockRootState };
  return { useRouter: () => router, useSegments: () => mockSegments, useNavigationContainerRef: () => navigationRef };
});
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: { userProfile: null, session: null, user: null } }),
}));
jest.mock('@/hooks/useTheme', () => ({ useTokens: () => ({ background: { base: 'bg' }, brand: { tint: 'tint' } }) }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' };
/** expo-router's root state: its own wrapper route, then the app's root stack. */
const rootState = (...names: string[]) => ({
  index: 0,
  routes: [{ name: '__root', state: { index: names.length - 1, routes: names.map(name => ({ name })) } }],
});

function Root() {
  useRootRouteGuard(true);
  return null;
}
let renderer: ReactTestRenderer | undefined;
const render = async () => {
  await act(async () => { renderer = create(<Root />); });
};

beforeEach(() => {
  mockReplace.mockReset();
  mockCentralOn = true;
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
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
