/**
 * The picker of a customer account with several customers, in all four themes:
 * its rows, the wait for names the profile does not carry, the failure to read
 * them, and the customer it hands back.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, space, type Mode } from '@/theme/tokens';
import { ReportCustomerPicker } from '../ReportCustomerPicker';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
let mockBottomInset = 0;
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: mockBottomInset, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
// The customers table as row-level security shows it to the signed-in account.
let mockRows: { id: string; name: string | null }[] | Error = [];
const mockNameQuery = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: async (column: string, ids: string[]) => {
          mockNameQuery(table, columns, column, ids);
          return mockRows instanceof Error ? { data: null, error: mockRows } : { data: mockRows, error: null };
        },
      }),
    }),
  }),
}));

const NAMED = { id: 'p1', role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [{ id: 'c1', name: 'Green Valley Traders', active: true }, { id: 'c2', name: 'Riverbank Produce', active: true }] };
const IDS_ONLY = { id: 'p1', role: 'customer', assignedCustomerIds: ['c1', 'c2'] };

afterEach(() => {
  mockNameQuery.mockClear();
});

async function renderPicker(profile: unknown, onPick = jest.fn(), brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand }, auth: { userProfile: profile } };
  await render(<ReportCustomerPicker title="GRN activity" onPick={onPick} />);
  return onPick;
}
// The customer rows, by their test id (a row's name is its label, so they are also found by role and name).
const rows = () => screen.queryAllByTestId(/^report-customer-c\d+$/);
const rowLabels = () => rows().map(row => row.props.accessibilityLabel);
const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
// The style of the nearest element above `node` (or `node` itself) that sets `key`.
const inheritedStyle = (node: { parent: unknown; props: Record<string, unknown> } | null, key: string): unknown => {
  for (let current = node; current; current = current.parent as typeof node) {
    const value = flat(current.props.style)[key] ?? flat(current.props.contentContainerStyle)[key];
    if (value !== undefined) return value;
  }
  return undefined;
};
const pressedGesture = { persist: jest.fn(), touchHistory: { touchBank: [] }, nativeEvent: { touches: [] } };

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('customer picker in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('lists the account\'s customers as rows on theme tokens and hands back the one pressed', async () => {
    const onPick = await renderPicker(NAMED, jest.fn(), brand, mode);
    expect(screen.getByText('GRN activity')).toBeOnTheScreen();
    expect(screen.getByText('Choose a customer')).toBeOnTheScreen();
    expect(screen.getByText('Green Valley Traders')).toBeOnTheScreen();
    expect(screen.getByText('Riverbank Produce')).toBeOnTheScreen();
    expect(rowLabels()).toEqual(['Green Valley Traders', 'Riverbank Produce']);
    const first = screen.getByRole('button', { name: 'Green Valley Traders' });
    const second = screen.getByRole('button', { name: 'Riverbank Produce' });
    expect(rows()).toEqual([first, second]);
    expect(first).toHaveStyle({ backgroundColor: t.surface.card });
    await fireEvent(first, 'responderGrant', pressedGesture);
    expect(first).toHaveStyle({ backgroundColor: t.surface.cardPressed });
    await fireEvent(first, 'responderRelease', pressedGesture);
    expect(screen.root).toHaveStyle({ backgroundColor: t.background.base });

    const user = userEvent.setup();
    await user.press(second);
    expect(onPick).toHaveBeenCalledWith({ id: 'c2', name: 'Riverbank Produce' });
    expect(mockNameQuery).not.toHaveBeenCalled();
  });
});

describe('the system navigation bar', () => {
  afterEach(() => {
    mockBottomInset = 0;
  });

  it('keeps the last customer clear of it', async () => {
    mockBottomInset = 48;
    await renderPicker(NAMED);
    expect(inheritedStyle(rows()[1] as never, 'paddingBottom')).toBe(space.xxxl + 48);
  });
});

describe('names the profile does not carry', () => {
  it('reads them, and hands back an empty name for a customer the server gave none', async () => {
    mockRows = [{ id: 'c1', name: 'Green Valley Traders' }, { id: 'c2', name: null }];
    const onPick = await renderPicker(IDS_ONLY);
    expect(mockNameQuery).toHaveBeenCalledWith('customers', 'id, name', 'id', ['c1', 'c2']);
    expect(await screen.findByRole('button', { name: 'Green Valley Traders' })).toBeOnTheScreen();
    expect(rowLabels()).toEqual(['Green Valley Traders', 'Customer']);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Customer' }));
    expect(onPick).toHaveBeenCalledWith({ id: 'c2', name: '' });
  });

  it('offers no rows when they cannot be read, and reads again on Try again', async () => {
    mockRows = new Error('offline');
    await renderPicker(IDS_ONLY);
    expect(await screen.findByText('Customer names could not be loaded')).toBeOnTheScreen();
    expect(rows()).toHaveLength(0);

    mockRows = [{ id: 'c1', name: 'Green Valley Traders' }, { id: 'c2', name: 'Riverbank Produce' }];
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Riverbank Produce' })).toBeOnTheScreen();
    expect(rowLabels()).toEqual(['Green Valley Traders', 'Riverbank Produce']);
  });
});
