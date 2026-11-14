/**
 * WH-205 (contract product/tech/bills-need-gst-details.md, section 3, "Save refusal"): the server refuses a new bill with
 * GST_DETAILS_REQUIRED (the details were cleared while the form was open). The real form, hook and service run; only the
 * facility's `rpc` answers. The person sees the alert of their role, nothing is saved, and the form keeps what was typed.
 */
import 'expo-router/build/testing-library/mocks';
import { act } from 'react-test-renderer';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { openNewInvoice, pickGrn } from '@/tests/helpers/invoiceFlowSteps';

jest.setTimeout(30000);

(jest.requireMock('react-native-reanimated') as { useReducedMotion?: () => boolean }).useReducedMotion = () => false;

let mockRole = 'staff';
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks());
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
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

const ADMIN_ALERT = "Save your GST details first. Bills can't be made until then.";
const STAFF_ALERT = "Ask an administrator to save the GST details. Bills can't be made until then.";
const SERVER_ENGLISH = "Save the GST details first (Settings, Warehouse tools, GST details). Bills can't be made until then.";

// The shape the server answers (contract D3): HTTP 200, success false, WH409, the reason, an English sentence.
const refusal = () => ({
  data: { success: false, error_code: 'WH409', reason: 'GST_DETAILS_REQUIRED', error: SERVER_ENGLISH, message: SERVER_ENGLISH, function_version: 1 },
  error: null,
});

const open = async (role: string) => {
  mockRole = role;
  newFlowStore(role);
  server = makeFlowServer();
  server.on('save_invoice', refusal);
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
  server.addGrn(IDS.grn, 'A0010', [invoiceLine({ item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 1 }, 0)]);
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
  await openNewInvoice(app);
  await pickGrn(app, 'A0010');
  await app.tap('Next: items');
  await app.tap('Next: review');
  await app.tap('Save invoice');
  await app.tapDialog('Save invoice');
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const lastAlert = () => jest.mocked(showAlert).mock.calls.at(-1)!;
const buttonTexts = () => (lastAlert()[2] ?? []).map((button) => button.text);

describe('saving a new bill when the server answers GST_DETAILS_REQUIRED', () => {
  // Product, 2026-11-14 (WH-205 card): on this rare path the alert waits for the save dialog (report) and shows the title
  // and the role's message only, with no Open GST details button; accepted provided the form keeps what was typed.
  it('shows an administrator the save-your-GST-details alert; nothing is saved and the form keeps what was typed', async () => {
    await open('admin');

    expect(server.callsOf('save_invoice')).toHaveLength(1);
    expect(lastAlert()[0]).toBe('No bills yet');
    expect(lastAlert()[1]).toBe(ADMIN_ALERT);
    expect(buttonTexts()).not.toContain('Open GST details');
    expect(app.successDialog()).toBeUndefined();
    expect(app.pathname()).toMatch(/invoice-form/);
    expect(app.store.getState().invoiceForm.is_saving).toBe(false);
    expect(app.store.getState().invoiceForm.header.gr_id).toBe(IDS.grn);
  });

  it('shows staff the ask-an-administrator alert, not the server sentence; nothing is saved and the form is kept', async () => {
    await open('staff');

    expect(lastAlert()[0]).toBe('No bills yet');
    expect(lastAlert()[1]).toBe(STAFF_ALERT);
    expect(buttonTexts()).not.toContain('Open GST details');
    expect(app.successDialog()).toBeUndefined();
    expect(app.pathname()).toMatch(/invoice-form/);
    expect(app.store.getState().invoiceForm.header.gr_id).toBe(IDS.grn);
  });
});
