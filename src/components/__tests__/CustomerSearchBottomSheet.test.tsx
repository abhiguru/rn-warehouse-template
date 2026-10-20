/** Review fixes: a late failure cannot overwrite a newer answer, clearing resets the failure, the x stays while searching. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CustomerSearchBottomSheet, type CustomerSearchBottomSheetRef } from '../CustomerSearchBottomSheet';
import { searchService } from '@/services/search-service';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomersOrThrow: jest.fn() } }));
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { getRecentCustomers: jest.fn(() => Promise.resolve([])), addRecentCustomer: jest.fn() },
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const sheet = ReactMock.forwardRef((props: object, ref: unknown) => {
    ReactMock.useImperativeHandle(ref, () => ({ expand: jest.fn(), close: jest.fn() }));
    return ReactMock.createElement('BottomSheet', props, (props as { children?: unknown }).children);
  });
  return {
    __esModule: true,
    default: sheet,
    BottomSheetBackdrop: 'BottomSheetBackdrop',
    BottomSheetTextInput: 'BottomSheetTextInput',
    BottomSheetFlatList: ({ data, ListEmptyComponent }: { data: unknown[]; ListEmptyComponent?: React.ReactElement }) =>
      ReactMock.createElement('BottomSheetFlatList', { data }, data && data.length ? null : ListEmptyComponent),
  };
});

const search = jest.mocked(searchService.searchCustomersOrThrow);
let tree: ReactTestRenderer;
const input = () => tree.root.findByType('BottomSheetTextInput' as never);
const failedShown = () => tree.root.findAllByType(Text).some(n => [n.props.children].flat().join('').includes("Couldn't search customers"));
const clearButtons = () => tree.root.findAll(n => n.props.accessibilityLabel === 'Clear search' && typeof n.props.onPress === 'function');
const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

beforeEach(async () => {
  jest.clearAllMocks();
  const ref = React.createRef<CustomerSearchBottomSheetRef>();
  await act(async () => { tree = create(<CustomerSearchBottomSheet ref={ref} onSelect={jest.fn()} />); });
});
afterEach(async () => { await act(async () => { tree.unmount(); }); });

it('keeps the x while a search runs', async () => {
  search.mockReturnValue(new Promise(() => {}) as never);
  await act(async () => { input().props.onChangeText('ac'); });
  await wait(400);
  expect(search).toHaveBeenCalled();
  expect(clearButtons().length).toBe(1);
});

it('a late failure of an older search does not replace a newer answer', async () => {
  let failFirst!: (e: Error) => void;
  search
    .mockReturnValueOnce(new Promise((_, reject) => { failFirst = reject; }) as never)
    .mockResolvedValueOnce([{ value: 'c1', label: 'Acme Foods', detail: 'Rajkot' }] as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => { input().props.onChangeText('ac'); });
  await wait(400);
  await act(async () => { input().props.onChangeText('acm'); });
  await wait(400);
  const list = () => tree.root.findByType('BottomSheetFlatList' as never).props.data as { value: string }[];
  expect(list().map(r => r.value)).toEqual(['c1']);
  await act(async () => { failFirst(new Error('late')); await Promise.resolve(); });
  expect(list().map(r => r.value)).toEqual(['c1']);
  expect(failedShown()).toBe(false);
});

it('clearing the text after a failure clears the failure', async () => {
  search.mockRejectedValueOnce(new Error('down'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => { input().props.onChangeText('ac'); });
  await wait(400);
  expect(failedShown()).toBe(true);
  await act(async () => { input().props.onChangeText(''); });
  expect(failedShown()).toBe(false);
});
