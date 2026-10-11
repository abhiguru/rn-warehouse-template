/**
 * The pickers of the create forms listen for the Android Back key only while
 * they are open: the listener is added when the sheet opens and taken off
 * when it closes. A form adds its own listener when it comes into focus,
 * which is earlier, and React Native asks the listener added last first; so
 * the order "sheet after form" is what lets Back close an open sheet instead
 * of leaving the form (useBackHandler keeps the form's listener in place).
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { SearchableBottomSheet } from '../SearchableBottomSheet';
import { CustomerSearchBottomSheet, type CustomerSearchBottomSheetRef } from '../../CustomerSearchBottomSheet';

const mockModal = { present: jest.fn(), dismiss: jest.fn() };
const mockSheet = { expand: jest.fn(), close: jest.fn() };

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/hooks', () => ({
  useSearchAutocomplete: () => ({
    searchQuery: '',
    results: [],
    isLoading: false,
    handleSearchChange: jest.fn(),
    clearSearch: jest.fn(),
    performSearchNow: jest.fn(),
    searchTimeoutRef: { current: null },
  }),
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { getRecentCustomers: jest.fn(() => Promise.resolve([])), addRecentCustomer: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    default: ReactMock.forwardRef((props: object, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => mockSheet);
      return ReactMock.createElement('BottomSheet', props);
    }),
    BottomSheetModal: ReactMock.forwardRef((props: object, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => mockModal);
      return ReactMock.createElement('BottomSheetModal', props);
    }),
    BottomSheetView: 'BottomSheetView',
    BottomSheetBackdrop: 'BottomSheetBackdrop',
    BottomSheetTextInput: 'BottomSheetTextInput',
    BottomSheetFlatList: 'BottomSheetFlatList',
  };
});

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  back = installHardwareBack();
});
afterEach(() => {
  back.restore();
  jest.useRealTimers();
});

/** A form under the sheet: its listener is there first and would leave the form. */
const addFormListener = () => {
  const formBack = jest.fn(() => true);
  const { BackHandler } = require('react-native');
  BackHandler.addEventListener('hardwareBackPress', formBack);
  return formBack;
};

describe('SearchableBottomSheet (supervisor and customer pickers)', () => {
  const sheet = (isVisible: boolean) => (
    <SearchableBottomSheet<{ id: string }>
      isVisible={isVisible}
      onClose={jest.fn()}
      onSelect={jest.fn()}
      title="Select supervisor"
      placeholder="Search"
      searchFn={() => Promise.resolve([])}
      renderItem={(item) => <Text>{item.id}</Text>}
      keyExtractor={(item) => item.id}
    />
  );

  it('does not listen for Back while it is closed, from its first render on', async () => {
    const formBack = addFormListener();
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(sheet(false)); });

    expect(back.count()).toBe(1);
    back.press();
    expect(formBack).toHaveBeenCalledTimes(1);
    expect(mockModal.dismiss).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('takes Back once it is opened, ahead of the form under it, and gives it back when closed', async () => {
    const formBack = addFormListener();
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(sheet(false)); });

    await act(async () => { tree.update(sheet(true)); });
    expect(back.count()).toBe(2);
    expect(back.press()).toBe(true);
    expect(mockModal.dismiss).toHaveBeenCalledTimes(1);
    expect(formBack).not.toHaveBeenCalled();

    await act(async () => { tree.update(sheet(false)); });
    expect(back.count()).toBe(1);
    back.press();
    expect(formBack).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});

describe('CustomerSearchBottomSheet (sender and customer pickers)', () => {
  it('listens for Back only between opening and closing, ahead of the form under it', async () => {
    const formBack = addFormListener();
    const ref = React.createRef<CustomerSearchBottomSheetRef>();
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CustomerSearchBottomSheet ref={ref} onSelect={jest.fn()} />); });
    const reportIndex = async (index: number) => {
      await act(async () => { tree.root.findByType('BottomSheet' as unknown as React.ElementType).props.onChange(index); });
    };

    // Closed: only the form listens.
    expect(back.count()).toBe(1);

    await act(async () => { ref.current!.open(); });
    await reportIndex(0);
    expect(back.count()).toBe(2);
    expect(back.press()).toBe(true);
    expect(mockSheet.close).toHaveBeenCalledTimes(1);
    expect(formBack).not.toHaveBeenCalled();

    await reportIndex(-1);
    expect(back.count()).toBe(1);
    back.press();
    expect(formBack).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});
