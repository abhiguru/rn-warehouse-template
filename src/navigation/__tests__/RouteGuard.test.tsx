/**
 * The root guard: where a signed-out or wrong-role person ends up, and that a refused
 * screen is not mounted. expo-router is mocked; `decideRoute` is the real one.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GuardedScreen, useRootRouteGuard } from '../RouteGuard';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockAuth: { userProfile: unknown; session: unknown; user: unknown } = { userProfile: null, session: null, user: null };

// The root navigation container as expo-router hands it out. Like the real router, replace
// throws when it is called before the container is ready.
let mockNavigationReady = true;
const mockReadyListeners = new Set<() => void>();
const mockNavigationBecomesReady = () => {
  mockNavigationReady = true;
  for (const listener of [...mockReadyListeners]) listener();
};
jest.mock('expo-router', () => {
  const router = {
    replace: (...args: unknown[]) => {
      if (!mockNavigationReady) throw new Error('Attempted to navigate before mounting the Root Layout component.');
      mockReplace(...args);
    },
  };
  const navigationRef = {
    isReady: () => mockNavigationReady,
    addListener: (_event: string, listener: () => void) => {
      mockReadyListeners.add(listener);
      return () => mockReadyListeners.delete(listener);
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

const SIGNED_OUT = { userProfile: null, session: null, user: null };
const profile = (role: string) => ({ userProfile: { id: 'profile-1', role }, session: null, user: null });

let renderer: ReactTestRenderer | undefined;
let mountCount = 0;

function Screen() {
  React.useEffect(() => {
    mountCount += 1;
  }, []);
  return <Text>protected content</Text>;
}

function Root({ restored, routeName }: { restored: boolean; routeName: string }) {
  useRootRouteGuard(restored);
  return (
    <GuardedScreen routeName={routeName}>
      <Screen />
    </GuardedScreen>
  );
}

async function render(routeName: string, segments: string[], restored = true) {
  mockSegments = segments;
  await act(async () => {
    renderer = create(<Root restored={restored} routeName={routeName} />);
  });
}
const rerender = async (routeName: string, restored = true) => {
  await act(async () => {
    renderer!.update(<Root restored={restored} routeName={routeName} />);
  });
};
const showsContent = () => renderer!.root.findAllByType(Text).length === 1;
const showsSpinner = () => renderer!.root.findAllByProps({ testID: 'route-guard-pending' }).length > 0;

beforeEach(() => {
  mockNavigationReady = true;
  mockReadyListeners.clear();
  mockReplace.mockReset();
  mockAuth = SIGNED_OUT;
  mountCount = 0;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

describe('signed out', () => {
  it.each([
    ['reports/stock-summary', ['reports', 'stock-summary']],
    ['customers', ['customers']],
    ['users', ['users']],
    ['item-pricing', ['item-pricing']],
    ['list-filters', ['list-filters']],
    ['settings', ['settings']],
    ['(tabs)', ['(tabs)']],
  ])('%s goes to sign-in and its screen is never mounted', async (routeName, segments) => {
    await render(routeName, segments);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(showsSpinner()).toBe(true);
    expect(showsContent()).toBe(false);
    expect(mountCount).toBe(0);
  });

  it.each(['login', 'otp', 'operator-server', 'pending-enrollment', 'terms-of-service', 'privacy-policy'])(
    '%s is shown without a redirect',
    async (route) => {
      await render(route, [route]);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(showsContent()).toBe(true);
    }
  );

  it('does nothing until the stored session has been restored, then redirects once', async () => {
    await render('customers', ['customers'], false);
    expect(mockReplace).not.toHaveBeenCalled();

    await rerender('customers', true);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');

    // The redirect has landed on the sign-in screen: no second redirect, no loop.
    mockSegments = ['login'];
    await rerender('login', true);
    await rerender('login', true);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(showsContent()).toBe(true);
  });
});

// RM-4: the real router throws when asked to navigate before the root navigator is ready.
describe('a root navigator that is not ready yet', () => {
  it('signed out on a cold start: nothing is thrown, the spinner shows, and sign-in opens once it is ready', async () => {
    mockNavigationReady = false;
    await render('(tabs)', ['(tabs)']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(showsSpinner()).toBe(true);
    expect(mountCount).toBe(0);

    await act(async () => mockNavigationBecomesReady());
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockReadyListeners.size).toBe(0);
  });

  it('a wrong-role link waits the same way and then goes home', async () => {
    mockAuth = profile('customer');
    mockNavigationReady = false;
    await render('users', ['users']);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => mockNavigationBecomesReady());
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('a navigator that became ready between render and effect is noticed without an event', async () => {
    mockNavigationReady = false;
    mockSegments = ['customers'];
    await act(async () => {
      renderer = create(<Root restored routeName="customers" />);
      mockNavigationReady = true;
    });
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});

describe('signed in', () => {
  it('a restored session opens the linked screen with no redirect', async () => {
    mockAuth = profile('customer');
    await render('reports/stock-summary', ['reports', 'stock-summary']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(showsContent()).toBe(true);
    expect(mountCount).toBe(1);
  });

  it('a Supabase user with a session counts as signed in', async () => {
    mockAuth = { userProfile: null, session: { access_token: 'token' }, user: { id: 'user-1' } };
    await render('settings', ['settings']);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(showsContent()).toBe(true);
  });

  it('a forced sign-out on a screen outside the tabs goes to sign-in', async () => {
    mockAuth = profile('admin');
    await render('users', ['users']);
    expect(mockReplace).not.toHaveBeenCalled();

    mockAuth = SIGNED_OUT;
    await rerender('users');
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(showsContent()).toBe(false);
  });

  it.each([
    ['customer', 'items', ['items']],
    ['customer', 'item-pricing', ['item-pricing']],
    ['customer', 'sensors', ['sensors']],
    ['staff', 'customers', ['customers']],
    ['staff', 'users', ['users']],
    ['staff', 'reports/operations-dashboard', ['reports', 'operations-dashboard']],
    ['supervisor', 'enrollment-review', ['enrollment-review']],
  ])('a %s who opens %s by link is sent home and the screen is not mounted', async (role, routeName, segments) => {
    mockAuth = profile(role);
    await render(routeName, segments);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mountCount).toBe(0);
  });

  it('the sign-in screen stays mounted under the code step while the profile arrives', async () => {
    // Stack: login under otp. The focused route is the code step.
    await render('login', ['otp']);
    expect(showsContent()).toBe(true);

    mockAuth = profile('staff');
    await rerender('login');
    // No redirect from the guard: the code step navigates itself. The sign-in screen
    // underneath is neither unmounted nor remounted.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(showsContent()).toBe(true);
    expect(mountCount).toBe(1);
  });

  it('a signed-in person who lands on the sign-in screen itself is sent home', async () => {
    mockAuth = profile('staff');
    await render('login', ['login']);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
