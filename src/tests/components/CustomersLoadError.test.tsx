import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null }, useIsFocused: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({
  customerService: {
    getCustomerList: jest.fn(),
    getCustomerCounts: jest.fn(async () => null),
    toggleCustomerActive: jest.fn(),
    inactivateCustomer: jest.fn(),
    restoreCustomer: jest.fn(),
  },
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));


beforeEach(() => {
  jest.mocked(customerService.getCustomerList).mockReset();
  mockState = { theme: { preference: 'light', brand: 'orange' } };
});

it('shows a retryable error, not the empty state, when the list fails to load', async () => {
  jest.mocked(customerService.getCustomerList)
    .mockResolvedValueOnce({ success: false, message: 'Failed to fetch customers', data: [] } as never)
    .mockResolvedValueOnce({ success: true, data: [], pagination: { total_count: 0 } } as never);
  await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
  expect(await screen.findByText(/Couldn't load customers/)).toBeOnTheScreen();
  expect(screen.queryByText(/No customers yet/)).not.toBeOnTheScreen();
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Try again' }));
  expect(customerService.getCustomerList).toHaveBeenCalledTimes(2);
  expect(await screen.findByText(/No customers yet/)).toBeOnTheScreen();
});

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('customers list in %s %s', (brand, mode) => {
  it('renders customer rows on the theme background', async () => {
    mockState = { theme: { preference: mode, brand } };
    jest.mocked(customerService.getCustomerList).mockResolvedValue({
      success: true,
      data: [
        { id: 'c1', name: 'Patel Traders', mobile: '9876543210', city: 'Rajkot', email: 'p@example.com', active: true },
        { id: 'c2', name: 'Shah Cold Store', mobile: '919812345678', city: null, email: null, active: false },
      ],
      pagination: { total_count: 2 },
    } as never);
    await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
    expect(await screen.findByText(/Patel Traders/)).toBeOnTheScreen();
    expect(screen.getByText(/\+91 98765 43210/)).toBeOnTheScreen();
    expect(screen.getByText(/\+91 98123 45678/)).toBeOnTheScreen();
    expect(screen.getAllByText(/Deactivated/)[0]).toBeOnTheScreen();
    const tokens = getTokens(brand, mode);
    // The theme background is a style on a plain View, which has no role or text: the tree is walked for it.
    const backgrounds: unknown[] = [];
    const walk = (node: NonNullable<typeof screen.root>) => {
      if (typeof node.type === 'string' && node.props.style) {
        backgrounds.push(([node.props.style].flat(Infinity) as { backgroundColor?: string }[]).find(s => s && s.backgroundColor)?.backgroundColor);
      }
      for (const child of node.children) if (typeof child !== 'string') walk(child as NonNullable<typeof screen.root>);
    };
    walk(screen.root as NonNullable<typeof screen.root>);
    expect(backgrounds).toContain(tokens.background.base);
  });
});

describe('customer active toggle', () => {
  const customers = [
    { id: 'c1', name: 'Patel Traders', mobile: '9876543210', city: 'Rajkot', email: null, active: true },
    { id: 'c2', name: 'Shah Cold Store', mobile: null, city: null, email: null, active: false },
  ];
  const rowFor = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

  beforeEach(() => {
    jest.mocked(showAlert).mockReset();
    jest.mocked(customerService.inactivateCustomer).mockReset().mockResolvedValue({ success: true } as never);
    jest.mocked(customerService.restoreCustomer).mockReset().mockResolvedValue({ success: true } as never);
    jest.mocked(customerService.getCustomerList).mockResolvedValue({
      success: true, data: customers, pagination: { total_count: 2 },
    } as never);
  });

  it('asks before deactivating, and only deactivates on confirm', async () => {
    await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
    await screen.findByText(/Patel Traders/);
    const row = rowFor('Patel Traders');
    expect(row).toHaveProp('accessibilityActions', [{ name: 'toggleActive', label: 'Deactivate' }]);
    // The screen reader's own action on the row: there is no gesture of a person for it.
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'toggleActive' } });
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe('Deactivate Patel Traders?');
    expect(buttons?.map(b => b.text)).toEqual(['Cancel', 'Deactivate customer']);
    expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
    await act(async () => { buttons?.[1].onPress?.(); });
    expect(customerService.inactivateCustomer).toHaveBeenCalledWith('c1');
  });

  it('activates an inactive customer without asking', async () => {
    await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
    await screen.findByText(/Shah Cold Store/);
    const row = rowFor('Shah Cold Store');
    expect(row).toHaveProp('accessibilityActions', [{ name: 'toggleActive', label: 'Activate' }]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'toggleActive' } });
    expect(showAlert).not.toHaveBeenCalled();
    expect(customerService.restoreCustomer).toHaveBeenCalledWith('c2');
  });
});
