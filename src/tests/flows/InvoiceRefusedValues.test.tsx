/**
 * Values the form refuses, typed key by key on the real screens: a charge over 999999, a tax over 100 and a discount
 * larger than the invoice. A valid prefix ("1", "10" ... "100000") is a number in range and is applied while it is
 * typed; the key that makes the text refused puts back what the field held when it gained focus, so a refused or
 * unfinished text never stays in a total (phone findings P1-2 and P1-5). The error shows when the field is left,
 * Next and Save are blocked while it stands, and correcting the text lets them go on.
 *
 * The GRN here has lines of 1 bag, so that the amounts of the valid prefixes stay narrow; the layout of the items step
 * follows the width of the figures (see InvoiceEdgeData for what a wide figure does).
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { DISCOUNT, DISCOUNT_REASON, cell, groupField, openNewInvoice, pickGrn } from '@/tests/helpers/invoiceFlowSteps';

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

/** Two potato lines of 1 bag (mark M1) and one onion line of 1 bag (mark M2): charge 5, labour 2, tax 5 % (7.35 each). */
const smallLines = () => [
  invoiceLine({ item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 1 }, 0),
  invoiceLine({ item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 1 }, 1),
  invoiceLine({ item_id: 'i2', item_name: 'Example Onions', package_mark: 'M2', qty: 1, tax: 0 }, 2),
];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  newFlowStore();
  server = makeFlowServer();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
  server.addGrn(IDS.grn, 'A0010', smallLines());
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const form = () => app.store.getState().invoiceForm;
const CHARGE_ERROR = 'Enter a charge from 0 to 9999.99.';
const TAX_ERROR = 'Enter a tax from 0 to 100.';

/** Types the text one key at a time in the field, staying in it; returns the form's charge-or-value after each key. */
async function keyByKey(id: string, text: string, read: () => number): Promise<number[]> {
  await app.focus(id);
  const seen: number[] = [];
  for (let n = 1; n <= text.length; n += 1) {
    await app.changeText(id, text.slice(0, n));
    seen.push(read());
  }
  return seen;
}

describe('step 2', () => {
  it('"1000000" in a Charge and "101" in a Tax never leave a refused value in a total; Next is blocked until both are corrected', async () => {
    await app.tap('Next: items');
    const charge = cell(form().items[0].temp_id);
    const tax = groupField('i2:::M2', 'tax');
    const startTotal = form().header.total;
    expect(startTotal).toBe(22);
    expect(form().items[0].charge).toBe(5);

    // Charge: the valid prefixes are applied as they come; a line's charge is limited to 9999.99 on entry, so the fifth key
    // (10000) is refused, the 5 returns, and the keys after it stay refused.
    const charges = await keyByKey(charge, '1000000', () => form().items[0].charge);
    expect(charges).toEqual([1, 10, 100, 1000, 5, 5, 5]);
    expect(form().header.total).toBe(startTotal);
    expect(app.valueOf(charge)).toBe('1000000');

    // Tax: "1" and "10" are applied, "101" is refused and the 0 returns.
    const taxes = await keyByKey(tax, '101', () => form().items[2].tax);
    expect(taxes).toEqual([1, 10, 0]);
    expect(form().header.total).toBe(startTotal);

    // The errors show when the fields are left, and the text stays in the fields.
    await app.blur(charge);
    await app.blur(tax);
    expect(app.texts()).toEqual(expect.arrayContaining([CHARGE_ERROR, TAX_ERROR]));
    expect(app.valueOf(charge)).toBe('1000000');
    expect(app.valueOf(tax)).toBe('101');
    expect(form().header.total).toBe(startTotal);

    // Next is blocked: still step 2, no alert, nothing saved.
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(showAlert).not.toHaveBeenCalled();

    // The charge corrected: its error goes, and Next is still blocked by the tax.
    await app.typeKeys(charge, '12');
    expect(app.texts()).not.toContain(CHARGE_ERROR);
    expect(form().items[0].charge).toBe(12);
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(app.texts()).toContain(TAX_ERROR);

    // The tax corrected: Next goes on with both values.
    await app.typeKeys(tax, '12');
    expect(app.texts()).not.toContain(TAX_ERROR);
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step3');
    expect(form().items.map((line) => [line.charge, line.tax])).toEqual([[12, 5], [5, 5], [5, 12]]);
  });

  it('a minus sign and a third decimal are refused too, and put the value back', async () => {
    await app.tap('Next: items');
    const charge = cell(form().items[0].temp_id);

    await app.focus(charge);
    await app.changeText(charge, '7');
    expect(form().items[0].charge).toBe(7);
    await app.changeText(charge, '-5');
    expect(form().items[0].charge).toBe(5);
    await app.changeText(charge, '7.125');
    expect(form().items[0].charge).toBe(5);
    await app.blur(charge);

    expect(app.texts()).toContain(t('invoice.validation.rateNotNumber'));
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step2');
  });
});

describe('step 3', () => {
  it('"99999999" in the Discount never leaves a refused value in the total, and Save is blocked while it stands', async () => {
    await app.tap('Next: items');
    await app.tap('Next: review');
    const startTotal = form().header.total;
    expect(startTotal).toBe(22);

    // The invoice is 22 before the discount: "9" is a valid discount, "99" is not.
    await app.focus(DISCOUNT);
    const discounts: number[] = [];
    for (let n = 1; n <= 8; n += 1) {
      await app.changeText(DISCOUNT, '99999999'.slice(0, n));
      discounts.push(form().header.discount);
    }
    expect(discounts).toEqual([9, 0, 0, 0, 0, 0, 0, 0]);
    expect(form().header.total).toBe(startTotal);
    expect(app.texts().some((text) => /^The discount can't be more than ₹/.test(text))).toBe(true);
    expect(app.valueOf(DISCOUNT)).toBe('99999999');

    // Save, with the refused text still in the field, says so and sends nothing.
    await app.tap('Save invoice');
    expect(app.dialogs().map((dialog) => dialog.props.title)).toEqual([t('invoice.review.discountCheckTitle')]);
    expect(app.dialog().props.message).toContain("The discount can't be more than ₹");
    expect(server.callsOf('save_invoice')).toHaveLength(0);
    await app.tapDialog('Close');
    expect(app.dialogs()).toHaveLength(0);

    // Leaving the field keeps the refused text and its message (the invoice keeps its discount); Save stays refused.
    await app.blur(DISCOUNT);
    expect(app.valueOf(DISCOUNT)).toBe('99999999');
    expect(app.texts().some((text) => /^The discount can't be more than ₹/.test(text))).toBe(true);
    expect(form().header.discount).toBe(0);
    // A valid discount and its reason let Save go on.
    await app.typeKeys(DISCOUNT, '5');
    expect(form().header.discount).toBe(5);
    await app.typeKeys(DISCOUNT_REASON, 'Damaged bags');
    await app.tap('Save invoice');
    expect(app.dialog().props.title).toBe('Save invoice 55?');
    await app.tapDialog('Save invoice');

    expect(server.callsOf('save_invoice')).toHaveLength(1);
    expect(server.callsOf('save_invoice')[0].args.p_invoice_data).toMatchObject({ discount: 5, discount_reason: 'Damaged bags' });
  });
});
