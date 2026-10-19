/**
 * The invoice steps at a large text size, on the real screens at 411 dp: at a font scale of 1.0 the lines of the items
 * step are a table, from 1.3 they are cards; the Review ITEMS table keeps its Item | Qty | Amount columns at 1.3 (the
 * Qty goes under the item from 1.5); and the GRN number on step 1 wraps instead of being cut.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, textOf, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { cell, groupField, openNewInvoice, pickGrn, reviewRow } from '@/tests/helpers/invoiceFlowSteps';

// A flow walks several screens; on a busy machine it needs more than the default 5 seconds.
jest.setTimeout(30000);

(jest.requireMock('react-native-reanimated') as { useReducedMotion?: () => boolean }).useReducedMotion = () => false;

let mockFontScale = 1;
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
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: mockFontScale }),
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
  server.addGrn(IDS.grn, 'A0010', flowLines.grnA());
});

afterEach(async () => {
  await app.unmount();
  mockFontScale = 1;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const form = () => app.store.getState().invoiceForm;
const start = async (fontScale: number) => {
  mockFontScale = fontScale;
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync() });
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
};
const lineRows = () => app.testIDs(/^line-/).length;
const lineCards = () => app.testIDs(/^card-/).length;

describe('step 2, Items', () => {
  it('draws a table at font scale 1.0', async () => {
    await start(1);
    await app.tap('Next: items');

    expect(lineRows()).toBe(3);
    expect(lineCards()).toBe(0);
    expect(app.testIDs(/^cols-/)).toEqual(['cols-i1:::M1', 'cols-i2:::M2']); // the column headings of the tables
  });

  it('draws one card per line at font scale 1.3, and typing in a card changes the amounts', async () => {
    await start(1.3);
    await app.tap('Next: items');

    expect(lineRows()).toBe(0);
    expect(lineCards()).toBe(3);
    expect(app.testIDs(/^cols-/)).toEqual([]);
    const charge = cell(form().items[0].temp_id);
    expect(app.valueOf(charge)).toBe('5.00');

    await app.typeKeys(charge, '8');

    expect(form().items[0].charge).toBe(8);
    expect(form().items[0].item_total).toBe(1050); // 100 x 8 + 200 labour = 1,000, 5 % tax
    expect(app.texts()).toContain('₹1,050.00');
    // The shared fields of the group are still there for all lines.
    expect(app.hasInput(groupField('i1:::M1', 'labour_rate'))).toBe(true);
  });
});

describe('step 3, Review', () => {
  it('keeps the Item | Qty | Amount columns at font scale 1.3', async () => {
    await start(1.3);
    await app.tap('Next: items');
    await app.tap('Next: review');

    const body = app.byTestID('invoice-review-items-table');
    const headings = body.findAll((node) => (node.type as unknown) === 'Text').map((node) => textOf(node));
    expect(headings).toEqual(expect.arrayContaining(['Item', 'Qty', 'Amount']));
    const row = textOf(app.byTestID(reviewRow('i1:::M1')));
    expect(row).toContain('200');
    expect(row).not.toContain('bags'); // the Qty has its own column, not a line under the item
  });

  it('at font scale 1.0 has the same columns', async () => {
    await start(1);
    await app.tap('Next: items');
    await app.tap('Next: review');

    const headings = app.byTestID('invoice-review-items-table').findAll((node) => (node.type as unknown) === 'Text').map((node) => textOf(node));
    expect(headings).toEqual(expect.arrayContaining(['Item', 'Qty', 'Amount']));
  });

  it('puts the Qty under the item from font scale 1.5', async () => {
    await start(1.5);
    await app.tap('Next: items');
    await app.tap('Next: review');

    const headings = app.byTestID('invoice-review-items-table').findAll((node) => (node.type as unknown) === 'Text').map((node) => textOf(node));
    expect(headings).not.toContain('Qty');
    expect(textOf(app.byTestID(reviewRow('i1:::M1')))).toContain('200 bags');
  });
});

describe('step 1, Details', () => {
  it('draws the GRN number on as many lines as it needs, never cut and never shrunk', async () => {
    server.addGrn(IDS.otherGrn, 'WMWM88840001-STRETCH-TEST-LOT', flowLines.grnB());
    await start(1.3);
    await app.tap(/^GRN A0010\. Change GRN$/);
    await app.typeKeys('Search GRN number or customer', 'STRETCH', { stayInField: true });
    await app.settle();
    await app.tap(/^GRN WMWM88840001-STRETCH-TEST-LOT,/);

    const value = app.byTestID('invoice-grn-value');
    expect(textOf(value)).toBe('GRN WMWM88840001-STRETCH-TEST-LOT');
    expect(value.props.numberOfLines).toBeUndefined();
    expect(value.props.adjustsFontSizeToFit).toBeFalsy();
    expect(value.props.ellipsizeMode).toBeUndefined();
  });
});
