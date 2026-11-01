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

let errorSpy: jest.SpyInstance | undefined;

describe('GRN picker search', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
    errorSpy?.mockRestore();
    errorSpy = undefined;
  });

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
    // The keypad and the list can both offer "Try again"; either one reads again.
    const retry = tree.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Try again')[0];
    await act(async () => { retry.props.onPress(); });
  };

  it('says the GRNs could not be loaded, not that there is no stock, and reads both again on "Try again"', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValue([{ prefix: 'DV', grnCount: 2 }]);
    const tree = await open(CUSTOMER_A);
    jest.mocked(searchGRNNumbers).mockRejectedValueOnce(new Error('500'));

    await tapKey(tree, 'Use GRN prefix DV, 2 GRNs');
    await pressRetry(tree);
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await act(async () => { tree.unmount(); });
  });
  it('with no customer, says to choose one (keypad and list) and never "no stock left"', async () => {
    const tree = await open(undefined);
    const shown = texts(tree);
    expect(shown.filter((x) => x === 'Choose a customer in the first step to see their GRNs.')).toHaveLength(2);
    expect(shown).not.toContain('No GRNs have stock left.');
    await act(async () => { tree.unmount(); });
  });

  it('shows the spinner, not the previous customer\'s list, while a new customer loads', async () => {
    const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce(
      [{ grnId: 'g-a', grNo: 'A-1', grnDate: '2026-01-01', customerName: 'Ay' }] as never
    );
    const tree = await open(CUSTOMER_A);
    expect(texts(tree)).toContain('GRN A-1');

    jest.mocked(getCustomerGRNsWithStock).mockImplementationOnce(() => new Promise(() => {}));
    let resolvePrefixesB!: (v: never[]) => void;
    jest.mocked(getGRNPrefixesWithStock).mockImplementationOnce(() => new Promise((r) => { resolvePrefixesB = r as never; }));
    await act(async () => {
      tree.update(<GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={CUSTOMER_B} />);
    });
    expect(texts(tree)).not.toContain('GRN A-1');
    expect(texts(tree)).toContain('Loading GRNs…');
    expect(
      tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Use GRN prefix'))
    ).toHaveLength(0);
    // Once the new customer's (empty) prefix answer arrives, the old buttons are still gone.
    await act(async () => { resolvePrefixesB([]); });
    expect(
      tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Use GRN prefix'))
    ).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it('keeps the newest search when replies arrive out of order, and ends not loading', async () => {
    let resolveFirst!: (v: never[]) => void;
    jest.mocked(searchGRNNumbers)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r as never; }))
      .mockResolvedValueOnce([{ id: 'g-2', gr_no: 'A-22', date: '2026-01-02', customer_name: 'Ay' }] as never);
    const tree = await open(CUSTOMER_A);

    await tapKey(tree, 'Enter GRN digit 2');
    await tapKey(tree, 'Enter GRN digit 2');
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveFirst([{ id: 'g-1', gr_no: 'A-2', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });

    expect(texts(tree)).toContain('GRN A-22');
    expect(texts(tree)).not.toContain('GRN A-2');
    expect(texts(tree)).not.toContain('Searching GRNs…');
    await act(async () => { tree.unmount(); });
  });

  it('the search itself refuses to run without a customer, even if the keyboard calls it', async () => {
    const tree = await open(undefined);
    const keyboard = tree.root.find((n) => typeof n.props.onSearch === 'function' && typeof n.props.onClear === 'function');
    await act(async () => { await keyboard.props.onSearch('7', ''); });
    expect(searchGRNNumbers).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('Searching GRNs…');
    await act(async () => { tree.unmount(); });
  });

  it('Clear while a search is pending removes the spinner, and the late reply changes nothing', async () => {
    let resolveSearch!: (v: never[]) => void;
    jest.mocked(searchGRNNumbers).mockImplementationOnce(() => new Promise((r) => { resolveSearch = r as never; }));
    const tree = await open(CUSTOMER_A);
    await tapKey(tree, 'Enter GRN digit 7');
    expect(texts(tree)).toContain('Searching GRNs…');

    await pressLabelled(tree, 'Clear search');
    expect(texts(tree)).not.toContain('Searching GRNs…');
    await act(async () => {
      resolveSearch([{ id: 'g-9', gr_no: 'A-7', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });
    expect(texts(tree)).not.toContain('GRN A-7');
    expect(texts(tree)).not.toContain('Searching GRNs…');
    await act(async () => { tree.unmount(); });
  });

  it('backspacing to empty while a search is pending removes the spinner, and the late reply is ignored', async () => {
    let resolveSearch!: (v: never[]) => void;
    jest.mocked(searchGRNNumbers).mockImplementationOnce(() => new Promise((r) => { resolveSearch = r as never; }));
    const tree = await open(CUSTOMER_A);
    await tapKey(tree, 'Enter GRN digit 7');
    expect(texts(tree)).toContain('Searching GRNs…');

    await pressLabelled(tree, 'Delete last character');
    expect(texts(tree)).not.toContain('Searching GRNs…');
    await act(async () => {
      resolveSearch([{ id: 'g-9', gr_no: 'A-7', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });
    expect(texts(tree)).not.toContain('GRN A-7');
    await act(async () => { tree.unmount(); });
  });

  it('when only the prefix read failed, the keypad says it could not load, not "no stock left", and Try again reads it again', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    const tree = await open(CUSTOMER_A);
    expect(texts(tree)).not.toContain('No GRNs have stock left.');
    expect(texts(tree).filter((x) => x === "Couldn't load the GRNs. Check your connection and try again.").length).toBeGreaterThanOrEqual(2);

    await pressRetry(tree);
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(tree.root.findAll((n) => String(n.props.accessibilityLabel).startsWith('Use GRN prefix')).length).toBeGreaterThan(0);
    await act(async () => { tree.unmount(); });
  });

  it('a customer change drops the typed text and the pending search timer', async () => {
    const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
    const tree = await open(CUSTOMER_A);
    const key = tree.root.find((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Enter GRN digit 7');
    await act(async () => { key.props.onPress(); }); // typed, the 150 ms timer has not fired
    expect(texts(tree)).not.toContain('Search GRN number'); // the typed text replaced the placeholder

    await act(async () => {
      tree.update(<GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={CUSTOMER_B} />);
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(searchGRNNumbers).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Search GRN number'); // typed text gone
    await act(async () => { tree.unmount(); });
  });

  it('"Try again" for a new customer does not re-run the previous customer\'s query', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
    const tree = await open(CUSTOMER_A);
    await tapKey(tree, 'Enter GRN digit 7');
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);

    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    await act(async () => {
      tree.update(<GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={CUSTOMER_B} />);
    });
    await pressRetry(tree);
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(searchGRNNumbers).not.toHaveBeenCalledWith('7', CUSTOMER_B);
    await act(async () => { tree.unmount(); });
  });

  it('keypad "Try again" reads only the prefixes; the working list is not reloaded and does not flash to the spinner', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce(
      [{ grnId: 'g-a', grNo: 'A-1', grnDate: '2026-01-01', customerName: 'Ay' }] as never
    );
    const tree = await open(CUSTOMER_A);
    expect(texts(tree)).toContain('GRN A-1');
    const retry = tree.root.find((n) => n.props.testID === 'grn-keypad-retry' && typeof n.props.onPress === 'function');

    let resolvePrefixes!: (v: { prefix: string; grnCount: number }[]) => void;
    jest.mocked(getGRNPrefixesWithStock).mockImplementationOnce(() => new Promise((r) => { resolvePrefixes = r; }));
    await act(async () => { retry.props.onPress(); });
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(getCustomerGRNsWithStock).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain('GRN A-1');
    expect(texts(tree)).not.toContain('Loading GRNs…');
    await act(async () => { resolvePrefixes([{ prefix: 'A', grnCount: 3 }]); });
    await act(async () => { tree.unmount(); });
  });

  it('the load-failed message is a shrinkable horizontal row, and Try again sits outside it, below', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    const tree = await open(CUSTOMER_A);
    const row = tree.root.find((n) => n.props.testID === 'grn-keypad-message-row');
    const inRow = (label: string) =>
      row.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
    expect(inRow('Try again')).toHaveLength(0);
    const container = row.parent!;
    const buttons = container.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Try again');
    expect(buttons.length).toBeGreaterThan(0);
    const flat = (st: unknown) => Object.assign({}, ...[st].flat(3).filter(Boolean));
    expect(flat(row.props.style).flexDirection).toBe('row');
    expect(flat(container.props.style).flexDirection).not.toBe('row');
    const msg = row.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(flat(msg.props.style).flexShrink).toBe(1);
    await act(async () => { tree.unmount(); });
  });
});
