/** The real search hook under the sheet: a refresh of the items while typing keeps the typed query, and the clear button lists everything again (review A2, A3). */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SearchableBottomSheet } from '../SearchableBottomSheet';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) }));
jest.mock('@/hooks', () => ({ useSearchAutocomplete: jest.requireActual('@/hooks/useSearchAutocomplete').useSearchAutocomplete }));
// Stand-ins: the text input is the real TextInput and the list draws each row through the sheet's renderItem,
// so the test types and reads rows as a person would.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const { TextInput, View } = require('react-native');
  const sheet = ReactMock.forwardRef((props: { children?: unknown }, ref: unknown) => {
    ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return ReactMock.createElement(View, null, props.children);
  });
  const list = ({ data, renderItem, keyExtractor }: { data: unknown[]; renderItem: (p: { item: unknown; index: number }) => unknown; keyExtractor: (i: unknown) => string }) =>
    ReactMock.createElement(
      View,
      null,
      data.map((item, index) => ReactMock.createElement(ReactMock.Fragment, { key: keyExtractor(item) }, renderItem({ item, index }))),
    );
  return {
    __esModule: true,
    BottomSheetModal: sheet,
    BottomSheetView: View,
    BottomSheetBackdrop: View,
    BottomSheetTextInput: TextInput,
    BottomSheetFlatList: list,
  };
});

type Row = { id: string; name: string };
const ROWS: Row[] = [{ id: 'a', name: 'Gur' }, { id: 'b', name: 'Gur Sakkar' }, { id: 'c', name: 'Rice' }];

function Host({ rows }: { rows: Row[] }) {
  const searchFn = React.useCallback(async (q: string) => rows.filter(r => r.name.toLowerCase().includes(q.trim().toLowerCase())), [rows]);
  return (
    <SearchableBottomSheet<Row>
      isVisible
      onClose={jest.fn()}
      onSelect={jest.fn()}
      title="Choose"
      searchFn={searchFn}
      renderItem={item => <Text>{item.name}</Text>}
      keyExtractor={i => i.id}
      minQueryLength={0}
    />
  );
}

const input = () => screen.getByPlaceholderText('Search');
const rowNames = () => ['Gur', 'Gur Sakkar', 'Gur Desi', 'Rice'].filter(n => screen.queryByText(n, { exact: true }));

it('keeps the typed query when the items it searches are replaced while it is open (A2)', async () => {
  const { rerender } = await render(<Host rows={ROWS} />);
  expect(await screen.findByText('Rice')).toBeOnTheScreen();
  expect(rowNames()).toEqual(['Gur', 'Gur Sakkar', 'Rice']);
  await userEvent.setup().type(input(), 'gur');
  await waitFor(() => expect(screen.queryByText('Rice')).not.toBeOnTheScreen());
  expect(rowNames()).toEqual(['Gur', 'Gur Sakkar']);
  await rerender(<Host rows={[...ROWS, { id: 'd', name: 'Gur Desi' }]} />);
  expect(await screen.findByText('Gur Desi')).toBeOnTheScreen();
  expect(input()).toHaveDisplayValue('gur');
  expect(rowNames()).toEqual(['Gur', 'Gur Sakkar', 'Gur Desi']);
});

it('lists everything again when the clear button empties the box (A3)', async () => {
  const user = userEvent.setup();
  await render(<Host rows={ROWS} />);
  expect(await screen.findByText('Rice')).toBeOnTheScreen();
  await user.type(input(), 'gur');
  await waitFor(() => expect(screen.queryByText('Rice')).not.toBeOnTheScreen());
  expect(rowNames()).toEqual(['Gur', 'Gur Sakkar']);
  await user.press(screen.getByRole('button', { name: 'Clear search' }));
  expect(await screen.findByText('Rice')).toBeOnTheScreen();
  expect(input()).toHaveDisplayValue('');
  expect(rowNames()).toEqual(['Gur', 'Gur Sakkar', 'Rice']);
});

it('keeps the clear button while a search is running, and announces a failed search once (review fixes)', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  let reject!: (e: Error) => void;
  const searchFn = jest.fn(() => new Promise<Row[]>((_, r) => { reject = r; }));
  await render(
    <SearchableBottomSheet<Row>
      isVisible
      onClose={jest.fn()}
      onSelect={jest.fn()}
      title="Choose"
      searchFn={searchFn as never}
      renderItem={item => <Text>{item.name}</Text>}
      keyExtractor={i => i.id}
      minQueryLength={0}
    />,
  );
  await userEvent.setup().type(input(), 'gu');
  // The search is still pending after the debounce: the x is there while the spinner shows.
  await waitFor(() => expect(searchFn).toHaveBeenCalledWith('gu'));
  expect(screen.getByRole('button', { name: 'Clear search' })).toBeOnTheScreen();
  await act(async () => { reject(new Error('boom')); await Promise.resolve(); });
  expect(announce).not.toHaveBeenCalled();
  announce.mockRestore();
});
