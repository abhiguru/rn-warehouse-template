/**
 * WH-205 (contract product/tech/bills-need-gst-details.md, section 3): a new bill does not open while the server says
 * bills are not allowed. The Invoices tab and its "Create invoice" button run for real with the real gate; only the
 * facility's `rpc` is a stand-in (can_make_bills answers allowed true or false, or fails). Fictional data only.
 * The invoice list's empty-state button and GRN details' "Create invoice" are the other two entries (not covered here:
 * the list is stubbed in this harness and GRN details has no screen harness).
 */
import 'expo-router/build/testing-library/mocks';
import { act } from 'react-test-renderer';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { IDS, flowLines } from '@/tests/helpers/invoiceFixtures';
import { openNewInvoice } from '@/tests/helpers/invoiceFlowSteps';

jest.setTimeout(30000);

(jest.requireMock('react-native-reanimated') as { useReducedMotion?: () => boolean }).useReducedMotion = () => false;

let mockRole = 'admin';
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks());
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
// The backend has the migration (feature key billsNeedGst); any key answers true.
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
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

const ADMIN_ALERT = "Save your GST details first. Bills can't be made until then.";
const STAFF_ALERT = "Ask an administrator to save the GST details. Bills can't be made until then.";

let server: FlowServer;
let app: FlowApp;
let allowed = false;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  allowed = false;
  server = makeFlowServer();
  server.addGrn(IDS.grn, 'A0010', flowLines.grnA());
  server.on('can_make_bills', () => ({ data: { success: true, data: { allowed } }, error: null }));
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: server.rpc } as never);
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const open = async (role: string) => {
  mockRole = role;
  newFlowStore(role);
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync(), pendingTimers: () => jest.getTimerCount() });
};

const alertCall = () => jest.mocked(showAlert).mock.calls.at(-1)!;
const buttons = () => alertCall()[2] ?? [];
const buttonTexts = () => buttons().map((button) => button.text);
const press = async (text: string) => {
  const button = buttons().find((b) => b.text === text)!;
  await act(async () => { button.onPress?.(); });
  await app.settle();
};

describe('Invoices, new bill, when the server says bills are not allowed', () => {
  it('asks can_make_bills once, shows an administrator the alert with Cancel and Open GST details, and does not open the form', async () => {
    await open('admin');
    await openNewInvoice(app);
    await app.settle();

    expect(server.callsOf('can_make_bills')).toHaveLength(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(alertCall()[0]).toBe('No bills yet');
    expect(alertCall()[1]).toBe(ADMIN_ALERT);
    expect(buttonTexts()).toEqual(['Cancel', 'Open GST details']);
    expect(buttons()[0].style).toBe('cancel');
    expect(app.pathname()).not.toMatch(/invoice-form/);
    expect(server.callsOf('get_next_invoice_number')).toHaveLength(0);
  });

  it('Open GST details goes to /gst-details, without a bill form', async () => {
    await open('admin');
    await openNewInvoice(app);
    await app.settle();
    await press('Open GST details');

    expect(app.pathname()).toBe('/gst-details');
  });

  it('Cancel leaves the person on Invoices', async () => {
    await open('admin');
    await openNewInvoice(app);
    await app.settle();
    await press('Cancel');

    expect(app.pathname()).toBe('/invoices');
  });

  it.each(['supervisor', 'staff'])('shows %s the ask-an-administrator alert with only OK, and no way to the settings', async (role) => {
    await open(role);
    await openNewInvoice(app);
    await app.settle();

    expect(alertCall()[1]).toBe(STAFF_ALERT);
    expect(buttonTexts()).toEqual(['OK']);
    expect(app.pathname()).not.toMatch(/invoice-form|settings|gst-details/);
    await press('OK');
    expect(app.pathname()).toBe('/invoices');
  });
});

describe('Invoices, new bill, when bills are allowed or the answer is unknown', () => {
  it.each(['admin', 'supervisor', 'staff'])('opens the bill form for %s when allowed, with no alert', async (role) => {
    allowed = true;
    await open(role);
    await openNewInvoice(app);
    await app.settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(app.pathname()).toBe('/invoice-form/step1');
  });

  it('opens the bill form as today when can_make_bills fails (the server still refuses a save)', async () => {
    server.fail('can_make_bills', 'Network request failed');
    await open('admin');
    await openNewInvoice(app);
    await app.settle();

    expect(showAlert).not.toHaveBeenCalled();
    expect(app.pathname()).toBe('/invoice-form/step1');
  });

  it('asks again on the next tap, so the form opens once the details are saved (nothing is remembered as refused)', async () => {
    await open('admin');
    await openNewInvoice(app);
    await app.settle();
    expect(app.pathname()).toBe('/invoices');

    allowed = true;
    jest.mocked(showAlert).mockClear();
    await openNewInvoice(app);
    await app.settle();

    expect(server.callsOf('can_make_bills')).toHaveLength(2);
    expect(showAlert).not.toHaveBeenCalled();
    expect(app.pathname()).toBe('/invoice-form/step1');
  });
});
