/**
 * The GRN activity screen at each level of whose GRNs it shows (every
 * customer, one customer, a customer to choose, none), its GRN card, and its
 * empty and failed states, in all four themes. The store is a fixed stand-in
 * here; the filters at work are tested with a real store in
 * src/components/reports/__tests__/GRNActivityFlow.test.tsx.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import { BRANDS, fontWeight, getTokens, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import GRNActivityScreen from '../../../app/reports/grn-activity';

let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockRouterPush = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));
jest.mock('@/services/reporting/grn-activity-service', () => ({ getAllGRNActivity: jest.fn(), getCustomerGRNActivity: jest.fn() }));

const allActivity = jest.mocked(getAllGRNActivity);
const customerActivity = jest.mocked(getCustomerGRNActivity);
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'u1']);
const STAFF = { id: 'u1', name: 'Asha Example', role: 'staff' };
const GREEN = { id: 'c1', name: 'Green Valley Traders', active: true };
const RIVER = { id: 'c2', name: 'Riverbank Produce', active: true };

const G311 = {
  grn_id: 'g1', gr_no: '311', grn_date: '2025-10-08', registration: 'GJ01AB1234', sender_name: 'Fictional Farms', supervisor_name: 'Asha Example',
  note: null, total_items: 2, total_qty: 100, total_weight: 0, image_count: 2,
  invoice_status: { is_invoiced: true, invoice_id: 'i1', invoice_number: '2026-0042' },
  dispatch_summary: { total_dispatched: 20, current_stock: 80, dispatch_count: 1, last_dispatch_date: null, is_fully_dispatched: false },
  items: [
    { item_name: 'Garlic', packaging: 'Bag', quantity: 60, current_stock: 50, dispatched_qty: 10, weight: 0, rack: '', package_mark: 'GV' },
    { item_name: 'Fictional Onions', packaging: 'Crate', quantity: 40, current_stock: 30, dispatched_qty: 10, weight: 0, rack: '', package_mark: 'FO' },
  ],
};
const G312 = {
  ...G311, grn_id: 'g2', gr_no: '312', sender_name: '', supervisor_name: 'Ravi Example', total_qty: 20, image_count: 0, items: [],
  invoice_status: { is_invoiced: false, invoice_id: null, invoice_number: null },
  dispatch_summary: { total_dispatched: 0, current_stock: 20, dispatch_count: 0, last_dispatch_date: null, is_fully_dispatched: false },
};
const answerGrns = (grns: unknown[]) => ({
  success: true,
  message: '',
  data: { summary: { total_grns: grns.length, total_items: 0, total_quantity: 120, total_weight_kg: 0, total_invoiced_grns: 1, total_images: 2 }, grns },
});
const answerCustomers = (rows: unknown[]) => ({
  success: true,
  message: '',
  data: { summary: { total_grns: 4, total_customers: rows.length, total_items: 0, total_quantity: 220, total_weight_kg: 0 }, by_customer: rows },
});
const FICTIONAL = { customer_id: 'c1', customer_name: 'Green Valley Traders', grn_count: 4, total_quantity: 220, total_weight: 0, latest_grn_date: '2025-10-01' };

function signIn(profile: unknown, over: { prefs?: Record<string, unknown>; lists?: Record<string, unknown>; mode?: Mode; brand?: string } = {}) {
  mockState = {
    theme: { preference: over.mode ?? 'light', brand: over.brand ?? 'orange' },
    auth: { userProfile: profile },
    listFilters: { lists: over.lists ?? {} },
    reportPrefs: { byScope: over.prefs ? { [SCOPE]: { sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 1, ...over.prefs } } : {} },
  };
}

let restoreQueries: () => void;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(() => {
  forgetQueries();
  jest.clearAllMocks();
  mockParams = {};
  customerActivity.mockResolvedValue(answerGrns([G311, G312]) as never);
  allActivity.mockResolvedValue(answerCustomers([FICTIONAL]) as never);
});
// A mounted skeleton or query keeps timers alive: every tree is taken down after its test.
let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

async function open() {
  await act(async () => {
    tree = create(<GRNActivityScreen />);
    await settleQueries();
  });
  return tree!;
}
const run = (callback: () => void) =>
  act(async () => {
    callback();
    await settleQueries();
  });
const texts = () => tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
const pressables = (match: (label: string) => boolean) =>
  tree!.root.findAll(node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string' && match(node.props.accessibilityLabel));
const press = (label: string) => run(() => pressables(text => text === label)[0].props.onPress());
const grnCard = (number: string) => pressables(label => label.startsWith(`GRN ${number},`))[0];
const flat = (style: unknown) => (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}) as Record<string, unknown>;
const bold = () =>
  tree!.root.findAll(node => (node.type as unknown) === 'Text' && flat(node.props.style).fontWeight === fontWeight.bold).map(node => [node.props.children].flat().join(''));

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('GRN activity in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('one customer: GRN cards with status words on theme tokens', async () => {
    signIn(STAFF, { brand, mode });
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['GRN activity', 'Green Valley Traders', 'GRN 311', 'Invoice 2026-0042', 'Not invoiced', '1 dispatch']));
    const notInvoiced = tree!.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === 'Not invoiced')[0];
    expect(flat(notInvoiced.props.style).color).toBe(t.status.critical.text);
    expect(flat(grnCard('311').props.style).backgroundColor).toBe(t.surface.card);
    expect(flat(tree!.root.findAllByType('View' as never)[0].props.style).backgroundColor).toBe(t.background.base);
  });

  it('every customer: one card per customer on theme tokens', async () => {
    signIn(STAFF, { brand, mode });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['GRN activity', 'All customers', 'GRNs', 'Green Valley Traders', '4 GRNs · Latest 1 Oct 2025']));
    const row = pressables(label => label.startsWith('Green Valley Traders,'))[0];
    expect(flat(row.props.style).backgroundColor).toBe(t.surface.card);
  });
});

describe('the GRN card', () => {
  beforeEach(() => {
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
  });

  it('reads as one element with every fact, the date included, and opens the GRN', async () => {
    signIn(STAFF);
    await open();
    expect(grnCard('311').props.accessibilityLabel).toBe(
      'GRN 311, 8 Oct 2025, Fictional Farms · Asha Example, 80 of 100 bags in stock, Invoice 2026-0042, 1 dispatch, 2 photos'
    );
    expect(grnCard('312').props.accessibilityLabel).toBe('GRN 312, 8 Oct 2025, Sender not recorded · Ravi Example, 20 of 20 bags in stock, Not invoiced');
    // A document number is never cut short.
    const title = tree!.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === 'GRN 311')[0];
    expect(title.props.numberOfLines).toBeUndefined();

    await run(() => grnCard('311').props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith('/grn-details/g1');
  });

  it('names an item the search found inside the card, in bold, and nothing more when the card already shows the word', async () => {
    signIn(STAFF, { lists: { 'report-grn-activity-customer': { values: { search: 'garlic' } } } });
    await open();
    expect(texts()).toContain('GRN 311');
    expect(texts()).not.toContain('GRN 312');
    expect(texts()).toContain('Garlic');
    expect(bold()).toEqual(['Garlic']);
    expect(grnCard('311').props.accessibilityLabel).toMatch(/, Garlic$/);
    act(() => tree!.unmount());

    // "fictional" is in the sender's name on the card, so the item that also has it is not named.
    signIn(STAFF, { lists: { 'report-grn-activity-customer': { values: { search: 'fictional' } } } });
    await open();
    expect(texts()).not.toContain('Fictional Onions');
    expect(bold()).toEqual(['Fictional']);
  });
});

describe('whose GRNs', () => {
  it('a warehouse role gets every customer, asked for with the two days only', async () => {
    signIn(STAFF);
    await open();
    expect(allActivity).toHaveBeenCalledTimes(1);
    expect(Object.keys(allActivity.mock.calls[0][0]).sort()).toEqual(['fromDate', 'toDate']);
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('a customer account with no customer is told so, with nothing to retry and nothing asked', async () => {
    signIn({ id: 'u1', role: 'customer', assignedCustomerIds: [] });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['No customer linked to your account', 'Ask your facility to link your account to a customer.']));
    expect(pressables(label => label === 'Try again')).toHaveLength(0);
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('a customer account with several customers chooses one, and can change it from the header', async () => {
    signIn({ id: 'u1', role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [GREEN, RIVER] });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['Choose a customer', 'Green Valley Traders', 'Riverbank Produce']));
    expect(customerActivity).not.toHaveBeenCalled();

    await press('Riverbank Produce');
    expect(customerActivity).toHaveBeenCalledTimes(1);
    const [argument] = customerActivity.mock.calls[0];
    expect(Object.keys(argument).sort()).toEqual(['customerId', 'fromDate', 'toDate']);
    expect(argument.customerId).toBe('c2');
    expect(texts()).toEqual(expect.arrayContaining(['Riverbank Produce', 'GRN 311']));
    expect(allActivity).not.toHaveBeenCalled();

    await press('Change customer');
    expect(texts()).toContain('Choose a customer');
    expect(texts()).not.toContain('GRN 311');
  });

  it('a warehouse role is offered no "Change customer"', async () => {
    signIn(STAFF);
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
    await open();
    expect(pressables(label => label === 'Change customer')).toHaveLength(0);
  });
});

describe('the customer opened last', () => {
  const prefs = { lastCustomer: { 'grn-activity': { id: 'c2', name: 'Riverbank Produce' } } };

  it('is one row above the customers, which opens that customer', async () => {
    signIn(STAFF, { prefs });
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['Last opened', 'Riverbank Produce']));
    await press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c2', customerName: 'Riverbank Produce' } });
  });

  it('is not offered while a search is typed', async () => {
    signIn(STAFF, { prefs, lists: { 'report-grn-activity': { values: { search: 'green' } } } });
    await open();
    expect(texts()).not.toContain('Last opened');
  });
});

describe('nothing to show', () => {
  beforeEach(() => {
    customerActivity.mockResolvedValue(answerGrns([]) as never);
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
  });

  it('suggests a longer period', async () => {
    signIn(STAFF);
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['No GRNs in this period', 'Choose a longer period to see more GRNs.']));
  });

  it('suggests no longer period when the period is already the longest', async () => {
    signIn(STAFF, { prefs: { period: { preset: 'last420' } } });
    await open();
    expect(texts()).toContain('No GRNs in this period');
    expect(texts()).not.toContain('Choose a longer period to see more GRNs.');
    // Nor the lists' own words for an empty list.
    expect(texts()).not.toContain('Items you create appear here.');
  });

  it('says what failed and why when the report could not be read', async () => {
    customerActivity.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    signIn(STAFF);
    await open();
    // Not an access refusal: the screen's own words (its fallbackError), not the service's.
    expect(texts()).toEqual(expect.arrayContaining(["Couldn't load GRN activity", 'Failed to fetch GRN activity', 'Try again']));
    expect(texts()).not.toContain('The facility refused this report.');
  });
});
