/** A sheet that searches from zero letters (minQueryLength 0) lists everything as soon as it opens; the others wait for typing. */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { SearchableBottomSheet } from '../SearchableBottomSheet';

const mockSearchNow = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) }));
jest.mock('@/hooks', () => {
  const clear = jest.fn();
  const timeout = { current: null };
  return {
    useSearchAutocomplete: () => ({
      searchQuery: '', results: [], isLoading: false, handleSearchChange: jest.fn(), clearSearch: clear,
      performSearchNow: mockSearchNow, searchTimeoutRef: timeout,
    }),
  };
});
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

const mount = (props: { minQueryLength?: number; isVisible?: boolean; currentValue?: { id: string; name: string } | null }) => {
  act(() => {
    create(
      <SearchableBottomSheet<{ id: string }>
        isVisible={props.isVisible ?? true}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        title="Choose"
        searchFn={async () => []}
        renderItem={() => <></>}
        keyExtractor={i => i.id}
        minQueryLength={props.minQueryLength}
        currentValue={props.currentValue}
      />,
    );
  });
};

beforeEach(() => mockSearchNow.mockClear());

it('searches with nothing typed when it opens with minQueryLength 0', () => {
  mount({ minQueryLength: 0 });
  expect(mockSearchNow).toHaveBeenCalledWith('');
});

it('waits for typing with the default minimum, and while closed', () => {
  mount({});
  mount({ minQueryLength: 0, isVisible: false });
  expect(mockSearchNow).not.toHaveBeenCalled();
});
