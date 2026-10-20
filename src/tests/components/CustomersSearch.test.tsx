/** G-20: search, count line, "no match" and a refresh that fails while rows are shown. */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomersScreen from '../../../app/customers';
import { customerService } from '@/services/customer-service';

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

let tree: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => { tree = create(<CustomersScreen />); });
  return tree as ReactTestRenderer;
};
const text = (screen: ReactTestRenderer) =>
  screen.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');
/** The names of the customer rows on the screen, in order. */
const rowNames = (screen: ReactTestRenderer) =>
  screen.root
    .findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && typeof node.props.accessibilityHint === 'string')
    .map(node => String(node.props.accessibilityLabel).split(',')[0]);
const search = async (screen: ReactTestRenderer, query: string) => {
  const field = screen.root.findAllByType(TextInput).find(node => node.props.placeholder === 'Search customers');
  if (!field) throw new Error('no search field');
  await act(async () => { field.props.onChangeText(query); });
  await act(async () => { jest.advanceTimersByTime(400); });
};
const railLabels = (screen: ReactTestRenderer) =>
  screen.root.findAll(node => typeof node.type === 'string' && String(node.props.accessibilityLabel ?? '').startsWith('Jump to')).map(node => node.props.accessibilityLabel);

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(customerService.getCustomerList).mockReset();
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 5 } } as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});

it('shows a search field and the count under the header, with the A–Z rail', async () => {
  const screen = await mount();
  expect(screen.root.findAllByType(TextInput).some(node => node.props.placeholder === 'Search customers')).toBe(true);
  expect(text(screen)).toContain('5 customers');
  expect(railLabels(screen).length).toBeGreaterThan(20);
});

it('lists every customer in rail order: letters first, names starting with a digit last', async () => {
  const screen = await mount();
  expect(rowNames(screen)).toEqual(['Acme Foods', 'ACME FOODS', 'Élan Exports', 'Green Valley Traders', '24 Seven Foods']);
});

it('finds customers by a word of the name, in any case, and counts them; the rail goes away', async () => {
  const screen = await mount();
  await search(screen, 'acme');
  expect(rowNames(screen)).toEqual(['Acme Foods', 'ACME FOODS']);
  expect(text(screen)).toContain('2 customers');
  expect(railLabels(screen)).toEqual([]);
});

it('needs every word: a name word and a part of the mobile number', async () => {
  const screen = await mount();
  await search(screen, 'acme 00307');
  expect(rowNames(screen)).toEqual(['ACME FOODS']);
  expect(text(screen)).toContain('1 customer');
});

it('finds by city', async () => {
  const screen = await mount();
  await search(screen, 'anand');
  expect(rowNames(screen)).toEqual(['Green Valley Traders']);
});

it('says nothing matches, offers Clear search, and brings everything and the rail back', async () => {
  const screen = await mount();
  await search(screen, 'acmezzz');
  expect(text(screen)).toContain('No customers match "acmezzz". Try fewer letters.');
  expect(rowNames(screen)).toEqual([]);
  const clear = screen.root.findAll(node => node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(t => t.props.children === 'Clear search'))[0];
  await act(async () => { clear.props.onPress(); });
  expect(rowNames(screen)).toHaveLength(5);
  expect(railLabels(screen).length).toBeGreaterThan(20);
});

it('keeps the rows and says they are old when a refresh fails after a first success', async () => {
  const screen = await mount();
  expect(text(screen)).not.toContain("Couldn't refresh customers");
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: false, message: 'offline', data: [] } as never);
  const list = screen.root.findAll(node => typeof node.props.onRefresh === 'function' || typeof node.props.refreshControl?.props?.onRefresh === 'function')[0];
  await act(async () => { (list.props.onRefresh ?? list.props.refreshControl.props.onRefresh)(); });
  expect(text(screen)).toContain("Couldn't refresh customers. Showing the list from");
  expect(rowNames(screen)).toHaveLength(5);
  expect(text(screen)).not.toContain("Couldn't load customers");

  // Try again recovers and the strip goes.
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: rows, pagination: { total_count: 5 } } as never);
  const retry = screen.root.findAll(node => node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(t => t.props.children === 'Try again'))[0];
  await act(async () => { retry.props.onPress(); });
  expect(text(screen)).not.toContain("Couldn't refresh customers");
});

it('keeps today\'s error state when the first load fails and there are no rows', async () => {
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: false, message: 'offline', data: [] } as never);
  const screen = await mount();
  expect(text(screen)).toContain("Couldn't load customers");
  expect(text(screen)).not.toContain("Couldn't refresh customers");
});

it('shows "5 customers · 1 deactivated" from the head counts, and the Deactivated chip lists only the deactivated rows', async () => {
  const withInactive = rows.map(row => (row.id === 'c3' ? { ...row, active: false } : row));
  jest.mocked(customerService.getCustomerList).mockResolvedValue({ success: true, data: withInactive, pagination: { total_count: 5 } } as never);
  jest.mocked(customerService.getCustomerCounts).mockResolvedValueOnce({ active: 4, inactive: 1 });
  const screen = await mount();
  expect(text(screen)).toContain('5 customers · 1 deactivated');
  expect(rowNames(screen)).toHaveLength(5);

  const chip = screen.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Deactivated' && typeof node.props.onPress === 'function')[0];
  await act(async () => { chip.props.onPress(); });
  expect(rowNames(screen)).toEqual(['ACME FOODS']);
  // With the filter on, the count line is the rows shown.
  expect(text(screen)).toContain('1 customer');
  expect(text(screen)).not.toContain('deactivated');
});
