import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), toggleCustomerActive: jest.fn() },
}));

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
