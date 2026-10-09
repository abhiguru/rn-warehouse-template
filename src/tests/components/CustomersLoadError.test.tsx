import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Text: require('react-native').Text }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/theme/fioriColors', () => ({
  useFioriColors: () => ({ colors: new Proxy({}, { get: () => '#ffffff' }) }),
}));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), toggleCustomerActive: jest.fn() },
}));

const shownText = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join(' | ');

it('shows a retryable error, not "No Customers", when the list fails to load', async () => {
  jest.mocked(customerService.getCustomerList)
    .mockResolvedValueOnce({ success: false, message: 'Failed to fetch customers', data: [] } as never)
    .mockResolvedValueOnce({ success: true, data: [], pagination: { total_count: 0 } } as never);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<CustomersScreen />); });
  expect(shownText(tree)).toContain('Unable to load customers');
  expect(shownText(tree)).not.toContain('No Customers');
  const retry = tree.root.findAll(node => node.props.accessibilityRole === 'button' &&
    node.findAllByType(Text).some(t => t.props.children === 'Retry'))[0];
  await act(async () => { retry.props.onPress(); });
  expect(customerService.getCustomerList).toHaveBeenCalledTimes(2);
  expect(shownText(tree)).toContain('No Customers');
  await act(async () => { tree.unmount(); });
});
