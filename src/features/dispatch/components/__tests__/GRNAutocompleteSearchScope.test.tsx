/**
 * The dispatch GRN picker searches only the GRNs of the dispatch's customer.
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
const CUSTOMER_B = '44444444-2222-4333-8444-555555555555';
const LOAD_FAILED = "Couldn't load the GRNs. Check your connection and try again.";

const sheet = (customerId?: string) => (
  <GRNAutocompleteBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} customerId={customerId} />
);

const open = (customerId?: string) => render(sheet(customerId));

// Time moves only when the test says so; the sheet's search waits 150 ms after a key.
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const pass = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

/** Press a key of the sheet's own keypad and let its 150 ms debounce pass. */
async function tapKey(label: string) {
  await user().press(screen.getByRole('button', { name: label }));
  await pass(200);
}

/** Promises the tests hold back; every one is released after the test so that a failing test cannot hang Jest. */
let releases: (() => void)[] = [];
function held<T>(whenReleased: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  releases.push(() => resolve(whenReleased));
  return { promise, resolve };
}

let errorSpy: jest.SpyInstance | undefined;

describe('GRN picker search', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    releases.forEach((release) => release());
    releases = [];
    jest.useRealTimers();
    errorSpy?.mockRestore();
    errorSpy = undefined;
  });

  it("passes the dispatch customer to the search", async () => {
    await open(CUSTOMER_A);

    await tapKey('Enter GRN digit 7');

    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(searchGRNNumbers).toHaveBeenCalledWith('7', CUSTOMER_A);
  });

  it("loads the prefix buttons for the dispatch customer, null when there is none, and reloads when it changes", async () => {
    await open(CUSTOMER_A);
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_A);

    await screen.rerender(sheet(CUSTOMER_B));
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_B);
    await screen.unmount();

    jest.mocked(getGRNPrefixesWithStock).mockClear();
    await open();
    expect(getGRNPrefixesWithStock).not.toHaveBeenCalled();
  });

  it('ignores a slow reply for a previous customer when the answers arrive out of order', async () => {
    const slowPrefixes = held<{ prefix: string; grnCount: number }[]>([]);
    const slowGrns = held<never[]>([]);
    jest.mocked(getGRNPrefixesWithStock)
      .mockImplementationOnce(() => slowPrefixes.promise)
      .mockResolvedValueOnce([{ prefix: 'B', grnCount: 1 }]);
    jest.mocked(getCustomerGRNsWithStock)
      .mockImplementationOnce(() => slowGrns.promise)
      .mockResolvedValueOnce([{ grnId: 'g-b', grNo: 'B-1', grnDate: '2026-01-01', customerName: 'Bee' }] as never);
    await open(CUSTOMER_A);
    await screen.rerender(sheet(CUSTOMER_B));
    await act(async () => {
      slowPrefixes.resolve([{ prefix: 'A', grnCount: 9 }]);
      slowGrns.resolve([]);
    });
    expect(screen.getByRole('button', { name: 'Use GRN prefix B, 1 GRNs' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Use GRN prefix A/ })).not.toBeOnTheScreen();
    expect(screen.getByText('GRN B-1')).toBeOnTheScreen();
  });

  it('a prefix button with several letters ("DV") searches that prefix, and digits go after it', async () => {
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValueOnce([{ prefix: 'DV', grnCount: 2 }, { prefix: 'A', grnCount: 1 }]);
    await open(CUSTOMER_A);

    await tapKey('Use GRN prefix DV, 2 GRNs');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await tapKey('Enter GRN digit 1');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV1', CUSTOMER_A, { startsWith: 'DV' });
  });

  it('does not search every customer when the dispatch has no customer yet', async () => {
    await open(undefined);

    // With no customer there are no prefix buttons, so there is no digit key to tap either.
    expect(screen.queryByRole('button', { name: 'Enter GRN digit 7' })).not.toBeOnTheScreen();
    expect(searchGRNNumbers).not.toHaveBeenCalled();
  });

  const pressRetry = async () => {
    // The keypad and the list can both offer "Try again"; either one reads again.
    await user().press(screen.getAllByRole('button', { name: 'Try again' })[0]);
  };

  it('says the GRNs could not be loaded, not that there is no stock, and reads both again on "Try again"', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getCustomerGRNsWithStock).mockRejectedValueOnce(new Error('500'));
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    await open(CUSTOMER_A);

    expect(screen.getAllByText(LOAD_FAILED).length).toBeGreaterThan(0);
    expect(screen.queryByText('No GRNs with stock')).not.toBeOnTheScreen();

    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce([]);
    await pressRetry();

    expect(getCustomerGRNsWithStock).toHaveBeenCalledTimes(2);
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(getGRNPrefixesWithStock).toHaveBeenLastCalledWith(CUSTOMER_A);
    expect(screen.getByText('No GRNs with stock')).toBeOnTheScreen();
  });

  it('says so when the search fails, and searches again on "Try again"', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(searchGRNNumbers).mockRejectedValueOnce(new Error('500'));
    await open(CUSTOMER_A);

    await tapKey('Enter GRN digit 7');
    expect(screen.getAllByText(LOAD_FAILED).length).toBeGreaterThan(0);
    expect(screen.queryByText('No GRNs match')).not.toBeOnTheScreen();

    await pressRetry();
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
  });

  it('backspacing past the prefix, or Clear, goes back to a plain "contains" search', async () => {
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValue([{ prefix: 'DV', grnCount: 2 }]);
    await open(CUSTOMER_A);

    await tapKey('Use GRN prefix DV, 2 GRNs');
    await tapKey('Enter GRN digit 1');
    await tapKey('Delete last character');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
    await tapKey('Delete last character');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('D', CUSTOMER_A);

    await tapKey('Use GRN prefix DV, 2 GRNs');
    await tapKey('Clear search');
    await tapKey('Enter GRN digit 5');
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('5', CUSTOMER_A);
  });

  it('"Try again" after an anchored search keeps the anchored mode', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockResolvedValue([{ prefix: 'DV', grnCount: 2 }]);
    await open(CUSTOMER_A);
    jest.mocked(searchGRNNumbers).mockRejectedValueOnce(new Error('500'));

    await tapKey('Use GRN prefix DV, 2 GRNs');
    await pressRetry();
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    expect(searchGRNNumbers).toHaveBeenLastCalledWith('DV', CUSTOMER_A, { startsWith: 'DV' });
  });

  it('with no customer, says to choose one (keypad and list) and never "no stock left"', async () => {
    await open(undefined);
    // The list says it once (WH-6): the keypad row stays empty with no customer.
    expect(screen.getAllByText('Choose a customer in the first step to see their GRNs.')).toHaveLength(1);
    expect(screen.queryByText('No GRNs have stock left.')).not.toBeOnTheScreen();
  });

  it('shows the spinner, not the previous customer\'s list, while a new customer loads', async () => {
    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce(
      [{ grnId: 'g-a', grNo: 'A-1', grnDate: '2026-01-01', customerName: 'Ay' }] as never
    );
    await open(CUSTOMER_A);
    expect(screen.getByText('GRN A-1')).toBeOnTheScreen();

    jest.mocked(getCustomerGRNsWithStock).mockImplementationOnce(() => new Promise(() => {}));
    const prefixesB = held<never[]>([]);
    jest.mocked(getGRNPrefixesWithStock).mockImplementationOnce(() => prefixesB.promise);
    await screen.rerender(sheet(CUSTOMER_B));
    expect(screen.queryByText('GRN A-1')).not.toBeOnTheScreen();
    expect(screen.getByText('Loading GRNs…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Use GRN prefix/ })).not.toBeOnTheScreen();
    // Once the new customer's (empty) prefix answer arrives, the old buttons are still gone.
    await act(async () => { prefixesB.resolve([]); });
    expect(screen.queryByRole('button', { name: /^Use GRN prefix/ })).not.toBeOnTheScreen();
  });

  it('keeps the newest search when replies arrive out of order, and ends not loading', async () => {
    const first = held<never[]>([]);
    jest.mocked(searchGRNNumbers)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce([{ id: 'g-2', gr_no: 'A-22', date: '2026-01-02', customer_name: 'Ay' }] as never);
    await open(CUSTOMER_A);

    await tapKey('Enter GRN digit 2');
    await tapKey('Enter GRN digit 2');
    expect(searchGRNNumbers).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve([{ id: 'g-1', gr_no: 'A-2', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });

    expect(screen.getByText('GRN A-22')).toBeOnTheScreen();
    expect(screen.queryByText('GRN A-2')).not.toBeOnTheScreen();
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
  });

  it('the search itself refuses to run without a customer, even if the keyboard calls it', async () => {
    await open(undefined);
    // No key can start a search without a customer, so the guard is reached through the keyboard's own onSearch prop.
    let fiber = screen.getByRole('button', { name: 'Delete last character' }).unstable_fiber;
    while (fiber && typeof fiber.memoizedProps?.onSearch !== 'function') fiber = fiber.return;
    const onSearch = fiber!.memoizedProps.onSearch as (query: string, anchor: string) => Promise<void>;
    await act(async () => { await onSearch('7', ''); });
    expect(searchGRNNumbers).not.toHaveBeenCalled();
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
  });

  it('Clear while a search is pending removes the spinner, and the late reply changes nothing', async () => {
    const search = held<never[]>([]);
    jest.mocked(searchGRNNumbers).mockImplementationOnce(() => search.promise);
    await open(CUSTOMER_A);
    await tapKey('Enter GRN digit 7');
    expect(screen.getByText('Searching GRNs…')).toBeOnTheScreen();

    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);

    await tapKey('Clear search');
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
    const afterClear = screen.toJSON();
    await act(async () => {
      search.resolve([{ id: 'g-9', gr_no: 'A-7', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });
    // The late reply really arrived on the one pending search and changed nothing.
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('GRN A-7')).not.toBeOnTheScreen();
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
    expect(screen.toJSON()).toEqual(afterClear);
  });

  it('backspacing to empty while a search is pending removes the spinner, and the late reply is ignored', async () => {
    const search = held<never[]>([]);
    jest.mocked(searchGRNNumbers).mockImplementationOnce(() => search.promise);
    await open(CUSTOMER_A);
    await tapKey('Enter GRN digit 7');
    expect(screen.getByText('Searching GRNs…')).toBeOnTheScreen();

    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);

    await tapKey('Delete last character');
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
    const afterBackspace = screen.toJSON();
    await act(async () => {
      search.resolve([{ id: 'g-9', gr_no: 'A-7', date: '2026-01-01', customer_name: 'Ay' }] as never);
    });
    // The empty query ran no second search; the late reply changed nothing.
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('GRN A-7')).not.toBeOnTheScreen();
    expect(screen.queryByText('Searching GRNs…')).not.toBeOnTheScreen();
    expect(screen.toJSON()).toEqual(afterBackspace);
  });

  it('when only the prefix read failed, the keypad says it could not load, not "no stock left", and Try again reads it again', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    await open(CUSTOMER_A);
    expect(screen.queryByText('No GRNs have stock left.')).not.toBeOnTheScreen();
    expect(screen.getAllByText(LOAD_FAILED).length).toBeGreaterThanOrEqual(2);

    await pressRetry();
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button', { name: /^Use GRN prefix/ }).length).toBeGreaterThan(0);
  });

  it('a customer change drops the typed text and the pending search timer', async () => {
    await open(CUSTOMER_A);
    await user().press(screen.getByRole('button', { name: 'Enter GRN digit 7' })); // typed, the 150 ms timer has not fired
    expect(screen.queryByText('Search GRN number')).not.toBeOnTheScreen(); // the typed text replaced the placeholder

    await screen.rerender(sheet(CUSTOMER_B));
    await pass(400);
    expect(searchGRNNumbers).not.toHaveBeenCalled();
    expect(screen.getByText('Search GRN number')).toBeOnTheScreen(); // typed text gone
  });

  it('"Try again" for a new customer does not re-run the previous customer\'s query', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await open(CUSTOMER_A);
    await tapKey('Enter GRN digit 7');
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);

    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    await screen.rerender(sheet(CUSTOMER_B));
    await pressRetry();
    expect(searchGRNNumbers).toHaveBeenCalledTimes(1);
    expect(searchGRNNumbers).not.toHaveBeenCalledWith('7', CUSTOMER_B);
  });

  it('keypad "Try again" reads only the prefixes; the working list is not reloaded and does not flash to the spinner', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    jest.mocked(getCustomerGRNsWithStock).mockResolvedValueOnce(
      [{ grnId: 'g-a', grNo: 'A-1', grnDate: '2026-01-01', customerName: 'Ay' }] as never
    );
    await open(CUSTOMER_A);
    expect(screen.getByText('GRN A-1')).toBeOnTheScreen();
    // The list may offer its own "Try again"; this is the keypad's.
    const retry = screen.getByTestId('grn-keypad-retry');

    const prefixes = held<{ prefix: string; grnCount: number }[]>([{ prefix: 'A', grnCount: 3 }]);
    jest.mocked(getGRNPrefixesWithStock).mockImplementationOnce(() => prefixes.promise);
    await user().press(retry);
    expect(getGRNPrefixesWithStock).toHaveBeenCalledTimes(2);
    expect(getCustomerGRNsWithStock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('GRN A-1')).toBeOnTheScreen();
    expect(screen.queryByText('Loading GRNs…')).not.toBeOnTheScreen();
    await act(async () => { prefixes.resolve([{ prefix: 'A', grnCount: 3 }]); });
  });

  it('the load-failed message is a shrinkable horizontal row, and Try again sits outside it, below', async () => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(getGRNPrefixesWithStock).mockRejectedValueOnce(new Error('500'));
    await open(CUSTOMER_A);
    const row = screen.getByTestId('grn-keypad-message-row');
    expect(within(row).queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    const container = row.parent!;
    expect(within(container).getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
    expect(row).toHaveStyle({ flexDirection: 'row' });
    expect(container).not.toHaveStyle({ flexDirection: 'row' });
    expect(within(row).getByText(LOAD_FAILED)).toHaveStyle({ flexShrink: 1 });
  });
});
