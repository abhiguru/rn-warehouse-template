/**
 * The picker of a customer account with several customers, in all four themes:
 * its rows, the wait for names the profile does not carry, the failure to read
 * them, and the customer it hands back.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  mockNameQuery.mockClear();
});

async function render(profile: unknown, onPick = jest.fn(), brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand }, auth: { userProfile: profile } };
  await act(async () => {
    tree = create(<ReportCustomerPicker title="GRN activity" onPick={onPick} />);
  });
  return onPick;
}
const rows = () => tree!.root.findAll(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('report-customer-c') && typeof node.props.onPress === 'function');
const texts = () => tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
const flat = (style: unknown) => (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}) as Record<string, unknown>;

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('customer picker in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('lists the account\'s customers as rows on theme tokens and hands back the one pressed', async () => {
    const onPick = await render(NAMED, jest.fn(), brand, mode);
    expect(texts()).toEqual(expect.arrayContaining(['GRN activity', 'Choose a customer', 'Green Valley Traders', 'Riverbank Produce']));
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Green Valley Traders', 'Riverbank Produce']);
    expect(rows().every(row => row.props.accessibilityRole === 'button')).toBe(true);
    expect(flat(rows()[0].props.style).backgroundColor).toBe(t.surface.card);
    expect(flat(rows()[0].props.style({ pressed: true })).backgroundColor).toBe(t.surface.cardPressed);
    expect(flat(tree!.root.findAllByType('View' as never)[0].props.style).backgroundColor).toBe(t.background.base);

    await act(async () => rows()[1].props.onPress());
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
    await render(NAMED);
    expect(flat(tree!.root.findByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(space.xxxl + 48);
  });
});

describe('names the profile does not carry', () => {
  it('reads them, and hands back an empty name for a customer the server gave none', async () => {
    mockRows = [{ id: 'c1', name: 'Green Valley Traders' }, { id: 'c2', name: null }];
    const onPick = await render(IDS_ONLY);
    expect(mockNameQuery).toHaveBeenCalledWith('customers', 'id, name', 'id', ['c1', 'c2']);
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Green Valley Traders', 'Customer']);
    await act(async () => rows()[1].props.onPress());
    expect(onPick).toHaveBeenCalledWith({ id: 'c2', name: '' });
  });

  it('offers no rows when they cannot be read, and reads again on Try again', async () => {
    mockRows = new Error('offline');
    await render(IDS_ONLY);
    expect(rows()).toHaveLength(0);
    expect(texts()).toContain('Customer names could not be loaded');

    mockRows = [{ id: 'c1', name: 'Green Valley Traders' }, { id: 'c2', name: 'Riverbank Produce' }];
    const retry = tree!.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Try again')[0];
    await act(async () => retry.props.onPress());
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Green Valley Traders', 'Riverbank Produce']);
  });
});
