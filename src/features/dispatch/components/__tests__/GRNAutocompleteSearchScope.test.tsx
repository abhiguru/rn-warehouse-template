/**
 * The dispatch GRN picker searches only the GRNs of the dispatch's customer.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GRNAutocompleteBottomSheet } from '../GRNAutocompleteBottomSheet';
import { searchGRNNumbers } from '../../services/grnDetailService';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../services/grnDetailService', () => ({
  searchGRNNumbers: jest.fn(async () => []),
  getGRNPrefixesWithStock: jest.fn(async () => [{ prefix: 'A', grnCount: 3 }]),
  getCustomerGRNsWithStock: jest.fn(async () => []),
}));

const CUSTOMER_A = '33333333-2222-4333-8444-555555555555';

async function open(customerId?: string) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={customerId} />
    );
  });
  return tree;
}

/** Tap a key of the sheet's own keypad and let its 150 ms debounce pass. */
async function tapKey(tree: ReactTestRenderer, label: string) {
  const key = tree.root.find(
    (node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label
  );
  await act(async () => {
    key.props.onPress();
    await jest.advanceTimersByTimeAsync(200);
  });
}

describe('GRN picker search', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it("passes the dispatch customer to the search", async () => {
    const tree = await open(CUSTOMER_A);

    await tapKey(tree, 'Enter GRN digit 7');

    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(searchGRNNumbers).toHaveBeenCalledWith('7', CUSTOMER_A);
    await act(async () => { tree.unmount(); });
  });

  it('does not search every customer when the dispatch has no customer yet', async () => {
    const tree = await open(undefined);

    await tapKey(tree, 'Enter GRN digit 7');

    expect(searchGRNNumbers).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
