/** G-20: search, count line, "no match" and a refresh that fails while rows are shown. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';

// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/customer-service', () => ({
  customerService: { getCustomerList: jest.fn(), getCustomerCounts: jest.fn(async () => null), inactivateCustomer: jest.fn(), restoreCustomer: jest.fn() },
}));

const rows = [
  { id: 'c1', name: '24 Seven Foods', mobile: '9999900302', city: 'Rajkot', active: true },
  { id: 'c2', name: 'Acme Foods', mobile: '9999900308', city: 'Surat', active: true },
  { id: 'c3', name: 'ACME FOODS', mobile: '9999900307', city: 'Surat', active: true },
  { id: 'c4', name: 'Élan Exports', mobile: '9999900311', city: 'Rajkot', active: true },
  { id: 'c5', name: 'Green Valley Traders', mobile: '9999900312', city: 'Anand', active: true },
];

type Node = NonNullable<typeof screen.root>;
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const mount = async () => {
  await render(<GestureHandlerRootView><CustomersScreen /></GestureHandlerRootView>);
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The texts on the screen that hold this wording (case as written). */
const has = (text: string) => screen.queryAllByText(new RegExp(escape(text)));
const expectHas = (text: string) => expect(has(text).length).toBeGreaterThan(0);
const expectNotHas = (text: string) => expect(has(text)).toHaveLength(0);
/** Every host element of the tree, in the order drawn (for what has no role or text of its own). */
const hosts = (): Node[] => {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (typeof node.type === 'string') found.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(screen.root as Node);
  return found;
};
/** The names of the customer rows on the screen, in order (every row says how it opens). */
const rowNames = () => screen.queryAllByHintText('Opens the customer.').map(node => String(node.props.accessibilityLabel).split(',')[0]);
const search = async (query: string) => {
  await user().paste(screen.getByPlaceholderText('Search customers'), query);
  await act(async () => { jest.advanceTimersByTime(400); });
};
/** The button that shows this text (the search field has a Clear search button of its own, with no text). */
const buttonShowing = (text: string) => {
  const found = screen.getAllByRole('button').find(button => within(button).queryByText(text) !== null);
  if (!found) throw new Error(`no button shows "${text}"`);
  return found;
};
const railLabels =() => screen.queryAllByLabelText(/^Jump to/).map(node => node.props.accessibilityLabel);

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(customerService.getCustomerList).mockReset();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 5 } } as never);
});
afterEach(() => {
  jest.useRealTimers();
});

it('shows a search field and the count under the header, with the A–Z rail', async () => {
  await mount();
  expect(screen.getByPlaceholderText('Search customers')).toBeOnTheScreen();
  expectHas('5 customers');
  expect(railLabels().length).toBeGreaterThan(20);
});

it('lists every customer in rail order: letters first, names starting with a digit last', async () => {
  await mount();
  expect(rowNames()).toEqual(['Acme Foods', 'ACME FOODS', 'Élan Exports', 'Green Valley Traders', '24 Seven Foods']);
});

it('finds customers by a word of the name, in any case, and counts them; the rail goes away', async () => {
  await mount();
  await search('acme');
  expect(rowNames()).toEqual(['Acme Foods', 'ACME FOODS']);
  expectHas('2 customers');
  expect(railLabels()).toEqual([]);
});

it('needs every word: a name word and a part of the mobile number', async () => {
  await mount();
  await search('acme 00307');
  expect(rowNames()).toEqual(['ACME FOODS']);
  expectHas('1 customer');
});

it('finds by city', async () => {
  await mount();
  await search('anand');
  expect(rowNames()).toEqual(['Green Valley Traders']);
});

it('says nothing matches, offers Clear search, and brings everything and the rail back', async () => {
  await mount();
  await search('acmezzz');
  expectHas('No customers match "acmezzz"');
  expectHas('Try fewer letters or another spelling.');
  expect(rowNames()).toEqual([]);
  await user().press(buttonShowing('Clear search'));
  expect(rowNames()).toHaveLength(5);
  expect(railLabels().length).toBeGreaterThan(20);
});

it('keeps the rows and says they are old when a refresh fails after a first success', async () => {
  await mount();
  expectNotHas("Couldn't refresh customers");
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: false, message: 'offline', data: [] } as never);
  // The pull to refresh is a gesture of the list: the list's own handler is what it calls.
  const list = hosts().find(node => typeof node.props.onRefresh === 'function' || typeof node.props.refreshControl?.props?.onRefresh === 'function')!;
  await act(async () => { (list.props.onRefresh ?? list.props.refreshControl.props.onRefresh)(); });
  expectHas("Couldn't refresh customers.");
  expectHas('Showing the customers loaded at');
  expect(rowNames()).toHaveLength(5);
  expectNotHas("Couldn't load customers");

  // Try again recovers and the strip goes.
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 5 } } as never);
  await user().press(buttonShowing('Try again'));
  expectNotHas("Couldn't refresh customers");
});

it('keeps today\'s error state when the first load fails and there are no rows', async () => {
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: false, message: 'offline', data: [] } as never);
  await mount();
  expectHas("Couldn't load customers");
  expectNotHas("Couldn't refresh customers");
});

it('shows "5 customers · 1 deactivated" from the head counts, and the Deactivated chip lists only the deactivated rows', async () => {
  const withInactive = rows.map(row => (row.id === 'c3' ? { ...row, active: false } : row));
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: withInactive, pagination: { total_count: 5 } } as never);
  jest.mocked(customerService.getCustomerCounts).mockResolvedValueOnce({ active: 4, inactive: 1 });
  await mount();
  expectHas('5 customers · 1 deactivated');
  expect(rowNames()).toHaveLength(5);

  await user().press(screen.getByRole('radio', { name: 'Deactivated' }));
  expect(rowNames()).toEqual(['ACME FOODS']);
  // With the filter on, the count line is the rows shown.
  expectHas('1 customer');
  expectNotHas('deactivated');
});

it('lets the empty list content grow instead of collapsing, so the no-match state is visible (WH-215)', async () => {
  await mount();
  await search('acmezzz');
  const holder = hosts().find(node => node.props.contentContainerStyle !== undefined)!;
  const style = StyleSheet.flatten(holder.props.contentContainerStyle);
  expect(style.flexGrow).toBe(1);
  expect(style.flex).toBeUndefined();
});

/** The elements that offer the screen-reader Refresh action. */
const refreshTargets = () => hosts().filter(node => Array.isArray(node.props.accessibilityActions)
  && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
const useRefreshAction = async (target: Node) => {
  await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
};

it('offers the screen-reader Refresh action on the search field, and it reads the list again (WH-220)', async () => {
  await mount();
  const [target] = refreshTargets();
  // The action sits on the search field, an element a screen reader focuses in every state.
  expect(target.type).toBe('TextInput');
  expect(target).toHaveProp('accessibilityActions', expect.arrayContaining([{ name: 'refresh', label: 'Refresh' }]));
  const before = jest.mocked(customerService.getCustomerList).mock.calls.length;
  await useRefreshAction(target);
  expect(jest.mocked(customerService.getCustomerList).mock.calls.length).toBe(before + 1);
});

describe('the screen-reader Refresh stays reachable when the list has nothing to count (WH-220)', () => {
  const expectRefreshWorks = async () => {
    const targets = refreshTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe('TextInput');
    const before = jest.mocked(customerService.getCustomerList).mock.calls.length;
    await useRefreshAction(targets[0]);
    expect(jest.mocked(customerService.getCustomerList).mock.calls.length).toBe(before + 1);
  };

  it('with no customers at all', async () => {
    jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0 } } as never);
    await mount();
    await expectRefreshWorks();
  });

  it('during the first load', async () => {
    jest.mocked(customerService.getCustomerList).mockReturnValue(new Promise(() => undefined) as never);
    await mount();
    await expectRefreshWorks();
  });

  it('on a search with no match', async () => {
    await mount();
    await search('acmezzz');
    expectHas('No customers match "acmezzz"');
    await expectRefreshWorks();
  });
});
