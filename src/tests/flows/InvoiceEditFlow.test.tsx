/**
 * Editing a saved invoice, start to finish, on the real stack: the invoice's page, "Edit", the load, the three steps,
 * "Update invoice" and "View invoice"; and the load that fails. Only the facility's `rpc` is a stand-in.
 *
 * The saved invoice 42 (GRN A0010, customer Example Traders, 5 Oct 2026) has the lines of flowLines.grnA() with the
 * first potato line free (charge 0) and the reason "Sample lot" stored for it:
 * storage 0 + 500 + 200, labour 450, tax 45, total 1,195.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { EDIT_ID, startFlowApp, textOf, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { NUMBER_FIELD, cell, openEditFromDetails } from '@/tests/helpers/invoiceFlowSteps';

// A flow walks several screens; on a busy machine it needs more than the default 5 seconds.
jest.setTimeout(30000);

(jest.requireMock('react-native-reanimated') as { useReducedMotion?: () => boolean }).useReducedMotion = () => false;

jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks());
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('@/components/lists', () => ({ InvoiceFlashList: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  listenToKeyboardEvents: () => (component: unknown) => component,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));

let server: FlowServer;
let app: FlowApp;

const savedLines = () => {
  const lines = flowLines.grnA();
  lines[0] = { ...lines[0], charge: 0 };
  return lines;
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  newFlowStore();
  server = makeFlowServer();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
  server.setInvoice(savedLines(), { labour: 450, tax_amount: 45, total: 1195, zero_charge_reason: 'Sample lot' });
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync() });
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const form = () => app.store.getState().invoiceForm;
const updates = () => server.callsOf('update_invoice');
const line = (n: number) => form().items[n];

describe('opening the edit form', () => {
  it('shows the spinner while the invoice loads, then step 1 with the saved values', async () => {
    const hold = server.hold('get_invoice_detail');
    await app.go(`/invoice-details/${EDIT_ID}`);
    await app.tap('open-edit');

    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(app.texts()).toContain(t('invoice.label.loadingInvoice'));
    expect(app.hasInput(NUMBER_FIELD)).toBe(false);

    hold.release();
    await app.settle();

    expect(app.texts()).not.toContain(t('invoice.label.loadingInvoice'));
    expect(server.callsOf('get_invoice_detail').map((call) => call.args)).toEqual([{ p_invoice_id: EDIT_ID }]);
    expect(server.callsOf('get_invoice_data').map((call) => call.args)).toEqual([{ p_invoice_id: EDIT_ID }]);
    expect(app.valueOf(NUMBER_FIELD)).toBe('42');
    expect(textOf(app.byTestID('invoice-grn-value'))).toBe('GRN A0010');
    expect(app.texts()).toEqual(expect.arrayContaining(['5 Oct 2026', '2026-27', 'Example Traders', 'Edit invoice']));
    expect(form().invoice_id).toBe(EDIT_ID);
    expect(form().items).toHaveLength(3);
    expect(form().header.zero_charge_reason).toBe('Sample lot');
    // An edit does not ask for a new number.
    expect(server.callsOf('get_next_invoice_number')).toHaveLength(0);
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('changing a charge and updating', () => {
  it('sends exactly one update_invoice with the changed charge, the kept zero-charge reason and the new totals', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step2');
    // The saved charges show: 0.00 on the free line, 5.00 on the next.
    expect(app.valueOf(cell(line(0).temp_id))).toBe('0.00');
    expect(app.valueOf(cell(line(1).temp_id))).toBe('5.00');

    await app.typeKeys(cell(line(1).temp_id), '6');
    // 100 x 6 + 200 labour = 800, 5 % tax = 40: 840 (was 735). Total 210 + 840 + 250.
    expect(line(1).item_total).toBe(840);
    expect(form().header.total).toBe(1300);

    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step3');
    // The ITEMS footer shows bags only since F2 (R3b-08: one money total, in CHARGES).
    expect(app.byTestID('invoice-review-items-total').props.accessibilityLabel).not.toContain('₹');

    await app.tap('Update invoice');
    expect(app.dialog().props.title).toBe('Update invoice 42?');
    expect(app.dialog().props.message).toContain('1 item has a charge of 0.');
    expect(updates()).toHaveLength(0);
    await app.tapDialog('Update invoice');

    expect(updates()).toHaveLength(1);
    const { p_invoice_id, p_invoice_data, p_invoice_items } = updates()[0].args;
    expect(p_invoice_id).toBe(EDIT_ID);
    expect(p_invoice_data).toMatchObject({
      inv_no: 42,
      inv_fin_year: 2026,
      gr_id: IDS.grn,
      discount: 0,
      labour: 450,
      tax_amount: 50,
      total: 1300,
      zero_charge_reason: 'Sample lot',
    });
    expect(p_invoice_items.map((sent: { charge: number }) => sent.charge)).toEqual([0, 6, 4]);
    // An update does not ask whether the GRN can still be invoiced: the invoice holds it already.
    expect(server.callsOf('generate_invoice_data_for_grn_with_pricing')).toHaveLength(0);
    expect(server.callsOf('save_invoice')).toHaveLength(0);

    // The invoice dialog reads "updated" with the stored total, and offers "View invoice" only (no "Create another").
    expect(app.successDialog()).toBeDefined();
    expect(app.texts()).toEqual(expect.arrayContaining(['Invoice updated', 'Invoice 42 has been updated.', '₹1,300.00']));
    await expect(app.tapSuccess('Create another invoice')).rejects.toThrow('No button');

    await app.tapSuccess('View invoice');
    expect(app.pathname()).toBe('/invoice-details/inv-42');
    expect(app.stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
    expect(form().invoice_id).toBeNull();
  });

  it('leaves the free line free and the reason as stored when only another line changes', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    await app.typeKeys(cell(line(2).temp_id), '9');
    await app.tap('Next: review');
    await app.tap('Update invoice');
    await app.tapDialog('Update invoice');

    expect(updates()).toHaveLength(1);
    expect(updates()[0].args.p_invoice_data.zero_charge_reason).toBe('Sample lot');
    expect(updates()[0].args.p_invoice_items.map((sent: { charge: number }) => sent.charge)).toEqual([0, 5, 9]);
  });
});

describe('an invoice that cannot be loaded', () => {
  const errorTitle = t('invoice.edit.openFailedTitle');

  it('shows the error with Try again and Close; Try again loads it', async () => {
    server.fail('get_invoice_detail', 'Network request failed');
    await app.go(`/invoice-details/${EDIT_ID}`);
    await app.tap('open-edit');

    expect(app.texts()).toContain(errorTitle);
    expect(app.hasInput(NUMBER_FIELD)).toBe(false);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(form().items).toEqual([]);

    server.restore('get_invoice_detail');
    await app.tapText('Try again');

    expect(app.texts()).not.toContain(errorTitle);
    expect(app.valueOf(NUMBER_FIELD)).toBe('42');
    expect(form().items).toHaveLength(3);
    expect(server.callsOf('get_invoice_detail').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the error again when the retry fails too, and Close returns to the invoice page', async () => {
    server.fail('get_invoice_detail', 'Network request failed');
    await app.go(`/invoice-details/${EDIT_ID}`);
    await app.tap('open-edit');
    await app.tapText('Try again');
    expect(app.texts()).toContain(errorTitle);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');

    await app.tapText('Close');

    expect(app.pathname()).toBe('/invoice-details/inv-42');
    expect(app.stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
  });

  it('does not open the form on a guess when the GRN\'s pricing mode cannot be read', async () => {
    server.fail('get_invoice_data', 'Network request failed');
    await app.go(`/invoice-details/${EDIT_ID}`);
    await app.tap('open-edit');

    expect(app.texts()).toContain(errorTitle);
    expect(app.texts()).toContain(t('invoice.details.loadFailed'));
    expect(app.hasInput(NUMBER_FIELD)).toBe(false);
  });
});
