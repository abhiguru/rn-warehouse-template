/**
 * The root guard with central login configured: where each sign-in state is sent, and
 * that a facility screen is never mounted for a person who is only signed in centrally.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GuardedScreen, useRootRouteGuard } from '../RouteGuard';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockAuth: { userProfile: unknown; session: unknown; user: unknown } = { userProfile: null, session: null, user: null };
let mockCentralOn = true;

jest.mock('expo-router', () => {
  const router = { replace: (...args: unknown[]) => mockReplace(...args) };
  const navigationRef = { isReady: () => true, addListener: () => () => undefined };
  return { useRouter: () => router, useSegments: () => mockSegments, useNavigationContainerRef: () => navigationRef };
});
jest.mock('@/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ auth: mockAuth }),
}));
jest.mock('@/hooks/useTheme', () => ({
  useTokens: () => ({ background: { base: 'bg' }, brand: { tint: 'tint' } }),
}));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => mockCentralOn }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' };
let renderer: ReactTestRenderer | undefined;

function Root({ routeName }: { routeName: string }) {
  useRootRouteGuard(true);
  return (
    <GuardedScreen routeName={routeName}>
      <Text>screen content</Text>
    </GuardedScreen>
  );
}
async function render(routeName: string, segments: string[]) {
  mockSegments = segments;
  await act(async () => {
    renderer = create(<Root routeName={routeName} />);
  });
}
const showsContent = () => renderer!.root.findAllByType(Text).length === 1;
const showsSpinner = () => renderer!.root.findAllByProps({ testID: 'route-guard-pending' }).length > 0;

beforeEach(() => {
  mockReplace.mockReset();
  mockAuth = { userProfile: null, session: null, user: null };
  mockCentralOn = true;
  resetCentralStateForTests();
  setCentralState({ status: 'signedOut' });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

it('signed in nowhere: a facility screen is not mounted and the person goes to central sign-in', async () => {
  await render('(tabs)', ['(tabs)']);
  expect(showsSpinner()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/central-login');
  expect(mockReplace).not.toHaveBeenCalledWith('/login');
});

it('signed in nowhere: central sign-in is shown as it is', async () => {
  await render('central-login', ['central-login']);
  expect(showsContent()).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
});

it('signed in centrally with no facility session: a facility screen is not mounted and the person goes to My facilities', async () => {
  setCentralState({ status: 'signedIn', user: USER });
  await render('settings', ['settings']);
  expect(showsSpinner()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/facilities');
});

it('signed in centrally: My facilities is shown, and signing out centrally sends the person to central sign-in', async () => {
  setCentralState({ status: 'signedIn', user: USER });
  await render('facilities', ['facilities']);
  expect(showsContent()).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => { setCentralState({ status: 'signedOut', user: null }); });
  expect(showsSpinner()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/central-login');
});

it("a facility's own sign-in screen is not mounted for a person who belongs on My facilities", async () => {
  setCentralState({ status: 'signedIn', user: USER });
  await render('login', ['login']);
  expect(showsSpinner()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/facilities');
});

it("choosing a facility's own SMS sign-in leads from My facilities to its sign-in screen, and giving it up leads back", async () => {
  setCentralState({ status: 'signedIn', user: USER });
  await render('facilities', ['facilities']);
  await act(async () => { setCentralState({ facilitySmsOrigin: 'https://north-cold.example.test' }); });
  expect(mockReplace).toHaveBeenLastCalledWith('/login');

  await act(async () => renderer!.unmount());
  mockReplace.mockReset();
  await render('login', ['login']);
  expect(showsContent()).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => { setCentralState({ facilitySmsOrigin: null }); });
  expect(mockReplace).toHaveBeenLastCalledWith('/facilities');
});

it('a facility session that arrives while My facilities is shown enters the facility', async () => {
  setCentralState({ status: 'signedIn', user: USER });
  await render('facilities', ['facilities']);
  mockAuth = { userProfile: { id: 'profile-1', role: 'staff' }, session: null, user: null };
  await act(async () => { renderer!.update(<Root routeName="facilities" />); });
  expect(mockReplace).toHaveBeenLastCalledWith('/');
});

it('central login off: the central state is not consulted and a signed-out person goes to the facility sign-in', async () => {
  mockCentralOn = false;
  setCentralState({ status: 'signedIn', user: USER });
  await render('(tabs)', ['(tabs)']);
  expect(mockReplace).toHaveBeenCalledWith('/login');
  await act(async () => renderer!.unmount());
  mockReplace.mockReset();
  await render('facilities', ['facilities']);
  expect(showsSpinner()).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/login');
});
