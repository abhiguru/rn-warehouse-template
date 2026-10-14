/**
 * The order screen of one business (app/orders/[customerId].tsx) keeps its editor
 * mounted (phone review 2026-10-14, OI-01). The auth state gets new objects for
 * the same person whenever a token is renewed or the profile is read again; the
 * screen used to read the customer's name again for each and show its spinner
 * meanwhile, which unmounted the order editor and the Add items picker inside it.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerOrderScreen from '../../../app/orders/[customerId]';
import { router } from 'expo-router';

const mockParams: { customerId?: string } = { customerId: 'customer-fictional-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/ChangeLogBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/change-log-service', () => ({ ChangeLogService: { getCustomerChangeLog: jest.fn() } }));

// The editor is a stand-in that counts how often it is mounted and unmounted.
const mockEditor = { mounts: 0, unmounts: 0, props: undefined as undefined | { customerId?: string; itemCatalogOpen?: boolean; staffView?: boolean; businessInactive?: boolean; onBusinessInactive?: () => void } };
jest.mock('@/components/OrderManagement', () => {
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    default: (props: { customerId?: string; itemCatalogOpen?: boolean }) => {
      mockEditor.props = props;
      ReactActual.useEffect(() => {
        mockEditor.mounts += 1;
        return () => { mockEditor.unmounts += 1; };
      }, []);
      return ReactActual.createElement('OrderEditor');
    },
  };
});

// The read of the customer's name: from('customers').select('name').eq('id', id).single().
const mockNameRead = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mockNameRead }) }) }),
  })),
}));

const signedInState = () => ({
  theme: { preference: 'light', brand: 'orange' },
  auth: {
    userProfile: { id: 'profile-fictional', role: 'customer', name: 'Fictional Customer' },
    user: { id: 'user-fictional' },
    session: { access_token: 'fictional-token' },
  } as { userProfile: object | null; user: object | null; session: object | null },
});
let mockState = signedInState();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

let renderer: ReactTestRenderer | undefined;
const spinners = () => renderer!.root.findAllByType(ActivityIndicator).length;
const editors = () => renderer!.root.findAllByType('OrderEditor' as never).length;
const screenText = () => JSON.stringify(renderer!.toJSON());

beforeEach(() => {
  mockState = signedInState();
  mockParams.customerId = 'customer-fictional-1';
  mockEditor.mounts = 0;
  mockEditor.unmounts = 0;
  mockEditor.props = undefined;
  mockNameRead.mockReset().mockResolvedValue({ data: { name: 'Fictional Farms' }, error: null });
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
});

it('shows the spinner only until the first name arrives', async () => {
  let arrive!: (answer: { data: { name: string }; error: null }) => void;
  mockNameRead.mockReturnValueOnce(new Promise(resolve => { arrive = resolve; }));
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  expect(spinners()).toBe(1);
  expect(editors()).toBe(0);

  await act(async () => { arrive({ data: { name: 'Fictional Farms' }, error: null }); });
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);
  expect(screenText()).toContain('Order for Fictional Farms');
  expect(mockEditor.props?.customerId).toBe('customer-fictional-1');
});

it('keeps the editor mounted, reads no name and shows no spinner when the auth objects are new but the person is the same', async () => {
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(mockEditor.mounts).toBe(1);

  // Were the name read again, it would not come back: a spinner would stay on screen.
  mockNameRead.mockReturnValue(new Promise(() => undefined));

  // A profile read again: a new but equal profile object.
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { ...mockState.auth.userProfile } } };
  await act(async () => { renderer!.update(<CustomerOrderScreen />); });
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);

  // A renewed token: new user and session objects.
  mockState = { ...mockState, auth: { ...mockState.auth, user: { id: 'user-fictional' }, session: { access_token: 'fictional-token-2' } } };
  await act(async () => { renderer!.update(<CustomerOrderScreen />); });
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);

  // The same editor all along: mounted once, never unmounted.
  expect(mockEditor.mounts).toBe(1);
  expect(mockEditor.unmounts).toBe(0);
  expect(router.replace).not.toHaveBeenCalled();
});

it('keeps the picker\'s open flag across those renders', async () => {
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  await act(async () => {
    renderer!.root.findAll(candidate =>
      candidate.props.accessibilityLabel === 'Add items to order' && typeof candidate.props.onPress === 'function')[0].props.onPress();
  });
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { ...mockState.auth.userProfile } } };
  await act(async () => { renderer!.update(<CustomerOrderScreen />); });
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);
  expect(mockEditor.mounts).toBe(1);
});

it('still leaves for sign-in when the person is signed out', async () => {
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  expect(router.replace).not.toHaveBeenCalled();
  mockState = { ...mockState, auth: { userProfile: null, user: null, session: null } };
  await act(async () => { renderer!.update(<CustomerOrderScreen />); });
  expect(router.replace).toHaveBeenCalledWith('/login');
  expect(editors()).toBe(0);
  expect(renderer!.toJSON()).toBeNull();
});

it('counts a session without a profile yet as signed in, as before', async () => {
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: null } };
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  expect(router.replace).not.toHaveBeenCalled();
  expect(editors()).toBe(1);
});

it('shows the spinner at once for another business, closes the picker and drops the old name', async () => {
  await act(async () => { renderer = create(<CustomerOrderScreen />); });
  await act(async () => {
    renderer!.root.findAll(candidate =>
      candidate.props.accessibilityLabel === 'Add items to order' && typeof candidate.props.onPress === 'function')[0].props.onPress();
  });
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);

  let arrive!: (answer: { data: { name: string }; error: null }) => void;
  mockNameRead.mockReturnValue(new Promise(resolve => { arrive = resolve; }));
  mockParams.customerId = 'customer-fictional-2';
  await act(async () => { renderer!.update(<CustomerOrderScreen />); });
  expect(spinners()).toBe(1);
  expect(editors()).toBe(0);
  expect(screenText()).not.toContain('Fictional Farms');

  // When the name arrives, the editor is for the new business and its picker is closed.
  await act(async () => { arrive({ data: { name: 'Second Traders' }, error: null }); });
  expect(spinners()).toBe(0);
  expect(mockEditor.props?.customerId).toBe('customer-fictional-2');
  expect(mockEditor.props?.itemCatalogOpen).toBe(false);
  expect(screenText()).toContain('Second Traders');
});

describe('a business that is turned off', () => {
  const plus = () => renderer!.root.findAll(node => node.props.accessibilityLabel === 'Add items to order' && typeof node.props.onPress === 'function')[0];

  it('leaves the header Add items button on for an active business', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: true, deleted_at: null }, error: null });
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    expect(plus().props.disabled).toBeFalsy();
    expect(mockEditor.props?.businessInactive).toBe(false);
  });

  it.each([
    ['deactivated', { active: false, deleted_at: null }],
    ['deleted', { active: true, deleted_at: '2026-10-01T00:00:00Z' }],
  ])('turns the header Add items button off and tells the editor when the record says %s', async (_name, record) => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', ...record }, error: null });
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    expect(plus().props.disabled).toBe(true);
    expect(mockEditor.props?.businessInactive).toBe(true);
  });

  it('turns it off when the facility refuses the order, and tells the editor who is looking', async () => {
    mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { id: 'profile-fictional', role: 'staff' } } };
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    expect(plus().props.disabled).toBeFalsy();
    expect(mockEditor.props?.staffView).toBe(true);
    await act(async () => { mockEditor.props?.onBusinessInactive?.(); });
    expect(plus().props.disabled).toBe(true);
  });

  it('is a customer view for a customer login', async () => {
    await act(async () => { renderer = create(<CustomerOrderScreen />); });
    expect(mockEditor.props?.staffView).toBe(false);
  });
});
