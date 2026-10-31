/**
 * Creating an invoice, start to finish, on the real stack: the Invoices tab, "Create invoice", the three steps, the
 * save and "Create another invoice". Only the facility's `rpc` is a stand-in (invoiceFlowServer); every screen, the
 * hook, the slice and the service are the app's own.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { DISCOUNT, DISCOUNT_REASON, NUMBER_FIELD, cell, groupField, openNewInvoice, pickGrn, reviewRow } from '@/tests/helpers/invoiceFlowSteps';
import { textOf } from '@/tests/helpers/invoiceFlowHarness';
import { Platform } from 'react-native';

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

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  newFlowStore();
  server = makeFlowServer();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const open = async () => {
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
};
const form = () => app.store.getState().invoiceForm;
const saves = () => server.callsOf('save_invoice');

/** Steps 1 to 3 of GRN A with a charge of 8 on its first line and a labour of 3 on the potato group. */
async function reachReview() {
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
  await app.tap('Next: items');
  await app.typeKeys(cell(form().items[0].temp_id), '8');
  await app.typeKeys(groupField('i1:::M1', 'labour_rate'), '3');
  await app.tap('Next: review');
}

/** The question of a save, answered with its confirm button; the ConfirmDialog is the real one. */
const confirmSave = async () => {
  await app.tap('Save invoice');
  await app.tapDialog('Save invoice');
};

beforeEach(() => {
  server.addGrn(IDS.grn, 'A0010', flowLines.grnA());
  server.addGrn(IDS.otherGrn, 'A0011', flowLines.grnB());
});

describe('a new invoice, from the Invoices tab to the saved invoice', () => {
  it('opens step 1 with the suggested number of the financial year', async () => {
    await open();
    await app.tap('create-invoice-fab');

    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');
    expect(server.callsOf('get_next_invoice_number').map((call) => call.args)).toEqual([{ p_fin_year: 2026 }]);
    expect(app.texts()).toContain('2026-27');
    // Nothing is chosen yet: the customer and the one-time charge wait for the GRN.
    expect(app.texts().filter((text) => text === 'Filled in when you select a GRN')).toHaveLength(2);
    expect(form().header.gr_id).toBe('');
  });

  it('picks a GRN from the picker: its search is sent as typed, and the customer and the pricing mode are filled in', async () => {
    await open();
    await openNewInvoice(app);
    await app.tap('Search GRNs');
    // Opened empty: both GRNs are listed.
    expect(server.callsOf('get_invoiceable_grns').map((call) => call.args)).toEqual([{ p_search_grn_no: null }]);
    expect(app.controls(/^GRN A00\d\d,/).map((control) => control.props.accessibilityLabel)).toEqual([
      'GRN A0010, Example Traders, 2 Oct',
      'GRN A0011, Example Traders, 2 Oct',
    ]);

    await app.typeKeys('Search GRN number or customer', 'A0011', { stayInField: true });
    await app.settle();

    expect(server.callsOf('get_invoiceable_grns').at(-1)!.args).toEqual({ p_search_grn_no: 'A0011' });
    expect(app.controls(/^GRN A00\d\d,/).map((control) => control.props.accessibilityLabel)).toEqual(['GRN A0011, Example Traders, 2 Oct']);

    await app.tap(/^GRN A0011,/);

    expect(server.callsOf('generate_invoice_data_for_grn_with_pricing').map((call) => call.args)).toEqual([{ p_gr_id: IDS.otherGrn }]);
    expect(textOf(app.byTestID('invoice-grn-value'))).toBe('GRN A0011');
    expect(form().header.gr_id).toBe(IDS.otherGrn);
    expect(form().header.customer_name).toBe('Example Traders');
    expect(form().items).toHaveLength(1);
    expect(app.texts()).toContain('No'); // not a one-time GRN
  });

  it('walks steps 1, 2 and 3, saves with one save_invoice call, and "Create another invoice" starts a new number', async () => {
    await open();
    await openNewInvoice(app);
    await pickGrn(app, 'A0010');

    // Step 1: GRN, customer and the pricing mode are filled in; the number stays 55.
    expect(textOf(app.byTestID('invoice-grn-value'))).toBe('GRN A0010');
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');

    // Step 2: every group and line of the RPC answer, with its amounts.
    await app.tap('Next: items');
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(form().currentStep).toBe(2);
    const lines = form().items;
    expect(lines).toHaveLength(3);
    expect(app.testIDs(/^items-head-(?!total-)/)).toEqual(['items-head-i1:::M1', 'items-head-i2:::M2']);
    expect(app.testIDs(/^cell\|.*\|charge$/)).toEqual(lines.map((line) => cell(line.temp_id)));
    expect(app.texts()).toEqual(expect.arrayContaining(['Example Potatoes', 'Example Onions', '₹735.00', '₹250.00', '₹1,470.00']));

    // A line's own Charge, then Labour for all lines of the potato group: the amounts follow at once.
    await app.typeKeys(cell(lines[0].temp_id), '8');
    expect(app.valueOf(cell(lines[0].temp_id))).toBe('8.00');
    expect(form().items[0].charge).toBe(8);
    expect(form().items[1].charge).toBe(5);
    await app.typeKeys(groupField('i1:::M1', 'labour_rate'), '3');
    expect(form().items.map((line) => line.labour_rate)).toEqual([3, 3, 1]);
    // Line 1: 100 x 8 + 100 x 3 = 1,100 and 5 % tax = 1,155. Line 2: 500 + 300 = 800, tax 40 = 840. The onions stay 250.
    expect(form().items.map((line) => line.item_total)).toEqual([1155, 840, 250]);
    expect(app.texts()).toEqual(expect.arrayContaining(['₹1,155.00', '₹840.00', '₹1,995.00']));
    expect(form().header.total).toBe(2245);

    // Step 3: one row per group; the footer total is the step 2 total; CHARGES has the parts and one Total.
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step3');
    expect(app.testIDs(/^invoice-review-group-/)).toEqual([reviewRow('i1:::M1'), reviewRow('i2:::M2')]);
    expect(textOf(app.byTestID(reviewRow('i1:::M1')))).toContain('₹1,995.00');
    expect(textOf(app.byTestID(reviewRow('i2:::M2')))).toContain('₹250.00');
    // The ITEMS footer shows bags only since F2 (R3b-08: one money total, in CHARGES).
    expect(app.byTestID('invoice-review-items-total').props.accessibilityLabel).not.toContain('₹');
    expect(app.byTestID('invoice-summary').props.testID).toBe('invoice-summary');
    expect(app.texts()).toEqual(expect.arrayContaining(['Subtotal (storage)', '₹1,500.00', 'Labour charges', '₹650.00', 'Tax', '₹95.00']));
    expect(app.texts().filter((text) => text === 'Estimated total')).toHaveLength(1);
    expect(app.byTestID('invoice-summary-total').props.accessibilityLabel).toBe('Estimated total, ₹2,245.00');

    // A discount of 100.60 (the total is 2,144.40 rounded up to the whole rupee, 2,145) and its reason. "Round up"
    // keeps the discount and only moves its paise: 100.00, where the old code replaced the discount by the paise
    // alone; the total stays 2,145.
    await app.typeKeys(DISCOUNT, '100.60');
    expect(app.valueOf(DISCOUNT)).toBe('100.60');
    expect(app.byTestID('invoice-summary-total').props.accessibilityLabel).toBe('Estimated total, ₹2,145.00');
    await app.tap('invoice-summary-round-up');
    expect(app.valueOf(DISCOUNT)).toBe('100.00');
    expect(form().header.discount).toBe(100);
    expect(app.byTestID('invoice-summary-total').props.accessibilityLabel).toBe('Estimated total, ₹2,145.00');

    // Saving without the reason a staff member must give is refused, and nothing is sent.
    await app.tap('Save invoice');
    expect(app.dialogs().map((dialog) => dialog.props.title)).toEqual(['Enter a discount reason']);
    expect(saves()).toHaveLength(0);
    await app.tapDialog('Close');
    await app.typeKeys(DISCOUNT_REASON, 'Damaged bags');

    // Save: the question names the invoice; its confirm sends exactly one save_invoice.
    await app.tap('Save invoice');
    expect(app.dialog().props.title).toBe('Save invoice 55?');
    await app.tapDialog('Save invoice');

    expect(saves()).toHaveLength(1);
    const { p_invoice_id, p_invoice_data, p_invoice_items } = saves()[0].args;
    expect(p_invoice_id).toBeNull();
    expect(p_invoice_data).toMatchObject({
      inv_no: 55,
      inv_fin_year: 2026,
      gr_id: IDS.grn,
      customer_id: IDS.customer,
      discount: 100,
      discount_reason: 'Damaged bags',
      labour: 650,
      tax_amount: 95,
      total: 2145,
      one_time_charge: false,
    });
    expect(p_invoice_items.map((line: { charge: number; labour_rate: number; tax: number }) => [line.charge, line.labour_rate, line.tax]))
      .toEqual([[8, 3, 5], [5, 3, 5], [4, 1, 0]]);
    // The success dialog shows the number and the total the server stored.
    expect(app.successDialog()).toBeDefined();
    expect(app.texts()).toEqual(expect.arrayContaining(['Invoice saved', 'Invoice 55 has been saved.', '₹2,145.00']));
    expect(showAlert).not.toHaveBeenCalled();

    // "Create another invoice": a new step 1 with a new number, and nothing of the old steps under it.
    await app.tapSuccess('Create another invoice');
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(app.stack()).toEqual(['(tabs)', ['step1']]);
    expect(app.valueOf(NUMBER_FIELD)).toBe('56');
    expect(form().header.gr_id).toBe('');
    expect(form().items).toEqual([]);
    expect(server.callsOf('get_next_invoice_number')).toHaveLength(2);
  });

  it('on iOS the invoice dialog opens only after the question has finished closing', async () => {
    await open();
    await reachReview();
    const platform = Platform.OS;
    Platform.OS = 'ios';
    try {
      await confirmSave();

      expect(saves()).toHaveLength(1);
      // The question is closed but has not said it is done: no invoice dialog yet.
      expect(app.dialogs()).toHaveLength(0);
      expect(app.successDialog()).toBeUndefined();

      await app.dismissDialogs();

      expect(app.successDialog()).toBeDefined();
      expect(app.texts()).toContain('Invoice 55 has been saved.');
    } finally {
      Platform.OS = platform;
    }
  });

  it('a save the server refuses shows the reason after the question has closed, and keeps the form', async () => {
    await open();
    await reachReview();
    server.on('save_invoice', () => ({ data: { success: false, error: 'Invoice number 55 already exists' }, error: null }));

    await confirmSave();

    expect(saves()).toHaveLength(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe("Couldn't save the invoice");
    expect(app.successDialog()).toBeUndefined();
    expect(app.pathname()).toBe('/invoice-form/step3');
    expect(form().items[0].charge).toBe(8);
  });
});
