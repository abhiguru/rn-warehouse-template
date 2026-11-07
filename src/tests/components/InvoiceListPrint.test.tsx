/**
 * WH-109: Print on the Invoice list. The real list, card, Print swipe, print dialog and print service run; only the
 * network reply (an answer the backend really gives) and the screen plumbing are faked.
 *
 *  - Print is offered to admin, supervisor and staff (when the facility has printing on), not to a customer.
 *  - Pressing it opens the print dialog for that invoice and Print there sends that number with a request_id.
 *  - A failure stays in the dialog with its own text; an unconfirmed job closes the dialog and shows an alert.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import { getInvoicesList } from '@/services/invoice-service';
import { resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
let mockPrinting = true;
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => mockPrinting }));
const mockFetch = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));
jest.mock('@/features/filters/configs', () => ({ INVOICE_FILTERS: { listKey: 'invoice-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
const mockFilters = {
  request: { p_sort_field: 'inv_no', p_sort_direction: 'desc' } as Record<string, unknown>,
  sort: { field: 'inv_no', order: 'desc' },
  values: {},
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/services/invoice-service', () => ({
  CUSTOMER_DISPATCH_MAX: 500,
  getInvoicesList: jest.fn(),
  getAssignedCustomerInvoices: jest.fn(),
}));
const mockAccess = { canManageOrders: true, assignedCustomerIds: ['customer-fictional-1'] };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
let mockRole = 'staff';
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, role: mockRole }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'staff', assignedCustomers: [{ id: 'customer-fictional-1', name: 'Fictional Farms' }] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const invoiceOf = (n: number, extra: object = {}) => ({
  invoice_id: `i${n}`,
  invoice_number: 2554 + n,
  financial_year: '2025-26',
  invoice_date: '2026-10-01',
  customer_name: 'Fictional Farms',
  total: 1000,
  tax_amount: 50,
  labour: 10,
  discount: 0,
  ...extra,
});
const answer = (invoices: ReturnType<typeof invoiceOf>[]) => ({
  success: true, message: '', data: { invoices, pagination: { has_more: false } },
});
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });

const SENT = { success: true, message: 'Invoice range print job submitted', range: { start: '2556', end: '2556', count: 1 }, print_job: { print_job_id: 'j1', cups_job_id: 7, job_uri: 'x', printer: 'P', content_size: 1 } };
const UNCONFIRMED = { success: false, error: 'The printer did not confirm the job', code: 'PRINT_UNCONFIRMED', unconfirmed: true, print_job_id: 'j1' };

const mounted: ReactTestRenderer[] = [];
async function renderList() {
  jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1), invoiceOf(2)]) as never);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GestureHandlerRootView><InvoiceFlashList /></GestureHandlerRootView>);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRole = 'staff';
  mockPrinting = true;
  resetFlashListWindow();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const card = (tree: ReactTestRenderer, n: number) =>
  tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === `Print Invoice ${2554 + n}`)[0];
const printAction = (tree: ReactTestRenderer, n: number) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === `Print Invoice ${2554 + n}` && typeof node.props.onPress === 'function');
const textOf = (node: ReactTestInstance) => [node.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === 'Text').map(textOf);
const dialog = (tree: ReactTestRenderer) => tree.root.findAll((node) => node.props.accessibilityViewIsModal === true);
const dialogPrint = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Print' && typeof node.props.onPress === 'function');
const openPrint = async (tree: ReactTestRenderer, n: number) => {
  // Opening the swipe's action renders it; its Pressable is the Print action of that card.
  const action = printAction(tree, n)![0];
  await act(async () => { action.props.onPress(); });
};
const pressDialogPrint = (tree: ReactTestRenderer) => act(async () => { await dialogPrint(tree).props.onPress(); });
const sentBody = () => JSON.parse(mockFetch.mock.calls[0][1].body);

describe('who sees Print', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s: the card offers Print as a swipe action and a screen-reader action', async (role) => {
    mockRole = role;
    const tree = await renderList();
    expect(printAction(tree, 1)!.length).toBeGreaterThan(0);
    const pressable = tree.root.findAll((node) => node.props.accessibilityActions && node.props.testID === undefined && node.props.accessibilityHint)[0];
    expect(pressable.props.accessibilityActions).toEqual([{ name: 'print', label: 'Print' }]);
    expect(pressable.props.accessibilityHint).toBe('Opens the invoice. Print is in the actions menu.');
  });

  it('a customer gets no Print', async () => {
    mockRole = 'customer';
    const tree = await renderList();
    expect(printAction(tree, 1)).toHaveLength(0);
    expect(tree.root.findAll((node) => node.props.accessibilityActions !== undefined)).toHaveLength(0);
    expect(texts(tree)).not.toContain('Print');
  });

  it('nobody gets Print where the facility has printing off', async () => {
    mockPrinting = false;
    const tree = await renderList();
    expect(printAction(tree, 1)).toHaveLength(0);
  });
});

describe('pressing Print', () => {
  it('opens the print dialog for that row and sends that invoice number with a request_id', async () => {
    mockFetch.mockResolvedValue(reply(200, SENT));
    const tree = await renderList();
    expect(dialog(tree)).toHaveLength(0);

    await openPrint(tree, 2);
    expect(dialog(tree).length).toBeGreaterThan(0);
    await pressDialogPrint(tree);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://example.invalid/functions/v1/print-invoice-preprinted');
    expect(sentBody()).toEqual({ start_inv_no_str: '2556', end_inv_no_str: '2556', inv_fin_year: 2025, request_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(showToast).toHaveBeenCalledWith('Sent to the printer (job 7).');
    expect(dialog(tree)).toHaveLength(0);
  });

  // Each text from the server answer that really produces it (backend: main/index.ts, auth-helpers.ts, print-transport.ts)
  it.each([
    ['printing not set up (503 PRINTING_OFF)', 503, { success: false, code: 'PRINTING_OFF', error: 'Printing is not set up for this facility' }, 'Printing is not set up for this facility. Ask an admin to set it up.'],
    ['not allowed (403 PRINT_FORBIDDEN)', 403, { success: false, error: 'Admin, supervisor or staff access required to print', code: 'PRINT_FORBIDDEN' }, "You aren't allowed to print. Ask an admin."],
    ['printer failed (502 PRINTER_FAILED)', 502, { success: false, error: 'connect ECONNREFUSED', code: 'PRINTER_FAILED' }, "The printer couldn't print the job. Check the printer and try again."],
  ])('%s stays in the dialog with its own text', async (_name, status, body, text) => {
    mockFetch.mockResolvedValue(reply(status, body));
    const tree = await renderList();
    await openPrint(tree, 1);
    await pressDialogPrint(tree);

    expect(texts(tree)).toContain(text);
    expect(dialog(tree).length).toBeGreaterThan(0);
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a lost connection stays in the dialog and says to check the connection', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const tree = await renderList();
    await openPrint(tree, 1);
    await pressDialogPrint(tree);

    expect(texts(tree)).toContain("Couldn't reach the print server. Check your connection and try again.");
    expect(dialog(tree).length).toBeGreaterThan(0);
  });

  it('an unconfirmed job closes the dialog and shows the "Print not confirmed" alert (Product, 2026-11-07)', async () => {
    mockFetch.mockResolvedValue(reply(502, UNCONFIRMED));
    const tree = await renderList();
    await openPrint(tree, 1);
    await pressDialogPrint(tree);

    expect(showAlert).toHaveBeenCalledWith('Print not confirmed', 'The printer did not confirm the job. Check the printer before printing again.');
    expect(dialog(tree)).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('invoices that need care', () => {
  it('a cancelled invoice is not offered Print, a live one is', async () => {
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1, { cancelled_at: '2026-10-02T10:00:00Z' }), invoiceOf(2)]) as never);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<GestureHandlerRootView><InvoiceFlashList /></GestureHandlerRootView>); });
    mounted.push(tree);
    expect(printAction(tree, 1)).toHaveLength(0);
    expect(printAction(tree, 2)!.length).toBeGreaterThan(0);
  });

  it('an invoice whose year is not a number is printed without a year, never with NaN or null', async () => {
    mockFetch.mockResolvedValue(reply(200, SENT));
    jest.mocked(getInvoicesList).mockResolvedValue(answer([invoiceOf(1, { financial_year: 'not a year' })]) as never);
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<GestureHandlerRootView><InvoiceFlashList /></GestureHandlerRootView>); });
    mounted.push(tree);
    await openPrint(tree, 1);
    await pressDialogPrint(tree);
    expect(sentBody()).toEqual({ start_inv_no_str: '2555', end_inv_no_str: '2555', request_id: expect.any(String) });
  });
});
