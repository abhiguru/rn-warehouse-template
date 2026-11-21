/** Review fixes: a late failure cannot overwrite a newer answer, clearing resets the failure, the x stays while searching. */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CustomerSearchBottomSheet, type CustomerSearchBottomSheetRef } from '../CustomerSearchBottomSheet';
import { searchService } from '@/services/search-service';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomersOrThrow: jest.fn() } }));
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { getRecentCustomers: jest.fn(() => Promise.resolve([])), addRecentCustomer: jest.fn() },
}));
// The sheet as a plain box; its text input is the real one and its list draws every row, so what a person sees can be read.
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
    BottomSheetTextInput: require('react-native').TextInput,
    BottomSheetFlatList: ({ data, renderItem, ListEmptyComponent }: { data: unknown[]; renderItem: (p: { item: unknown }) => React.ReactNode; ListEmptyComponent?: React.ReactElement }) =>
      ReactMock.createElement(
        'BottomSheetFlatList',
        null,
        data && data.length
          ? data.map((item, index) => ReactMock.createElement(ReactMock.Fragment, { key: index }, renderItem({ item })))
          : ListEmptyComponent
      ),
  };
});

const search = jest.mocked(searchService.searchCustomersOrThrow);
const FAILED = "Couldn't search customers. Check your connection and try again.";
let release: (() => void) | undefined;
const user = userEvent.setup({ delay: 0 });

beforeEach(async () => {
  jest.clearAllMocks();
  release = undefined;
  const ref = React.createRef<CustomerSearchBottomSheetRef>();
  await render(<CustomerSearchBottomSheet ref={ref} onSelect={jest.fn()} />);
});
afterEach(() => {
  // A search held open by a test is settled so Jest can exit.
  release?.();
  jest.restoreAllMocks();
});

it('keeps the x while a search runs', async () => {
  search.mockReturnValue(new Promise<never>(resolve => { release = () => resolve([] as never); }));
  await user.paste(screen.getByLabelText('Search customers'), 'ac');
  await waitFor(() => expect(search).toHaveBeenCalled());
  expect(screen.getAllByRole('button', { name: 'Clear search' })).toHaveLength(1);
});

it('a late failure of an older search does not replace a newer answer', async () => {
  let failFirst!: (e: Error) => void;
  search
    .mockReturnValueOnce(new Promise((_, reject) => { failFirst = reject; }) as never)
    .mockResolvedValueOnce([{ value: 'c1', label: 'Acme Foods', detail: 'Rajkot' }] as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const field = screen.getByLabelText('Search customers');
  await user.paste(field, 'ac');
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
  await user.paste(field, 'acm');
  expect(await screen.findByRole('button', { name: 'Acme Foods, Rajkot' })).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: /, Rajkot$/ })).toHaveLength(1);
  await act(async () => { failFirst(new Error('late')); await Promise.resolve(); });
  expect(screen.getByRole('button', { name: 'Acme Foods, Rajkot' })).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: /, Rajkot$/ })).toHaveLength(1);
  expect(screen.queryByText(FAILED)).not.toBeOnTheScreen();
});

it('clearing the text after a failure clears the failure', async () => {
  search.mockRejectedValueOnce(new Error('down'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await user.paste(screen.getByLabelText('Search customers'), 'ac');
  expect(await screen.findByText(FAILED)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.queryByText(FAILED)).not.toBeOnTheScreen();
});
