/**
 * Going back and moving between the steps, on the real stack: the phone's Back key on steps 3, 2 and 1 and the
 * "Discard" question on step 1 (a new invoice) or "Discard changes" (an edit, only when something changed); Next
 * checking step 1 again after Back; and the step circles and the Review pencils, which keep every typed value.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, textOf, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { DISCOUNT, DISCOUNT_REASON, NUMBER_FIELD, cell, groupField, openEditFromDetails, openNewInvoice, pickGrn } from '@/tests/helpers/invoiceFlowSteps';

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
// Kept as a host element so that the test can open it and confirm a date.
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: 'DatePickerModal' }));
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
  server.setInvoice(flowLines.grnA(), { labour: 450, tax_amount: 70, total: 1720 });
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const form = () => app.store.getState().invoiceForm;
const alertButtons = () => jest.mocked(showAlert).mock.calls.at(-1)![2]!;
const answerAlert = async (text: string) => {
  const button = alertButtons().find((candidate) => candidate.text === text);
  if (!button) throw new Error(`No alert button "${text}"`);
  const { act } = require('react-test-renderer');
  await act(async () => { button.onPress?.(); });
  await app.settle();
};

/** A new invoice on Review, with a charge, a labour rate, a discount and its reason typed. */
async function typedNewInvoice() {
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
  await app.tap('Next: items');
  await app.typeKeys(cell(form().items[0].temp_id), '8');
  await app.typeKeys(groupField('i1:::M1', 'labour_rate'), '3');
  await app.tap('Next: review');
  await app.typeKeys(DISCOUNT, '100.60');
  await app.typeKeys(DISCOUNT_REASON, 'Damaged bags');
}

describe('the Back key in a new invoice', () => {
  it('goes from step 3 to 2 to 1 with the typed values kept, then asks "Discard this invoice?" and Keep editing stays', async () => {
    await typedNewInvoice();
    expect(app.pathname()).toBe('/invoice-form/step3');

    expect(await app.pressBackKey()).toBe(true);
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(app.stack()).toEqual(['(tabs)', ['step1', 'step2']]);
    expect(form().currentStep).toBe(2);
    expect(app.valueOf(cell(form().items[0].temp_id))).toBe('8.00');

    expect(await app.pressBackKey()).toBe(true);
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(app.stack()).toEqual(['(tabs)', ['step1']]);
    expect(form().currentStep).toBe(1);
    expect(showAlert).not.toHaveBeenCalled();

    // Step 1 with a GRN chosen: Back asks first.
    expect(await app.pressBackKey()).toBe(true);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0].slice(0, 2)).toEqual([
      'Discard this invoice?',
      'The details you entered for this invoice will be lost.',
    ]);
    expect(alertButtons().map((button) => button.text)).toEqual(['Keep editing', 'Discard']);
    await answerAlert('Keep editing');
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items[0].charge).toBe(8);
    expect(form().header.discount).toBe(100.6);
  });

  it('"Discard" leaves for the Invoices tab and throws the form away', async () => {
    await typedNewInvoice();
    await app.pressBackKey();
    await app.pressBackKey();
    await app.pressBackKey();

    await answerAlert('Discard');

    expect(app.pathname()).toBe('/invoices');
    expect(app.stack()).toEqual(['(tabs)']);
    expect(form().header.gr_id).toBe('');
    expect(form().items).toEqual([]);
    expect(server.callsOf('save_invoice')).toHaveLength(0);
  });

  it('leaves step 1 at once when nothing was entered', async () => {
    await openNewInvoice(app);
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');

    expect(await app.pressBackKey()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(app.pathname()).toBe('/invoices');
    expect(form().header.gr_id).toBe('');
  });

  // Found by this flow and fixed in F2: the no-data Back on step 1 leaves with `dismissTo`, so the stack is the one
  // '(tabs)' (it used to replace the form with a second '(tabs)').
  it('leaves the stack as the one Invoices tab when nothing was entered', async () => {
    await openNewInvoice(app);

    await app.pressBackKey();

    expect(app.stack()).toEqual(['(tabs)']);
  });
});

describe('Next on step 1 after Back', () => {
  it('checks step 1 again in a new invoice: a date in the future shows its error, and a valid date goes on', async () => {
    await openNewInvoice(app);
    await pickGrn(app, 'A0010');
    await app.tap('Next: items');
    await app.pressBackKey();
    expect(app.pathname()).toBe('/invoice-form/step1');

    // 15 March 2027 is in the same financial year (2026-27) and after today.
    await app.chooseDate(new Date(2027, 2, 15));
    expect(form().header.inv_date).toBe('2027-03-15');
    await app.tap('Next: items');

    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining('Cannot select a future date'));
    expect(form().validationErrors.inv_date).toBe('Cannot select a future date');
    expect(app.texts()).toContain('Cannot select a future date');
    expect(app.stack()).toEqual(['(tabs)', ['step1']]);

    await app.chooseDate(new Date(2026, 9, 5));
    expect(app.texts()).not.toContain('Cannot select a future date');
    await app.tap('Next: items');

    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(form().header.inv_date).toBe('2026-10-05');
  });

  it('asks for the number again in a new invoice when the field was emptied, and does not go on until it is there', async () => {
    await openNewInvoice(app);
    await pickGrn(app, 'A0010');
    await app.tap('Next: items');
    await app.pressBackKey();
    await app.changeText(NUMBER_FIELD, '');
    expect(app.valueOf(NUMBER_FIELD)).toBe('');

    await app.tap('Next: items');

    // The suggestion came back (the next one after 55 was used for the first ask) and the form stays on step 1.
    expect(app.valueOf(NUMBER_FIELD)).toBe('56');
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(server.callsOf('get_next_invoice_number')).toHaveLength(2);
    expect(showAlert).not.toHaveBeenCalled();

    await app.tap('Next: items');
    expect(app.pathname()).toBe('/invoice-form/step2');
  });

  it('checks the number again in an edit: an emptied number is refused with its message', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    await app.pressBackKey();
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    await app.changeText(NUMBER_FIELD, '');

    await app.tap('Next: items');

    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Check the invoice');
    expect(Object.keys(form().validationErrors)).toContain('inv_no');
    expect(app.texts()).toContain(form().validationErrors.inv_no);

    await app.changeText(NUMBER_FIELD, '43');
    await app.tap('Next: items');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step2');
    expect(form().header.inv_no).toBe(43);
  });
});

describe('the Back key in an edit', () => {
  it('goes from step 3 to 2 to 1 and leaves for the invoice\'s page at once when nothing was changed', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step3');

    expect(await app.pressBackKey()).toBe(true);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step2');
    expect(await app.pressBackKey()).toBe(true);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(showAlert).not.toHaveBeenCalled();

    expect(await app.pressBackKey()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(app.pathname()).toBe('/invoice-details/inv-42');
    expect(app.stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
  });

  it('asks "Discard changes to this invoice?" when a charge was changed: Keep editing stays with the change, Discard leaves', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    await app.typeKeys(cell(form().items[1].temp_id), '6');
    await app.pressBackKey();
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(showAlert).not.toHaveBeenCalled();

    expect(await app.pressBackKey()).toBe(true);

    expect(jest.mocked(showAlert).mock.calls[0].slice(0, 2)).toEqual([
      'Discard changes to this invoice?',
      'Your changes to this invoice will be lost.',
    ]);
    expect(alertButtons().map((button) => button.text)).toEqual(['Keep editing', 'Discard']);
    await answerAlert('Keep editing');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(form().items[1].charge).toBe(6);

    await app.pressBackKey();
    await answerAlert('Discard');
    expect(app.pathname()).toBe('/invoice-details/inv-42');
    expect(app.stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
    expect(form().invoice_id).toBeNull();
    expect(server.callsOf('update_invoice')).toHaveLength(0);
  });
});

describe('the step circles and the Review pencils', () => {
  it('go to the right step in a new invoice and keep every typed value', async () => {
    await typedNewInvoice();

    // The pencil of INVOICE DETAILS: step 1, with the number, the GRN and the customer as they were.
    await app.tap('Edit invoice details');
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(form().currentStep).toBe(1);
    expect(app.valueOf(NUMBER_FIELD)).toBe('55');
    expect(textOf(app.byTestID('invoice-grn-value'))).toBe('GRN A0010');

    // The circle of step 3 checks steps 1 and 2 and lands on Review with the discount and the reason as typed.
    await app.tap(/^Step 3 of 3/);
    expect(app.pathname()).toBe('/invoice-form/step3');
    expect(form().header.discount).toBe(100.6);
    expect(app.valueOf(DISCOUNT)).toBe('100.60');
    expect(app.valueOf(DISCOUNT_REASON)).toBe('Damaged bags');

    // The pencil of ITEMS: step 2, with the typed charge and labour.
    await app.tap('Edit items');
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(form().currentStep).toBe(2);
    expect(app.valueOf(cell(form().items[0].temp_id))).toBe('8.00');
    expect(app.valueOf(groupField('i1:::M1', 'labour_rate'))).toBe('3.00');

    // The circle of step 1 goes back to it.
    await app.tap(/^Step 1 of 3/);
    expect(app.pathname()).toBe('/invoice-form/step1');
    expect(form().header.gr_id).toBe(IDS.grn);
    expect(form().items.map((line) => line.charge)).toEqual([8, 5, 4]);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('go to the right step in an edit and keep the changes', async () => {
    await openEditFromDetails(app);
    await app.tap('Next: items');
    await app.typeKeys(cell(form().items[1].temp_id), '6');
    await app.tap('Next: review');

    await app.tap('Edit items');
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step2');
    expect(app.valueOf(cell(form().items[1].temp_id))).toBe('6.00');

    await app.tap(/^Step 1 of 3/);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(app.valueOf(NUMBER_FIELD)).toBe('42');

    await app.tap(/^Step 3 of 3/);
    expect(app.pathname()).toBe('/invoice-edit/inv-42/step3');
    expect(form().items[1].charge).toBe(6);
    // The ITEMS footer shows bags only since F2 (R3b-08: one money total, in CHARGES).
    expect(app.byTestID('invoice-review-items-total').props.accessibilityLabel).not.toContain('₹');
  });
});
