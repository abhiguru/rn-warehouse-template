/**
 * The dispatch GRN picker searches only the GRNs of the dispatch's customer.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GRNAutocompleteBottomSheet } from '../GRNAutocompleteBottomSheet';
import { searchGRNNumbers, getCustomerGRNsWithStock, getGRNPrefixesWithStock } from '../../services/grnDetailService';

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

  it("loads the prefix buttons for the dispatch customer, null when there is none, and reloads when it changes", async () => {
    const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
    const tree = await open(CUSTOMER_A);
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_A);

    await act(async () => {
      tree.update(<GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={CUSTOMER_B} />);
    });
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_B);
    await act(async () => { tree.unmount(); });

    jest.mocked(getGRNPrefixesWithStock).mockClear();
    const none = await open();
    expect(getGRNPrefixesWithStock).not.toHaveBeenCalled();
    await act(async () => { none.unmount(); });
  });

  it('ignores a slow reply for a previous customer when the answers arrive out of order', async () => {
    const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
    let resolveSlowPrefixes!: (v: { prefix: string; grnCount: number }[]) => void;
    let resolveSlowGrns!: (v: never[]) => void;
    jest.mocked(getGRNPrefixesWithStock)
      .mockImplementationOnce(() => new Promise((r) => { resolveSlowPrefixes = r; }))
      .mockResolvedValueOnce([{ prefix: 'B', grnCount: 1 }]);
    jest.mocked(getCustomerGRNsWithStock)
      .mockImplementationOnce(() => new Promise((r) => { resolveSlowGrns = r as never; }))
      .mockResolvedValueOnce([{ grnId: 'g-b', grNo: 'B-1', grnDate: '2026-01-01', customerName: 'Bee' }] as never);
    const tree = await open(CUSTOMER_A);
    await act(async () => {
      tree.update(<GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={CUSTOMER_B} />);
    });
    await act(async () => {
      resolveSlowPrefixes([{ prefix: 'A', grnCount: 9 }]);
      resolveSlowGrns([]);
    });
    const labels = tree.root
      .findAll((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels).toContain('Use GRN prefix B, 1 GRNs');
    expect(labels.some((l) => l.startsWith('Use GRN prefix A'))).toBe(false);
    const shown = tree.root
      .findAll((node) => (node.type as unknown) === 'Text')
      .map((node) => [node.props.children].flat().join(''));
    expect(shown).toContain('GRN B-1');
    await act(async () => { tree.unmount(); });
  });

  it('a prefix button with several letters ("DV") searches that prefix, and digits go after it', async () => {
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValueOnce([{ prefix: 'DV', grnCount: 2 }, { prefix: 'A', grnCount: 1 }]);
    const tree = await open(CUSTOMER_A);

    await tapKey(tree, 'Use GRN prefix DV, 2 GRNs');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await tapKey(tree, 'Enter GRN digit 1');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV1', CUSTOMER_A, { startsWith: 'DV' });
    await act(async () => { tree.unmount(); });
  });

  it('does not search every customer when the dispatch has no customer yet', async () => {
    const tree = await open(undefined);

    // With no customer there are no prefix buttons, so there is no digit key to tap either.
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Enter GRN digit 7')).toHaveLength(0);
    expect(searchGRNNumbers).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  const texts = (tree: ReactTestRenderer) =>
    tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
  const pressRetry = async (tree: ReactTestRenderer) => {
    const retry = tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Try again');
    await act(async () => { retry.props.onPress(); });
  };

  it('says the GRNs could not be loaded, not that there is no stock, and reads both again on "Try again"', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getCustomerGRNsWithStock).mockRejectedValueOnce(new Error('500'));
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    const tree = await open(CUSTOMER_A);

    expect(texts(tree)).toContain("Couldn't load the GRNs. Check your connection and try again.");
    expect(texts(tree)).not.toContain('No GRNs with stock');

    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce([]);
    await pressRetry(tree);

    expect(getCustomerGRNsWithStock).toHaveBeenCalledTimes(2);
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_A);
    expect(texts(tree)).toContain('No GRNs with stock');
    await act(async () => { tree.unmount(); });
  });

  it('says so when the search fails, and searches again on "Try again"', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(searchGRNNumbers).mockRejectedValueOnce(new Error('500'));
    const tree = await open(CUSTOMER_A);

    await tapKey(tree, 'Enter GRN digit 7');
    expect(texts(tree)).toContain("Couldn't load the GRNs. Check your connection and try again.");
    expect(texts(tree)).not.toContain('No GRNs match');

    await pressRetry(tree);
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    await act(async () => { tree.unmount(); });
  });
  const pressLabelled = async (tree: ReactTestRenderer, label: string) => {
    const node = tree.root.find((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
    await act(async () => { node.props.onPress(); await jest.advanceTimersByTimeAsync(200); });
  };

  it('backspacing past the prefix, or Clear, goes back to a plain "contains" search', async () => {
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValue([{ prefix: 'DV', grnCount: 2 }]);
    const tree = await open(CUSTOMER_A);

    await tapKey(tree, 'Use GRN prefix DV, 2 GRNs');
    await tapKey(tree, 'Enter GRN digit 1');
    await pressLabelled(tree, 'Delete last character');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await pressLabelled(tree, 'Delete last character');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('D', CUSTOMER_A);

    await tapKey(tree, 'Use GRN prefix DV, 2 GRNs');
    await pressLabelled(tree, 'Clear search');
    await tapKey(tree, 'Enter GRN digit 5');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('5', CUSTOMER_A);
    await act(async () => { tree.unmount(); });
  });

  it('"Try again" after an anchored search keeps the anchored mode', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValue([{ prefix: 'DV', grnCount: 2 }]);
    const tree = await open(CUSTOMER_A);
    jest.mocked(searchGRNNumbers).mockRejectedValueOnce(new Error('500'));

    await tapKey(tree, 'Use GRN prefix DV, 2 GRNs');
    await pressRetry(tree);
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await act(async () => { tree.unmount(); });
  });
});
