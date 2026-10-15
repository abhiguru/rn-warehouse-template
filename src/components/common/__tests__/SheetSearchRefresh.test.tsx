/** The real search hook under the sheet: a refresh of the items while typing keeps the typed query, and the clear button lists everything again (review A2, A3). */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { SearchableBottomSheet } from '../SearchableBottomSheet';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) }));
jest.mock('@/hooks', () => ({ useSearchAutocomplete: jest.requireActual('@/hooks/useSearchAutocomplete').useSearchAutocomplete }));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const sheet = ReactMock.forwardRef((props: object, ref: unknown) => {
    ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return ReactMock.createElement('BottomSheetModal', props);
  });
  return {
    __esModule: true,
    BottomSheetModal: sheet,
    BottomSheetView: 'BottomSheetView',
    BottomSheetBackdrop: 'BottomSheetBackdrop',
    BottomSheetTextInput: 'BottomSheetTextInput',
    BottomSheetFlatList: 'BottomSheetFlatList',
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
      renderItem={() => <></>}
      keyExtractor={i => i.id}
      minQueryLength={0}
    />
  );
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const input = (tree: ReturnType<typeof create>) => tree.root.findByType('BottomSheetTextInput' as never);
const listData = (tree: ReturnType<typeof create>) => (tree.root.findByType('BottomSheetFlatList' as never).props.data as Row[]).map(r => r.id);

it('keeps the typed query when the items it searches are replaced while it is open (A2)', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Host rows={ROWS} />); });
  await flush();
  expect(listData(tree)).toEqual(['a', 'b', 'c']);
  await act(async () => { input(tree).props.onChangeText('gur'); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(listData(tree)).toEqual(['a', 'b']);
  await act(async () => { tree.update(<Host rows={[...ROWS, { id: 'd', name: 'Gur Desi' }]} />); });
  await flush();
  expect(input(tree).props.value).toBe('gur');
  expect(listData(tree)).toEqual(['a', 'b', 'd']);
});

it('lists everything again when the clear button empties the box (A3)', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Host rows={ROWS} />); });
  await flush();
  await act(async () => { input(tree).props.onChangeText('gur'); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(listData(tree)).toEqual(['a', 'b']);
  const clear = tree.root.findAll(n => n.props.accessibilityLabel === 'Clear search' && typeof n.props.onPress === 'function')[0];
  await act(async () => { clear.props.onPress(); });
  await flush();
  expect(input(tree).props.value).toBe('');
  expect(listData(tree)).toEqual(['a', 'b', 'c']);
});
