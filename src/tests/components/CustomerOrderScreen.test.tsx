/**
 * The order screen of one business (app/orders/[customerId].tsx) keeps its editor
 * mounted (phone review 2026-10-14, OI-01). The auth state gets new objects for
 * the same person whenever a token is renewed or the profile is read again; the
 * screen used to read the customer's name again for each and show its spinner
 * meanwhile, which unmounted the order editor and the Add items picker inside it.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import CustomerOrderScreen from '../../../app/orders/[customerId]';
import { router } from 'expo-router';

const mockParams: { customerId?: string } = { customerId: 'customer-fictional-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/skeletons/DetailSkeleton', () => ({
  DetailSkeleton: ({ tabCount, cardCount }: { tabCount?: number; cardCount?: number }) =>
    require('react').createElement(require('react-native').Text, null, `Loading, ${tabCount} tab, ${cardCount} cards`),
}));
jest.mock('@/components/ChangeLogBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/change-log-service', () => ({ ChangeLogService: { getCustomerChangeLog: jest.fn() } }));

// The editor is a stand-in that counts how often it is mounted and unmounted.
const mockEditor = { mounts: 0, unmounts: 0, props: undefined as undefined | { customerId?: string; itemCatalogOpen?: boolean; staffView?: boolean; businessDeactivated?: boolean; businessRecordUnread?: boolean; onBusinessDeleted?: () => void; onOrderNumber?: (orderNo: string | undefined) => void } };
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
      return ReactActual.createElement(require('react-native').Text, null, 'Order editor');
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

// WH-216: the loading state is the detail skeleton (tabCount 1, cardCount 3), not a spinner. The stand-in draws the two
// counts it was asked for, so a skeleton of another shape would not be counted.
const spinners = () => screen.queryAllByText('Loading, 1 tab, 3 cards').length;
const editors = () => screen.queryAllByText('Order editor').length;
const plus = () => screen.getByRole('button', { name: 'Add items to order' });

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

it('shows the spinner only until the first name arrives', async () => {
  let arrive!: (answer: { data: { name: string }; error: null }) => void;
  mockNameRead.mockReturnValueOnce(new Promise(resolve => { arrive = resolve; }));
  await render(<CustomerOrderScreen />);
  expect(spinners()).toBe(1);
  expect(editors()).toBe(0);

  await act(async () => { arrive({ data: { name: 'Fictional Farms' }, error: null }); });
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);
  expect(screen.getByText(/Order for Fictional Farms/)).toBeOnTheScreen();
  expect(mockEditor.props?.customerId).toBe('customer-fictional-1');
});

it('keeps the editor mounted, reads no name and shows no spinner when the auth objects are new but the person is the same', async () => {
  await render(<CustomerOrderScreen />);
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(mockEditor.mounts).toBe(1);

  // Were the name read again, it would not come back: a spinner would stay on screen.
  mockNameRead.mockReturnValue(new Promise(() => undefined));

  // A profile read again: a new but equal profile object.
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { ...mockState.auth.userProfile } } };
  await screen.rerender(<CustomerOrderScreen />);
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);

  // A renewed token: new user and session objects.
  mockState = { ...mockState, auth: { ...mockState.auth, user: { id: 'user-fictional' }, session: { access_token: 'fictional-token-2' } } };
  await screen.rerender(<CustomerOrderScreen />);
  expect(mockNameRead).toHaveBeenCalledTimes(1);
  expect(spinners()).toBe(0);
  expect(editors()).toBe(1);

  // The same editor all along: mounted once, never unmounted.
  expect(mockEditor.mounts).toBe(1);
  expect(mockEditor.unmounts).toBe(0);
  expect(router.replace).not.toHaveBeenCalled();
});

it('keeps the picker\'s open flag across those renders', async () => {
  await render(<CustomerOrderScreen />);
  await userEvent.setup({ delay: 0 }).press(plus());
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { ...mockState.auth.userProfile } } };
  await screen.rerender(<CustomerOrderScreen />);
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);
  expect(mockEditor.mounts).toBe(1);
});

it('still leaves for sign-in when the person is signed out', async () => {
  await render(<CustomerOrderScreen />);
  expect(router.replace).not.toHaveBeenCalled();
  mockState = { ...mockState, auth: { userProfile: null, user: null, session: null } };
  await screen.rerender(<CustomerOrderScreen />);
  expect(router.replace).toHaveBeenCalledWith('/login');
  expect(editors()).toBe(0);
  expect(screen.toJSON()).toBeNull();
});

it('counts a session without a profile yet as signed in, as before', async () => {
  mockState = { ...mockState, auth: { ...mockState.auth, userProfile: null } };
  await render(<CustomerOrderScreen />);
  expect(router.replace).not.toHaveBeenCalled();
  expect(editors()).toBe(1);
});

it('shows the spinner at once for another business, closes the picker and drops the old name', async () => {
  await render(<CustomerOrderScreen />);
  await userEvent.setup({ delay: 0 }).press(plus());
  expect(mockEditor.props?.itemCatalogOpen).toBe(true);

  let arrive!: (answer: { data: { name: string }; error: null }) => void;
  mockNameRead.mockReturnValue(new Promise(resolve => { arrive = resolve; }));
  mockParams.customerId = 'customer-fictional-2';
  await screen.rerender(<CustomerOrderScreen />);
  expect(spinners()).toBe(1);
  expect(editors()).toBe(0);
  expect(screen.queryByText(/Fictional Farms/)).not.toBeOnTheScreen();

  // When the name arrives, the editor is for the new business and its picker is closed.
  await act(async () => { arrive({ data: { name: 'Second Traders' }, error: null }); });
  expect(spinners()).toBe(0);
  expect(mockEditor.props?.customerId).toBe('customer-fictional-2');
  expect(mockEditor.props?.itemCatalogOpen).toBe(false);
  expect(screen.getByText(/Second Traders/)).toBeOnTheScreen();
});

describe('a business that is deactivated or deleted', () => {

  it('leaves the header Add items button on for an active business', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: true, deleted_at: null }, error: null });
    await render(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
    expect(mockEditor.props?.businessDeactivated).toBe(false);
  });

  it('keeps the header Add items button on for a deactivated business and tells the editor to show the tag', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: false, deleted_at: null }, error: null });
    await render(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
    expect(mockEditor.props?.businessDeactivated).toBe(true);
  });

  it('keeps the header Add items button on and the banner flag set when the record says deleted and inactive: only the server refusal turns it off', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: false, deleted_at: '2026-10-01T00:00:00Z' }, error: null });
    await render(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
    expect(mockEditor.props?.businessDeactivated).toBe(true);
  });

  it('turns it off when the facility refuses the order, and tells the editor who is looking', async () => {
    mockState = { ...mockState, auth: { ...mockState.auth, userProfile: { id: 'profile-fictional', role: 'staff' } } };
    await render(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
    expect(mockEditor.props?.staffView).toBe(true);
    await act(async () => { mockEditor.props?.onBusinessDeleted?.(); });
    expect(plus()).toBeDisabled();
  });

  it('keeps telling the editor the business is deactivated after the server refuses it (older facility)', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: false, deleted_at: null }, error: null });
    await render(<CustomerOrderScreen />);
    await act(async () => { mockEditor.props?.onBusinessDeleted?.(); });
    expect(mockEditor.props?.businessDeactivated).toBe(true);
    expect(plus()).toBeDisabled();
  });

  it('tells the editor the record could not be read, so a staff refusal gets the plain sentence', async () => {
    mockNameRead.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await render(<CustomerOrderScreen />);
    expect(mockEditor.props?.businessRecordUnread).toBe(true);
    expect(mockEditor.props?.businessDeactivated).toBe(false);
  });

  it('clears the earlier refusal when a fresh record read for that business succeeds', async () => {
    mockNameRead.mockResolvedValue({ data: { name: 'Fictional Farms', active: true, deleted_at: null }, error: null });
    await render(<CustomerOrderScreen />);
    await act(async () => { mockEditor.props?.onBusinessDeleted?.(); });
    expect(plus()).toBeDisabled();
    // Another business and back: the record is read again and decides.
    mockParams.customerId = 'customer-fictional-2';
    await screen.rerender(<CustomerOrderScreen />);
    mockParams.customerId = 'customer-fictional-1';
    await screen.rerender(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
  });

  it('clears the earlier refusal on a fresh read of that business even when the read fails', async () => {
    await render(<CustomerOrderScreen />);
    await act(async () => { mockEditor.props?.onBusinessDeleted?.(); });
    expect(plus()).toBeDisabled();
    mockNameRead.mockResolvedValue({ data: null, error: { message: 'offline' } });
    mockParams.customerId = 'customer-fictional-2';
    await screen.rerender(<CustomerOrderScreen />);
    mockParams.customerId = 'customer-fictional-1';
    await screen.rerender(<CustomerOrderScreen />);
    expect(plus()).toBeEnabled();
  });

  it('is a customer view for a customer login', async () => {
    await render(<CustomerOrderScreen />);
    expect(mockEditor.props?.staffView).toBe(false);
  });
});

it('shows the order number under "Order for …" once the editor has read the order, and drops it for another business', async () => {
  await render(<CustomerOrderScreen />);
  // The number sits in the header next to the title and has no role of its own; its testID is the way to it.
  const numbers = () => screen.queryAllByTestId('order-screen-number');
  expect(numbers()).toHaveLength(0);

  await act(async () => { mockEditor.props!.onOrderNumber!('ORD-0042'); });
  expect(numbers()[0]).toHaveTextContent(/ORD-0042/);
  expect(numbers()[0]).toHaveTextContent(/Order/);

  mockParams.customerId = 'customer-fictional-2';
  await screen.rerender(<CustomerOrderScreen />);
  expect(numbers()).toHaveLength(0);
});
