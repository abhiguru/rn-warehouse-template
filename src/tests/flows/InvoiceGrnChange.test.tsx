/**
 * Choosing another GRN once one is chosen, in a new invoice and in an edit: "Change the GRN?" appears; Cancel keeps
 * everything; "Change GRN" loads the other GRN's lines; a failed load keeps the first GRN, its lines and every typed
 * value and names both GRNs.
 *
 * Owner decision R2-06 (2026-10-18): a confirmed change in an EDIT also clears the discount and its reason (a new
 * invoice already does, P1-9).
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, textOf, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { DISCOUNT, DISCOUNT_REASON, NUMBER_FIELD, cell, openEditFromDetails, openNewInvoice, pickGrn } from '@/tests/helpers/invoiceFlowSteps';

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
  server.addGrn(IDS.grn, 'A0010', flowLines.grnA());
  server.addGrn(IDS.otherGrn, 'A0011', flowLines.grnB());
  // Invoice 42 is for GRN A with a discount of 100 and its reason.
  server.setInvoice(flowLines.grnA(), {
    labour: 450, tax_amount: 70, total: 1620, discount: 100, discount_reason: 'Damaged bags',
  });
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync() });
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const form = () => app.store.getState().invoiceForm;
const previews = () => server.callsOf('generate_invoice_data_for_grn_with_pricing').map((call) => call.args.p_gr_id);
const grnValue = () => textOf(app.byTestID('invoice-grn-value'));
const CHANGE_GRN = /^GRN A00\d\d\. Change GRN$/;

/** A new invoice for GRN A with a charge of 8, a discount of 100 and its reason typed; ends on step 1. */
async function typedNewInvoice() {
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
  await app.tap('Next: items');
  await app.typeKeys(cell(form().items[0].temp_id), '8');
  await app.tap('Next: review');
  await app.typeKeys(DISCOUNT, '100');
  await app.typeKeys(DISCOUNT_REASON, 'Damaged bags');
  await app.tap(/^Step 1 of 3/);
  expect(app.pathname()).toBe('/invoice-form/step1');
}

/** Picks GRN B from the picker; the question "Change the GRN?" is then open. */
async function chooseGrnB() {
  await app.tap(CHANGE_GRN);
  await app.typeKeys('Search GRN number or customer', 'A0011', { stayInField: true });
  await app.settle();
  await app.tap(/^GRN A0011,/);
}

describe('a new invoice', () => {
  it('asks "Change the GRN?" once rates, a discount and a reason were typed, and Cancel keeps everything', async () => {
    await typedNewInvoice();
    expect(previews()).toEqual([IDS.grn]);

    await chooseGrnB();

    expect(app.dialog().props.title).toBe('Change the GRN?');
    expect(app.dialog().props.message).toBe(`${t('invoice.form.changeGrnMessage')} ${t('invoice.form.changeGrnDiscountCleared')}`);
    // Nothing is loaded before the answer.
    expect(previews()).toEqual([IDS.grn]);
    await app.tapDialog('Cancel');

    expect(app.dialogs()).toHaveLength(0);
    expect(previews()).toEqual([IDS.grn]);
    expect(grnValue()).toBe('GRN A0010');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items.map((line) => line.charge)).toEqual([8, 5, 4]);
    expect(form().header.discount).toBe(100);
    expect(form().header.discount_reason).toBe('Damaged bags');
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');
  });

  it('"Change GRN" loads the other GRN\'s lines and clears the rates, the discount and the reason', async () => {
    await typedNewInvoice();
    await chooseGrnB();

    await app.tapDialog('Change GRN');

    expect(previews()).toEqual([IDS.grn, IDS.otherGrn]);
    expect(grnValue()).toBe('GRN A0011');
    expect(form().header.gr_id).toBe(IDS.otherGrn);
    expect(form().items).toHaveLength(1);
    expect(form().items[0]).toMatchObject({ item_name: 'Example Garlic', charge: 10, qty: 20 });
    expect(form().header.discount).toBe(0);
    expect(form().header.discount_reason ?? '').toBe('');
    expect(form().editedItems).toEqual({});
    expect(form().header.total).toBe(269);
    // The number the person was given stays.
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');
    expect(showAlert).not.toHaveBeenCalled();

    // Review shows GRN B's invoice with no discount and no reason.
    await app.tap('Next: items');
    await app.tap('Next: review');
    expect(app.valueOf(DISCOUNT)).toBe('');
    // The reason field is drawn only for a discount.
    expect(app.hasInput(DISCOUNT_REASON)).toBe(false);
    expect(app.byTestID('invoice-summary-total').props.accessibilityLabel).toBe('Estimated total, ₹269.00');
  });

  it('asks nothing when nothing was typed on the first GRN: the other GRN is loaded at once', async () => {
    await openNewInvoice(app);
    await pickGrn(app, 'A0010');

    await chooseGrnB();

    expect(app.dialogs()).toHaveLength(0);
    expect(previews()).toEqual([IDS.grn, IDS.otherGrn]);
    expect(grnValue()).toBe('GRN A0011');
  });

  it('a failed load keeps GRN A, its lines and every typed value, and the alert names both GRNs', async () => {
    await typedNewInvoice();
    server.failGrnLoad(IDS.otherGrn, 'Network request failed');
    await chooseGrnB();

    await app.tapDialog('Change GRN');

    expect(previews()).toEqual([IDS.grn, IDS.otherGrn]);
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, message] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe(t('invoice.form.grnLoadFailedTitle'));
    expect(message).toContain("Couldn't load GRN A0011. The invoice keeps GRN A0010 and its items.");
    expect(grnValue()).toBe('GRN A0010');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items.map((line) => line.charge)).toEqual([8, 5, 4]);
    expect(form().header.discount).toBe(100);
    expect(form().header.discount_reason).toBe('Damaged bags');
    // The picker's spinner is gone and the field can be used again.
    expect(app.canTap(CHANGE_GRN)).toBe(true);
  });
});

describe('an edit', () => {
  it('asks "Change the GRN?" at once (the saved lines are replaced), and Cancel keeps the invoice as loaded', async () => {
    await openEditFromDetails(app);
    expect(form().header.discount).toBe(100);

    await chooseGrnB();

    expect(app.dialog().props.title).toBe('Change the GRN?');
    expect(previews()).toEqual([]);
    await app.tapDialog('Cancel');

    expect(previews()).toEqual([]);
    expect(grnValue()).toBe('GRN A0010');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items).toHaveLength(3);
    expect(form().header.discount).toBe(100);
    expect(form().header.discount_reason).toBe('Damaged bags');
  });

  it('"Change GRN" loads GRN B\'s lines, shows the warning, and keeps the invoice number', async () => {
    await openEditFromDetails(app);
    await chooseGrnB();

    await app.tapDialog('Change GRN');

    expect(previews()).toEqual([IDS.otherGrn]);
    expect(grnValue()).toBe('GRN A0011');
    expect(form().header.gr_id).toBe(IDS.otherGrn);
    expect(form().items).toHaveLength(1);
    expect(form().items[0].item_name).toBe('Example Garlic');
    expect(form().header.inv_no).toBe(42);
    expect(app.texts()).toContain('GRN changed. The items now come from the new GRN.');
  });

  // Owner decision R2-06 (2026-10-18), fixed in F2: a confirmed GRN change in an edit clears the discount and its
  // reason, as in a new invoice.
  it('"Change GRN" clears the discount and its reason (owner decision R2-06)', async () => {
    await openEditFromDetails(app);
    await chooseGrnB();

    await app.tapDialog('Change GRN');

    expect(form().header.gr_id).toBe(IDS.otherGrn);
    expect(form().header.discount).toBe(0);
    expect(form().header.discount_reason ?? '').toBe('');
    expect(form().header.total).toBe(269);
  });

  it('a failed load keeps GRN A, its lines and the discount, and the alert names both GRNs', async () => {
    await openEditFromDetails(app);
    server.failGrnLoad(IDS.otherGrn, 'Network request failed');
    await chooseGrnB();

    await app.tapDialog('Change GRN');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toContain("Couldn't load GRN A0011. The invoice keeps GRN A0010 and its items.");
    expect(grnValue()).toBe('GRN A0010');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items).toHaveLength(3);
    expect(form().header.discount).toBe(100);
    expect(form().header.discount_reason).toBe('Damaged bags');
    expect(app.texts()).not.toContain('GRN changed. The items now come from the new GRN.');
  });

  it('choosing the invoice\'s own GRN from the picker asks nothing and changes nothing', async () => {
    await openEditFromDetails(app);
    await app.tap(CHANGE_GRN);

    await app.tap('grn-picker-current');

    expect(app.dialogs()).toHaveLength(0);
    expect(previews()).toEqual([]);
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().header.discount).toBe(100);
  });
});
