import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null }, useIsFocused: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({
  customerService: {
    getCustomerList: jest.fn(),
    toggleCustomerActive: jest.fn(),
    inactivateCustomer: jest.fn(),
    restoreCustomer: jest.fn(),
  },
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const shownText = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join(' | ');

beforeEach(() => {
  jest.mocked(customerService.getCustomerList).mockReset();
  mockState = { theme: { preference: 'light', brand: 'orange' } };
});

it('shows a retryable error, not the empty state, when the list fails to load', async () => {
  jest.mocked(customerService.getCustomerList)
    .mockResolvedValueOnce({ success: false, message: 'Failed to fetch customers', data: [] } as never)
    .mockResolvedValueOnce({ success: true, data: [], pagination: { total_count: 0 } } as never);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CustomersScreen />); });
  expect(shownText(tree)).toContain("Couldn't load customers");
  expect(shownText(tree)).not.toContain('No customers yet');
  const retry = tree.root.findAll(node => node.props.accessibilityRole === 'button' &&
    node.findAllByType(Text).some(t => t.props.children === 'Try again'))[0];
  await act(async () => { retry.props.onPress(); });
  expect(customerService.getCustomerList).toHaveBeenCalledTimes(2);
  expect(shownText(tree)).toContain('No customers yet');
  await act(async () => { tree.unmount(); });
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
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CustomersScreen />); });
    const text = shownText(tree);
    expect(text).toContain('Patel Traders');
    expect(text).toContain('+91 98765 43210');
    expect(text).toContain('+91 98123 45678');
    expect(text).toContain('Inactive');
    const tokens = getTokens(brand, mode);
    const backgrounds = tree.root
      .findAll(node => typeof node.type === 'string' && node.props.style)
      .map(node => [node.props.style].flat(Infinity).find(s => s && s.backgroundColor)?.backgroundColor);
    expect(backgrounds).toContain(tokens.background.base);
    await act(async () => { tree.unmount(); });
  });
});

describe('customer active toggle', () => {
  const customers = [
    { id: 'c1', name: 'Patel Traders', mobile: '9876543210', city: 'Rajkot', email: null, active: true },
    { id: 'c2', name: 'Shah Cold Store', mobile: null, city: null, email: null, active: false },
  ];
  const rowFor = (tree: ReturnType<typeof create>, name: string) =>
    tree.root.findAll(node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(name) &&
      typeof node.props.onAccessibilityAction === 'function')[0];

  beforeEach(() => {
    jest.mocked(showAlert).mockReset();
    jest.mocked(customerService.inactivateCustomer).mockReset().mockResolvedValue({ success: true } as never);
    jest.mocked(customerService.restoreCustomer).mockReset().mockResolvedValue({ success: true } as never);
    jest.mocked(customerService.getCustomerList).mockResolvedValue({
      success: true, data: customers, pagination: { total_count: 2 },
    } as never);
  });

  it('asks before deactivating, and only deactivates on confirm', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CustomersScreen />); });
    const row = rowFor(tree, 'Patel Traders');
    expect(row.props.accessibilityActions).toEqual([{ name: 'toggleActive', label: 'Deactivate' }]);
    await act(async () => { row.props.onAccessibilityAction({ nativeEvent: { actionName: 'toggleActive' } }); });
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe('Deactivate Patel Traders?');
    expect(buttons?.map(b => b.text)).toEqual(['Cancel', 'Deactivate customer']);
    expect(customerService.inactivateCustomer).not.toHaveBeenCalled();
    await act(async () => { buttons?.[1].onPress?.(); });
    expect(customerService.inactivateCustomer).toHaveBeenCalledWith('c1');
    await act(async () => { tree.unmount(); });
  });

  it('activates an inactive customer without asking', async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<CustomersScreen />); });
    const row = rowFor(tree, 'Shah Cold Store');
    expect(row.props.accessibilityActions).toEqual([{ name: 'toggleActive', label: 'Activate' }]);
    await act(async () => { row.props.onAccessibilityAction({ nativeEvent: { actionName: 'toggleActive' } }); });
    expect(showAlert).not.toHaveBeenCalled();
    expect(customerService.restoreCustomer).toHaveBeenCalledWith('c2');
    await act(async () => { tree.unmount(); });
  });
});
