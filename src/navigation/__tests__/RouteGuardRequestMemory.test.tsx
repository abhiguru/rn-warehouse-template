/**
 * The guard remembers the way out it asked for, so a path that moves inside the refused route does not
 * repeat it. A request that never lands (the navigator shows the same route after its next state change)
 * is forgotten and asked for again. Both with central login off and on.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GuardedScreen, useRootRouteGuard } from '../RouteGuard';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockAuth: { userProfile: unknown; session: unknown; user: unknown } = { userProfile: null, session: null, user: null };
let mockCentralOn = false;
let mockShown = 'reports/stock-summary';
let mockBelow: string[] = [];
const mockStateListeners = new Set<() => void>();
const emitState = async () => {
  await act(async () => { [...mockStateListeners].forEach((listener) => listener()); });
};

jest.mock('expo-router', () => {
  const router = { replace: (...args: unknown[]) => mockReplace(...args), dismissAll: jest.fn(), dismissTo: jest.fn() };
  const navigationRef = {
    isReady: () => true,
    getRootState: () => ({ routes: [...mockBelow, mockShown].map((name) => ({ name })) }),
    addListener: (_event: string, listener: () => void) => {
      mockStateListeners.add(listener);
      return () => mockStateListeners.delete(listener);
    },
  };
  return { useRouter: () => router, useSegments: () => mockSegments, useNavigationContainerRef: () => navigationRef };
});
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: mockAuth }),
}));
jest.mock('@/hooks/useTheme', () => ({
  useTokens: () => ({ background: { base: 'bg' }, brand: { tint: 'tint' } }),
}));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));

let renderer: ReactTestRenderer | undefined;
function Root({ routeName }: { routeName: string }) {
  useRootRouteGuard(true);
  return (
    <GuardedScreen routeName={routeName}>
      <Text>screen content</Text>
    </GuardedScreen>
  );
}
const mount = async (routeName: string, segments: string[]) => {
  mockSegments = segments;
  await act(async () => { renderer = create(<Root routeName={routeName} />); });
};
const moveTo = async (routeName: string, segments: string[]) => {
  mockSegments = segments;
  await act(async () => { renderer!.update(<Root routeName={routeName} />); });
};

beforeEach(() => {
  mockReplace.mockReset();
  mockStateListeners.clear();
  mockShown = 'reports/stock-summary';
  mockBelow = [];
  mockAuth = { userProfile: null, session: null, user: null };
  resetCentralStateForTests();
  setCentralState({ status: 'signedOut' });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

describe.each([
  ['central login off', false, '/login'],
  ['central login on', true, '/central-login'],
])('%s', (_name, centralOn, target) => {
  beforeEach(() => { mockCentralOn = centralOn; });

  it('a path that moves inside the refused route does not repeat the way out', async () => {
    await mount('reports/stock-summary', ['reports', 'stock-summary']);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(target);
    await moveTo('reports/stock-summary', ['reports', 'stock-aging']);
    await moveTo('reports/stock-summary', ['reports']);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('a state change that moves the navigator does not ask again', async () => {
    await mount('reports/stock-summary', ['reports', 'stock-summary']);
    mockShown = 'something-else';
    await emitState();
    await moveTo('reports/stock-summary', ['reports']);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('a replace that never lands is asked for again after the next state change', async () => {
    await mount('reports/stock-summary', ['reports', 'stock-summary']);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    // The navigator still shows the refused route after its state change: nothing moved.
    await emitState();
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenLastCalledWith(target);
  });
});

it('central login on, a way out of two calls: one state change is not a lost request, the second is', async () => {
  mockCentralOn = true;
  mockBelow = ['(tabs)'];
  await mount('reports/stock-summary', ['reports', 'stock-summary']);
  expect(mockReplace).toHaveBeenCalledTimes(1);
  await emitState();
  expect(mockReplace).toHaveBeenCalledTimes(1);
  await emitState();
  expect(mockReplace).toHaveBeenCalledTimes(2);
});
