/**
 * WH-298 phone finding (rerun on 8b16736c): after an offline start the network returns, and a list on screen that failed
 * while the identity gate was shut ("Warehouse identity verification required") keeps its error until the person leaves
 * the tab. These lists keep their own state, so the layout's query refetch does not reach them. Each mounted list showing
 * its load error must load again once, by itself, when the gate first opens: no focus change, tap or pull.
 *
 * Real: the five lists and their item cards and error view, their services, the supabase client with the gated fetch,
 * `operatorResumeGate` (so the identity error arises as it does on the phone), the token store. Faked: the network
 * (`fetch`), the native secure store, the navigator's focus, FlashList's native drawing, the Redux state, NetInfo's
 * answer, and the print, customer and recently-dispatched panels the lists mount beside their rows.
 *
 * The services are spied on (calls pass through) to count each time a list asks: a request refused at the gate never
 * reaches `fetch`, and the dispatch service merges identical requests in flight, so the network alone cannot show a
 * second ask.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import GRNListFiori from '@/components/GRNListFiori';
import OrderFlashList from '@/components/lists/OrderFlashList';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import SupervisorOrderQueueList from '@/components/lists/SupervisorOrderQueueList';
import DispatchFlashList from '@/components/lists/DispatchFlashList';
import * as grnService from '@/services/grn-service';
import * as invoiceService from '@/services/invoice-service';
import * as dispatchService from '@/services/dispatch-service';
import { OrderService } from '@/services/order-service';
import { operatorResumeGate } from '@/config/operatorResume';
import { loadOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { cacheUserProfile, initializeSupabase, storeTokens } from '@/config/supabaseConfig';
import { noteGrnPagingUnit, resetFacilityGrnPaging } from '@/config/facilityGrnPaging';
import { resetScreenFocus } from './focusHarness';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn(), getState: () => ({ auth: {} }) } }));
const mockState = {
  listFilters: { lists: {} },
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', name: 'Asha Fictional', role: 'admin', assignedCustomers: [] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
// Draws every row and the list header: the native list draws nothing without a layout.
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
      return React.createElement(
        React.Fragment,
        null,
        draw(props.ListHeaderComponent),
        (props.data ?? []).map((item: unknown, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))),
      );
    }),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true, type: 'wifi' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({ FilteredListHeader: () => null, filteredEmptyProps: () => ({}) }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: require('react').forwardRef(() => null) }));
jest.mock('@/components/OrderBusinessSheet', () => ({ OrderBusinessSheet: () => null }));
jest.mock('@/components/RecentDispatchedOrdersSection', () => ({ __esModule: true, default: () => null }));

const A = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const anon = `header.${encode({ role: 'anon', exp: 9999999999 })}.signature`;
const jwt = () =>
  `${encode({ alg: 'HS256' })}.${encode({ sub: 'test-user', session_id: 'test-session', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.test-signature`;
const json = (body: unknown) => {
  const response = {
    ok: true, status: 200, statusText: 'OK', url: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0), clone: () => response,
  };
  return response as unknown as Response;
};

const CUSTOMER = 'Fictional Orchard';
const order = { id: 'order-fictional-1', customer_id: 'customer-fictional-1', customer_name: CUSTOMER, customer: { name: CUSTOMER }, status: 'OPEN', item_count: 2, total_items: 2, total_quantity: 8, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' };
const grnLine = { id: 'g1', grn_id: 'g1', grn_item_id: 'g1-line', gr_no: 'A0001', date: '2026-10-01', customer_id: 'customer-fictional-1', customer_name: CUSTOMER, supervisor_name: null, registration: null, item_id: 'item-1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 12 };
const invoice = { invoice_id: 'invoice-fictional-1', invoice_number: 'IN0001', invoice_date: '2026-10-01', customer_id: 'customer-fictional-1', customer: { name: CUSTOMER }, total_amount: 1200, fin_year: 2026 };
const dispatchRow = { id: 'dispatch-fictional-1', disp_no: 'DD0001', disp_date: '2026-10-01', customer_id: 'customer-fictional-1', customer_name: CUSTOMER, total_qty: 5, total_items: 1, items: [{ grn_item_id: 'g1-line', item_name: 'Example Potatoes', disp_qty: 5, grn_qty: 10, gr_no: 'A0001', weight: 50 }] };
const orderAnswer = { success: true, data: { orders: [order], pagination: { total_count: 1, has_more: false } } };

const LISTS = [
  {
    name: 'GRN list', element: () => <GRNListFiori />, rpc: 'get_all_grn_items', errorTitle: "Couldn't load GRNs",
    answer: [{ success: true, data: [grnLine], pagination: { limit: 20, offset: 0, total_count: 1, has_more: false, unit: 'receipt' } }],
    spy: () => jest.spyOn(grnService, 'getGRNListPage') as unknown as jest.Mock,
  },
  {
    name: 'orders list', element: () => <OrderFlashList />, rpc: 'get_orders_list', errorTitle: "Couldn't load orders",
    answer: orderAnswer,
    spy: () => jest.spyOn(OrderService, 'getOrdersList') as unknown as jest.Mock,
  },
  {
    name: 'invoice list', element: () => <InvoiceFlashList />, rpc: 'get_invoices_list', errorTitle: "Couldn't load invoices",
    answer: { success: true, data: [invoice], pagination: { total_count: 1, limit: 20, offset: 0, has_more: false } },
    spy: () => jest.spyOn(invoiceService, 'getInvoicesList') as unknown as jest.Mock,
  },
  {
    name: 'order queue', element: () => <SupervisorOrderQueueList />, rpc: 'get_orders_list', errorTitle: "Couldn't load the order queue",
    answer: orderAnswer,
    spy: () => jest.spyOn(OrderService, 'getOrdersList') as unknown as jest.Mock,
  },
  {
    name: 'dispatch list', element: () => <DispatchFlashList />, rpc: 'get_dispatch_list_with_items', errorTitle: "Couldn't load dispatches",
    answer: { success: true, data: { dispatches: [dispatchRow], pagination: { total_count: 1, current_page: 1, total_pages: 1 } } },
    spy: () => jest.spyOn(dispatchService, 'getDispatchListWithItems') as unknown as jest.Mock,
  },
];

const secure = new Map<string, string>();
const requests: string[] = [];
let answers: Record<string, unknown> = {};
const oldFetch = global.fetch;
/** What the facility check answers: false while the server cannot be verified. */
let verifier: () => Promise<boolean>;
let removeVerifier = () => {};

const rpcRequests = (name: string) => requests.filter(url => url.includes(`/rpc/${name}`));
/** Long enough for a reload that was started to reach the service and draw its answer. */
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
/** The gate opens or is refused, as the next check of the facility would do it. Nothing touches the list. */
async function verify() {
  let result: boolean | undefined;
  await act(async () => { result = await operatorResumeGate.ensureVerified(); });
  await settle();
  return result;
}

beforeEach(async () => {
  for (const level of ['log', 'warn', 'error', 'info', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => {});
  resetScreenFocus();
  secure.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  await AsyncStorage.clear();
  requests.length = 0;
  answers = {};
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const rpc = /\/rpc\/([a-z_]+)/.exec(url)?.[1];
    return json((rpc && answers[rpc]) || {});
  }) as typeof fetch;
  await loadOperatorServer();
  await saveOperatorServer(A, false);
  // The facility is already known to page GRNs by receipt. Learning it from an answer changes the GRN list's filter
  // context, which reads the list once more whatever caused the first read.
  resetFacilityGrnPaging();
  noteGrnPagingUnit('receipt');
  initializeSupabase(A.origin, anon);
  await storeTokens(jwt(), 'a'.repeat(64), Date.now() + 3600000);
  await cacheUserProfile({ id: 'profile-fictional', auth_user_id: 'test-user', name: 'Asha Fictional', role: 'admin', active: true });
  verifier = async () => false;
  removeVerifier = operatorResumeGate.installVerifier(() => verifier());
});

// Testing Library's own cleanup has unmounted the list before this runs.
afterEach(async () => {
  // Leave the shared gate open for the next case; a check a failed case left unanswered is superseded first.
  verifier = async () => true;
  operatorResumeGate.suspend();
  await operatorResumeGate.ensureVerified();
  removeVerifier();
  jest.restoreAllMocks();
});
afterAll(() => { global.fetch = oldFetch; });

describe.each(LISTS)('$name', ({ element, rpc, errorTitle, answer, spy }) => {
  let asked: jest.Mock;
  beforeEach(() => {
    answers = { [rpc]: answer };
    asked = spy();
  });
  const show = () => render(<GestureHandlerRootView>{element()}</GestureHandlerRootView>);
  /** The list as the phone showed it after an offline start: mounted while the gate is shut, in its load error. */
  async function failWhileShut() {
    operatorResumeGate.suspend();
    await show();
    expect(await screen.findByText(errorTitle)).toBeOnTheScreen();
    await settle();
    expect(asked).toHaveBeenCalledTimes(1);
    await expect(asked.mock.results[0].value).resolves.toMatchObject({ success: false });
    expect(rpcRequests(rpc)).toHaveLength(0);
  }

  it('in its load error, loads again by itself exactly once when the gate opens, and shows the rows', async () => {
    await failWhileShut();

    verifier = async () => true;
    expect(await verify()).toBe(true);

    expect(await screen.findAllByText(new RegExp(CUSTOMER, 'i'))).not.toHaveLength(0);
    expect(screen.queryByText(errorTitle)).not.toBeOnTheScreen();
    expect(asked).toHaveBeenCalledTimes(2);
    expect(rpcRequests(rpc)).toHaveLength(1);

    // The gate shuts and opens again: the list is no longer in error, so it asks for nothing.
    operatorResumeGate.suspend();
    expect(await verify()).toBe(true);
    expect(asked).toHaveBeenCalledTimes(2);
    expect(rpcRequests(rpc)).toHaveLength(1);
  });

  it('showing its rows, asks for nothing when the gate opens', async () => {
    await show();
    expect(await screen.findAllByText(new RegExp(CUSTOMER, 'i'))).not.toHaveLength(0);
    expect(asked).toHaveBeenCalledTimes(1);

    operatorResumeGate.suspend();
    verifier = async () => true;
    expect(await verify()).toBe(true);

    expect(asked).toHaveBeenCalledTimes(1);
    expect(rpcRequests(rpc)).toHaveLength(1);
  });

  it('keeps its error and asks for nothing when the verification is refused', async () => {
    await failWhileShut();

    expect(await verify()).toBe(false);

    expect(asked).toHaveBeenCalledTimes(1);
    expect(screen.getByText(errorTitle)).toBeOnTheScreen();
  });

  it('asks for nothing when a verification that passes has been superseded', async () => {
    await failWhileShut();

    let answerCheck!: (verified: boolean) => void;
    verifier = () => new Promise<boolean>(resolve => { answerCheck = resolve; });
    const first = operatorResumeGate.ensureVerified();
    await settle();
    operatorResumeGate.suspend();
    let result: boolean | undefined;
    await act(async () => { answerCheck(true); result = await first; });
    await settle();

    expect(result).toBe(false);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(screen.getByText(errorTitle)).toBeOnTheScreen();
  });

  it('once unmounted, asks for nothing when the gate opens', async () => {
    await failWhileShut();
    await screen.unmount();

    verifier = async () => true;
    expect(await verify()).toBe(true);

    expect(asked).toHaveBeenCalledTimes(1);
    expect(rpcRequests(rpc)).toHaveLength(0);
  });
});
