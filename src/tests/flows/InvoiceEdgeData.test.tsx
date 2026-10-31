/**
 * The data shapes of the Dev facility's edge-case GRNs (WMIV0101-0106, see edgeLines in invoiceFixtures), walked through
 * steps 2 and 3 of a new invoice on the real screens: a group of 125 lines, 12 groups with two lots of one mark merged,
 * a one-time GRN, an amount near the design edge, a same-day dispatch, a bag with no weight and no mark, and a line
 * with a duration of 0.
 *
 * "No cut figure" is checked on the text (the whole amount is drawn as one string); the layout itself is for the phone.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, textOf, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, edgeLines } from '@/tests/helpers/invoiceFixtures';
import { cell, groupField, openNewInvoice, pickGrn, reviewRow } from '@/tests/helpers/invoiceFlowSteps';
import type { InvoiceItemData } from '@/types/invoice.types';

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

beforeEach(() => {
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

const form = () => app.store.getState().invoiceForm;
const footer = () => app.byTestID('invoice-review-items-total').props.accessibilityLabel as string;
const estimatedTotal = () => app.byTestID('invoice-summary-total').props.accessibilityLabel as string;

/** A new invoice for a GRN with these lines, on step 2. */
async function openOnItems(lines: InvoiceItemData[]) {
  server.addGrn(IDS.grn, 'A0010', lines);
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
  await app.tap('Next: items');
  expect(app.pathname()).toBe('/invoice-form/step2');
}
const toReview = async () => {
  await app.tap('Next: review');
  expect(app.pathname()).toBe('/invoice-form/step3');
};

describe('WMIV0101: a group of 125 lines and a group of 3', () => {
  it('step 2 has both groups with all 128 lines and the group totals; step 3 has 2 rows and the same total', async () => {
    await openOnItems(edgeLines.bulk125());

    expect(form().items).toHaveLength(128);
    expect(app.testIDs(/^items-head-(?!total-)/)).toEqual(['items-head-rai:::BULK-125', 'items-head-onion:::BQ-9']);
    expect(app.testIDs(/^line-/)).toHaveLength(128);
    expect(app.testIDs(/^cell\|.*\|charge$/)).toHaveLength(128);
    // 125 lines of 12 bags at 3.50 + 1.00 labour + 5 % tax = 56.70 each; 3 onion lines of 52.50.
    expect(app.texts()).toEqual(expect.arrayContaining(['₹7,087.50', '₹157.50']));
    expect(form().header.total).toBe(7245);

    await toReview();
    expect(app.texts()).toContain('ITEMS (2)');
    expect(app.testIDs(/^invoice-review-group-/)).toEqual([reviewRow('rai:::BULK-125'), reviewRow('onion:::BQ-9')]);
    expect(textOf(app.byTestID(reviewRow('rai:::BULK-125')))).toContain('1,500');
    expect(textOf(app.byTestID(reviewRow('rai:::BULK-125')))).toContain('₹7,087.50');
    expect(footer()).toBe('Total: 2 items, 128 dispatch lines, 1,530 bags');
    expect(estimatedTotal()).toBe('Estimated total, ₹7,245.00');
    expect(app.texts()).toEqual(expect.arrayContaining(['₹5,370.00', '₹1,530.00', '₹345.00']));
  });

  it('a charge for the group sets all 125 lines; the amounts follow into Review and into the one save', async () => {
    await openOnItems(edgeLines.bulk125());

    await app.typeKeys(groupField('rai:::BULK-125', 'charge'), '4');

    // 12 x 4 = 48 + 12 labour = 60, tax 3.00: 63.00 a line, 7,875.00; with the onions 8,032.50 (tax 375 + 7.50 = 382.50, 383).
    expect(form().items.slice(0, 125).every((line) => line.charge === 4)).toBe(true);
    expect(form().items.slice(125).map((line) => line.charge)).toEqual([4, 4, 4]);
    expect(form().header.total).toBe(8033);
    await toReview();
    expect(footer()).toBe('Total: 2 items, 128 dispatch lines, 1,530 bags');

    await app.tap('Save invoice');
    await app.tapDialog('Save invoice');
    expect(server.callsOf('save_invoice')).toHaveLength(1);
    const { p_invoice_data, p_invoice_items } = server.callsOf('save_invoice')[0].args;
    expect(p_invoice_items).toHaveLength(128);
    expect(new Set(p_invoice_items.map((line: { disp_trl_id: string }) => line.disp_trl_id)).size).toBe(128);
    expect(p_invoice_data).toMatchObject({ total: 8033, labour: 1530, tax_amount: 383 });
  });
});

describe('WMIV0102: 12 groups, two lots of one mark', () => {
  it('shows 12 groups on step 2 and 12 rows on Review, with the two lots of SAME-MARK as one row, and saves every line', async () => {
    const lines = edgeLines.manyGroups();
    await openOnItems(lines);

    expect(lines).toHaveLength(38);
    expect(app.testIDs(/^items-head-(?!total-)/)).toHaveLength(12);
    expect(app.testIDs(/^line-/)).toHaveLength(38);
    // Each card has its toggle; SAME-MARK: 4 lines of the first lot and 2 of the second, one group of 6 lines.
    expect(app.testIDs(/^group-toggle-/)).toHaveLength(12);
    expect(app.texts()).toContain('Hide dispatch details');
    expect(form().items.filter((line) => line.package_mark === 'SAME-MARK' && line.item_id === 'rai')).toHaveLength(6);
    expect(form().header.total).toBe(27930);

    await toReview();
    expect(app.texts()).toContain('ITEMS (12)');
    expect(app.testIDs(/^invoice-review-group-/)).toHaveLength(12);
    const merged = textOf(app.byTestID(reviewRow('rai:::SAME-MARK')));
    expect(merged).toContain('600');
    expect(merged).toContain('₹4,410.00');
    expect(footer()).toBe('Total: 12 items, 38 dispatch lines, 3,800 bags');
    expect(estimatedTotal()).toBe('Estimated total, ₹27,930.00');

    await app.tap('Save invoice');
    await app.tapDialog('Save invoice');
    const sent = server.callsOf('save_invoice')[0].args.p_invoice_items as Array<{ grn_item_id: string }>;
    expect(sent).toHaveLength(38);
    expect(sent.filter((line) => line.grn_item_id === 'second-lot')).toHaveLength(2);
  });
});

describe('WMIV0103: a one-time GRN', () => {
  it('has no Labour row, "One-time" in place of a duration, and "Yes" for the one-time charge on Review', async () => {
    await openOnItems(edgeLines.oneTime());

    expect(form().header.one_time_charge).toBe(true);
    expect(app.hasInput(groupField('kashmiri:::OT-1', 'labour_rate'))).toBe(false);
    expect(app.hasInput(groupField('kashmiri:::OT-1', 'charge'))).toBe(true);
    expect(app.hasInput(groupField('kashmiri:::OT-1', 'tax'))).toBe(true);
    expect(app.texts()).not.toContain('Labour (₹) (all lines)');
    // The Date column and the Months column, which says One-time.
    expect(app.texts()).toEqual(expect.arrayContaining(['01/10/26', 'One-time']));
    expect(form().items.every((line) => !/month|day/.test(textOf(app.byTestID(`line-${line.temp_id}`))))).toBe(true);
    // 20 bags at 40 + 5 % tax = 840 a line; 30 bags at 6.50 + 5 % = 204.75.
    expect(app.texts()).toEqual(expect.arrayContaining(['₹840.00', '₹204.75', '₹1,680.00', '₹409.50']));

    await toReview();
    expect(app.byTestID('invoice-review-body-details').findAll((node) => (node.type as unknown) === 'Text').map((node) => textOf(node)))
      .toEqual(expect.arrayContaining(['One-time charge', 'Yes']));
    expect(footer()).toBe('Total: 2 items, 4 dispatch lines, 100 bags');
    // Storage 1,990.00, labour 0, tax 99.50 rounded up to 100, total rounded up to the rupee.
    expect(app.texts()).toEqual(expect.arrayContaining(['₹1,990.00', '₹0.00', '₹100.00']));
    expect(estimatedTotal()).toBe('Estimated total, ₹2,090.00');

    await app.tap('Save invoice');
    await app.tapDialog('Save invoice');
    expect(server.callsOf('save_invoice')[0].args.p_invoice_data).toMatchObject({ one_time_charge: true, labour: 0, total: 2090 });
  });
});

describe('WMIV0104: an amount near the design edge', () => {
  it('draws ₹96,934.70 whole on step 2 and on Review, with the stored-rule total of ₹96,936.00', async () => {
    await openOnItems(edgeLines.nearEdge());

    // 263 bags x (99.95 x 3 months + 12.50 labour) + 18 % tax.
    const texts = app.texts();
    expect(texts.filter((text) => text === '₹96,934.70').length).toBeGreaterThanOrEqual(2); // head (the card's total) and the line
    expect(texts.some((text) => /…/.test(text))).toBe(false);
    expect(texts).toEqual(expect.arrayContaining(['01/10/26', '3', '90']));

    await toReview();
    expect(textOf(app.byTestID(reviewRow('kashmiri:::HIGH-1')))).toContain('₹96,934.70');
    expect(footer()).toBe('Total: 1 item, 1 dispatch line, 263 bags');
    // The tax of 14,786.65 is rounded up to 14,787 and the total to the rupee: the same rule as the server's.
    expect(app.texts()).toEqual(expect.arrayContaining(['₹78,860.55', '₹3,287.50', '₹14,787.00', '₹0.95']));
    expect(estimatedTotal()).toBe('Estimated total, ₹96,936.00');
    expect(app.texts().filter((text) => /…/.test(text))).toEqual([]);
  });

  // R3a-1 (fixed in F3): the layout is held while a field has focus, so typing a charge that takes a line past
  // ₹93 lakh no longer switches the lines from a table to cards under the cell being typed in.
  it('keeps the field being typed in, showing the typed text, as the amount grows', async () => {
    await openOnItems(edgeLines.nearEdge());
    const charge = cell(form().items[0].temp_id);

    await app.focus(charge);
    for (const typed of ['9', '99', '999', '9999']) {
      await app.changeText(charge, typed);
      expect(app.valueOf(charge)).toBe(typed);
    }
  });
});

describe('WMIV0105: a dispatch on the GRN\'s own day', () => {
  it('is 1 month and 1 day, and goes through to Review', async () => {
    await openOnItems(edgeLines.sameDay());

    expect(textOf(app.byTestID(`line-${form().items[0].temp_id}`))).toContain('01/10/26');
    expect(app.texts()).toEqual(expect.arrayContaining(['01/10/26', '1']));
    await toReview();
    expect(footer()).toBe('Total: 1 item, 1 dispatch line, 10 bags');
    expect(estimatedTotal()).toBe('Estimated total, ₹50.00');
  });
});

describe('WMIV0106: 1 bag with no weight and no mark', () => {
  it('shows no mark chip and no "0 kg" on step 2 or on Review', async () => {
    await openOnItems(edgeLines.smallest());

    expect(app.testIDs(/^items-head-(?!total-)/)).toEqual(['items-head-garlic:::']);
    const head = textOf(app.byTestID('items-head-garlic:::'));
    expect(head).toContain('Garlic');
    expect(head).not.toMatch(/kg/);
    expect(app.texts().some((text) => /kg each/.test(text))).toBe(false);
    expect(app.texts()).toEqual(expect.arrayContaining(['₹10.50', '01/10/26', '1', '30']));

    await toReview();
    const row = textOf(app.byTestID(reviewRow('garlic:::')));
    expect(row).toContain('Garlic');
    expect(row).toContain('₹10.50');
    expect(row).not.toMatch(/kg/);
    expect(footer()).toBe('Total: 1 item, 1 dispatch line, 1 bag');
    expect(estimatedTotal()).toBe('Estimated total, ₹11.00');
  });
});

describe('a line with a duration of 0', () => {
  // The server never answers a duration of 0 (the service reads `duration || 1`) and no field edits it, so the
  // duration is set in the store, as a stale or damaged form would hold it.
  const setDuration = async (index: number, duration: number) => {
    const { act } = require('react-test-renderer');
    await act(async () => {
      app.store.dispatch(updateEditedItem({ temp_id: form().items[index].temp_id, values: { duration } }));
    });
  };

  it('blocks Next with "1 item has a duration of 0…", and goes on once it is fixed', async () => {
    await openOnItems(edgeLines.manyGroups().slice(0, 6));
    await setDuration(0, 0);

    await app.tap('Next: review');

    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(app.dialog().props.title).toBe(t('invoice.items.checkPricesTitle'));
    expect(app.dialog().props.message).toBe('1 item has a duration of 0. The duration must be greater than 0.');
    await app.tapDialog('Close');

    await setDuration(1, 0);
    await app.tap('Next: review');
    expect(app.dialog().props.message).toBe('2 items have a duration of 0. The duration must be greater than 0.');
    await app.tapDialog('Close');

    // The step circle of Review is blocked the same way.
    await app.tap(/^Step 3 of 3/);
    expect(app.pathname()).toBe('/invoice-form/step2');
    expect(app.dialogs()).toHaveLength(1);
    await app.tapDialog('Close');

    await setDuration(0, 1);
    await setDuration(1, 1);
    await app.tap('Next: review');
    expect(app.pathname()).toBe('/invoice-form/step3');
  });
});
