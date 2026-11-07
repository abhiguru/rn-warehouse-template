/**
 * WH-109: the invoice details screen. Print is offered to admin, supervisor and staff (not a customer, not where printing
 * is off); the real print service runs against an answer the backend really gives. A failure is thrown to the print
 * dialog (it stays open and shows the text); an unconfirmed job closes the dialog and shows the "Print not confirmed" alert, so the job
 * is not sent again on a guess. A financial year that is not a number is left out of the request.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import InvoiceDetailScreen from '../../../app/invoice-details/[id]';
import { getInvoiceDetails, getInvoiceItemsDetailed, getInvoiceReasons } from '@/services/invoice-service';
import { showAlert } from '@/utils/alert';
import type { InvoiceDetailsResponse, InvoiceItemsDetailedResponse } from '@/services/invoice-service';

const mockAuth = { userProfile: { role: 'admin' } };
let mockRole = 'staff';
let mockPrinting = true;
const mockFetch = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'fictional-invoice' }),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(() => { callback(); }, [callback]);
  },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: mockAuth, theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isCustomer: mockRole === 'customer', role: mockRole, canUpdate: mockRole !== 'customer', canDelete: false }),
}));
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => mockPrinting }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Portal: 'Portal', Snackbar: 'Snackbar' }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
// The dialog is a host element that keeps its props: its onConfirm is the screen's own.
jest.mock('@/components/PrintRangeDialog', () => ({
  PrintRangeDialog: (props: object) => require('react').createElement('PrintRangeDialog', props),
}));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ ...jest.requireActual('@/utils/alert'), showAlert: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));
jest.mock('@/services/invoice-service', () => ({
  ...jest.requireActual('@/services/invoice-service'),
  getInvoiceDetails: jest.fn(), getInvoiceItemsDetailed: jest.fn(), getInvoiceReasons: jest.fn(),
}));
jest.mock('@/components/invoice-details', () => ({
  InvoiceHeroHeader: () => null,
  InvoiceTabNavigator: 'InvoiceTabNavigator',
  InvoiceOverviewTab: jest.requireActual('@/components/invoice-details/InvoiceOverviewTab').InvoiceOverviewTab,
  InvoiceLineItemsTab: () => null,
  InvoiceBreakdownTab: () => null,
}));

let renderer: ReturnType<typeof create>;
const header = (extra: Record<string, unknown> = {}) => ({
  invoice_number: 10002, invoice_date: '2026-10-01', gr_no: 'A1', total: 100, tax_amount: 5, labour: 0, discount: 0,
  financial_year: '2025-26', updated_at: '2026-10-02T04:00:00.123Z', customer: { id: 'c1', name: 'Asha Traders' }, ...extra,
});
const detail = (extra: Record<string, unknown> = {}) =>
  ({ success: true, data: { header: header(extra), items: [] } }) as unknown as InvoiceDetailsResponse;
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });

async function open(extra: Record<string, unknown> = {}) {
  jest.mocked(getInvoiceDetails).mockResolvedValue(detail(extra));
  await act(async () => { renderer = create(<InvoiceDetailScreen />); });
  await act(async () => {
    renderer.root.findByType('InvoiceTabNavigator' as unknown as React.ElementType).props.on_tab_change('overview');
  });
}
const printButtons = () => renderer.root.findAll(n => typeof n.props.onPress === 'function' && /^print/i.test(String(n.props.accessibilityLabel ?? '')));
const openDialog = async () => { await act(async () => { printButtons()[0].props.onPress(); }); };
const dialog = () => renderer.root.findByType('PrintRangeDialog' as never);
const snackbar = () => renderer.root.findByType('Snackbar' as never);
const confirm = (start = '10002', end = '10002') => dialog().props.onConfirm(start, end) as Promise<void>;
const sentBody = () => JSON.parse(mockFetch.mock.calls[0][1].body);

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRole = 'staff';
  mockPrinting = true;
  jest.mocked(getInvoiceItemsDetailed).mockResolvedValue({ success: false } as InvoiceItemsDetailedResponse);
  jest.mocked(getInvoiceReasons).mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => { renderer.unmount(); });
});

describe('who sees Print', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s sees Print', async (role) => {
    mockRole = role;
    await open();
    expect(printButtons().length).toBeGreaterThan(0);
  });
  it('a customer does not', async () => {
    mockRole = 'customer';
    await open();
    expect(printButtons()).toHaveLength(0);
  });
  it('nobody does where the facility has printing off', async () => {
    mockPrinting = false;
    await open();
    expect(printButtons()).toHaveLength(0);
  });
});

describe('printing from the screen', () => {
  it('sends the invoice number, its year (2025-26 -> 2025) and a request_id; the snackbar says it was sent', async () => {
    mockFetch.mockResolvedValue(reply(200, { success: true, message: 'ok', print_job: { print_job_id: 'j1', cups_job_id: 7, job_uri: 'x', printer: 'P', content_size: 1 } }));
    await open();
    await openDialog();
    await act(async () => { await confirm(); });
    expect(mockFetch.mock.calls[0][0]).toBe('https://example.invalid/functions/v1/print-invoice-preprinted');
    expect(sentBody()).toEqual({ start_inv_no_str: '10002', end_inv_no_str: '10002', inv_fin_year: 2025, request_id: expect.any(String) });
    expect(snackbar().props.visible).toBe(true);
    expect(snackbar().props.children).toBe('Sent to the printer (job 7).');
    expect(dialog().props.visible).toBe(false);
  });

  it('leaves out a financial year that is not a number', async () => {
    mockFetch.mockResolvedValue(reply(200, { success: true }));
    await open({ financial_year: 'not a year' });
    await act(async () => { await confirm(); });
    expect(sentBody()).toEqual({ start_inv_no_str: '10002', end_inv_no_str: '10002', request_id: expect.any(String) });
  });

  it.each([
    [503, { success: false, code: 'PRINTING_OFF', error: 'Printing is not set up for this facility' }, 'Printing is not set up for this facility. Ask an admin to set it up.'],
    [403, { success: false, error: 'Admin, supervisor or staff access required to print', code: 'PRINT_FORBIDDEN' }, "You aren't allowed to print. Ask an admin."],
    [502, { success: false, error: 'connect ECONNREFUSED', code: 'PRINTER_FAILED' }, "The printer couldn't print the job. Check the printer and try again."],
  ])('a %i answer is thrown to the dialog, which stays open', async (status, body, text) => {
    mockFetch.mockResolvedValue(reply(status, body));
    await open();
    await openDialog();
    await act(async () => { await expect(confirm()).rejects.toThrow(text); });
    expect(dialog().props.visible).toBe(true);
    expect(snackbar().props.visible).toBeFalsy();
  });

  it('a lost connection is thrown to the dialog with the connection text', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    await open();
    await openDialog();
    await act(async () => { await expect(confirm()).rejects.toThrow("Couldn't reach the print server. Check your connection and try again."); });
    expect(dialog().props.visible).toBe(true);
  });

  it('an unconfirmed job closes the dialog and shows the "Print not confirmed" alert (Product, 2026-11-07)', async () => {
    mockFetch.mockResolvedValue(reply(502, { success: false, error: 'The printer did not confirm the job', code: 'PRINT_UNCONFIRMED', unconfirmed: true, print_job_id: 'j1' }));
    await open();
    await openDialog();
    expect(dialog().props.visible).toBe(true);
    await act(async () => { await confirm(); });
    expect(dialog().props.visible).toBe(false);
    expect(showAlert).toHaveBeenCalledWith('Print not confirmed', 'The printer did not confirm the job. Check the printer before printing again.');
    expect(snackbar().props.visible).toBeFalsy();
  });
});
