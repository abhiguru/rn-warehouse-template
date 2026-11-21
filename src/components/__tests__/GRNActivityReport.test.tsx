/**
 * The GRN activity screen at each level of whose GRNs it shows (every
 * customer, one customer, a customer to choose, none), its GRN card, and its
 * empty and failed states, in all four themes. The store is a fixed stand-in
 * here; the filters at work are tested with a real store in
 * src/components/reports/__tests__/GRNActivityFlow.test.tsx.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { getAllGRNActivity, getCustomerGRNActivity } from '@/services/reporting/grn-activity-service';
import { BRANDS, fontWeight, getTokens, type Mode } from '@/theme/tokens';
import { forgetQueries, makeQueryUpdatesImmediate, settleQueries } from '@/tests/helpers/reportQueries';
import GRNActivityScreen from '../../../app/reports/grn-activity';

let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockRouterPush = jest.fn();
/** An element of the rendered tree, as the queries return it. */
type HostElement = ReturnType<typeof screen.getByRole>;

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
  onOperatorServerChange: () => () => {},
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

const user = userEvent.setup({ delay: 0 });

/** Lets the answers already on their way reach the screen. */
const settle = () => act(async () => { await settleQueries(); });

async function open() {
  await render(<GRNActivityScreen />);
  await settle();
}
const press = async (name: string | RegExp) => {
  await user.press(screen.getByRole('button', { name }));
  await settle();
};
const shown = (...words: string[]) => words.forEach(word => expect(screen.getByText(word)).toBeOnTheScreen());
const grnCard = (number: string) => screen.getByRole('button', { name: new RegExp(`^GRN ${number},`) });
const flat = (style: unknown) => (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}) as Record<string, unknown>;
/** Every drawn element of the tree: the bold words have no role to query by. */
function elementsIn(root: HostElement): HostElement[] {
  return [root, ...root.children.flatMap(child => (typeof child === 'string' ? [] : elementsIn(child)))];
}
const bold = () =>
  elementsIn(screen.root!)
    .filter(node => (node.type as unknown) === 'Text' && flat(node.props.style).fontWeight === fontWeight.bold)
    .map(node => [node.props.children].flat().join(''));

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('GRN activity in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('one customer: GRN cards with status words on theme tokens', async () => {
    signIn(STAFF, { brand, mode });
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
    await open();
    shown('GRN activity', 'Green Valley Traders', 'GRN 311', 'Invoice 2026-0042', 'Not invoiced', '1 dispatch');
    expect(screen.getByText('Not invoiced')).toHaveStyle({ color: t.status.critical.text });
    expect(grnCard('311')).toHaveStyle({ backgroundColor: t.surface.card });
    expect(screen.root).toHaveStyle({ backgroundColor: t.background.base });
  });

  it('every customer: one card per customer on theme tokens', async () => {
    signIn(STAFF, { brand, mode });
    await open();
    shown('GRN activity', 'All customers', 'GRNs', 'Green Valley Traders', '4 GRNs · Latest 01/10/25');
    expect(screen.getByRole('button', { name: /^Green Valley Traders,/ })).toHaveStyle({ backgroundColor: t.surface.card });
  });
});

describe('the GRN card', () => {
  beforeEach(() => {
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
  });

  it('reads as one element with every fact, the date included, and opens the GRN', async () => {
    signIn(STAFF);
    await open();
    expect(grnCard('311')).toHaveAccessibleName(
      'GRN 311, 8 Oct 2025, Fictional Farms · Asha Example, 80 of 100 units in stock, Invoice 2026-0042, 1 dispatch, 2 photos'
    );
    expect(grnCard('312')).toHaveAccessibleName('GRN 312, 8 Oct 2025, Sender not recorded · Ravi Example, 20 of 20 bags in stock, Not invoiced');
    // A document number is never cut short.
    expect(screen.getByText('GRN 311').props.numberOfLines).toBeUndefined();

    await press(/^GRN 311,/);
    expect(mockRouterPush).toHaveBeenCalledWith('/grn-details/g1');
  });

  it('names an item the search found inside the card, in bold, and nothing more when the card already shows the word', async () => {
    // One customer's search lives under its own scope since the per-customer search (SR-06).
    signIn(STAFF, { lists: { 'report-grn-activity-customer': { values: {}, searches: { c1: 'garlic' } } } });
    await open();
    expect(screen.getByText('GRN 311')).toBeOnTheScreen();
    expect(screen.queryByText('GRN 312')).not.toBeOnTheScreen();
    expect(screen.getByText('Garlic')).toBeOnTheScreen();
    expect(bold()).toEqual(['Garlic']);
    expect(grnCard('311').props.accessibilityLabel).toMatch(/, Garlic$/);
    await screen.unmount();

    // "fictional" is in the sender's name on the card, so the item that also has it is not named.
    signIn(STAFF, { lists: { 'report-grn-activity-customer': { values: {}, searches: { c1: 'fictional' } } } });
    await open();
    expect(screen.queryByText('Fictional Onions')).not.toBeOnTheScreen();
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
    shown('No customer linked', 'No customer is linked to your account. Ask your facility to link one.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(allActivity).not.toHaveBeenCalled();
    expect(customerActivity).not.toHaveBeenCalled();
  });

  it('a customer account with several customers chooses one, and can change it from the header', async () => {
    signIn({ id: 'u1', role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [GREEN, RIVER] });
    await open();
    shown('Choose a customer', 'Green Valley Traders', 'Riverbank Produce');
    expect(customerActivity).not.toHaveBeenCalled();

    await press('Riverbank Produce');
    expect(customerActivity).toHaveBeenCalledTimes(1);
    const [argument] = customerActivity.mock.calls[0];
    expect(Object.keys(argument).sort()).toEqual(['customerId', 'fromDate', 'toDate']);
    expect(argument.customerId).toBe('c2');
    shown('Riverbank Produce', 'GRN 311');
    expect(allActivity).not.toHaveBeenCalled();

    await press('Change customer');
    expect(screen.getByText('Choose a customer')).toBeOnTheScreen();
    expect(screen.queryByText('GRN 311')).not.toBeOnTheScreen();
  });

  it('a warehouse role is offered no "Change customer"', async () => {
    signIn(STAFF);
    mockParams = { customerId: 'c1', customerName: 'Green Valley Traders' };
    await open();
    expect(screen.queryByRole('button', { name: 'Change customer' })).not.toBeOnTheScreen();
  });
});

describe('the customer opened last', () => {
  const prefs = { lastCustomer: { 'grn-activity': { id: 'c2', name: 'Riverbank Produce' } } };

  it('is one row above the customers, which opens that customer', async () => {
    signIn(STAFF, { prefs });
    await open();
    shown('Last opened', 'Riverbank Produce');
    await press('Last opened: Riverbank Produce');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c2', customerName: 'Riverbank Produce' } });
  });

  it('is not offered while a search is typed', async () => {
    signIn(STAFF, { prefs, lists: { 'report-grn-activity': { values: { search: 'green' } } } });
    await open();
    expect(screen.queryByText('Last opened')).not.toBeOnTheScreen();
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
    shown('No GRNs in this period', 'Choose a longer period to see more GRNs.');
  });

  it('suggests no longer period when the period is already the longest', async () => {
    signIn(STAFF, { prefs: { period: { preset: 'last420' } } });
    await open();
    expect(screen.getByText('No GRNs in this period')).toBeOnTheScreen();
    expect(screen.queryByText('Choose a longer period to see more GRNs.')).not.toBeOnTheScreen();
    // Nor the lists' own words for an empty list.
    expect(screen.queryByText('Items you create appear here.')).not.toBeOnTheScreen();
  });

  it('says what failed and why when the report could not be read', async () => {
    customerActivity.mockResolvedValue({ success: false, message: 'The facility refused this report.' } as never);
    signIn(STAFF);
    await open();
    // Not an access refusal: the screen's own words (its fallbackError), not the service's.
    shown("Couldn't load GRN activity", "Couldn't load GRN activity. Check your connection and try again.", 'Try again');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByText('The facility refused this report.')).not.toBeOnTheScreen();
  });
});
