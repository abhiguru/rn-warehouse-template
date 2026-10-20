/**
 * Saving twice: in a new invoice and in an edit, two quick taps on the Save (Update) button and two quick taps on the
 * question's button send one request. While a slow request is on its way the question stays open, busy, and a third
 * tap does nothing.
 */
import 'expo-router/build/testing-library/mocks';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore } from '@/tests/helpers/invoiceFlowStore';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { startFlowApp, type FlowApp } from '@/tests/helpers/invoiceFlowHarness';
import { flowLines } from '@/tests/helpers/invoiceFixtures';
import { IDS } from '@/tests/helpers/invoiceFixtures';
import { openEditFromDetails, openNewInvoice, pickGrn } from '@/tests/helpers/invoiceFlowSteps';

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
  server.setInvoice(flowLines.grnA(), { labour: 450, tax_amount: 70, total: 1720 });
  app = await startFlowApp({ location: '/invoices', advance: () => jest.runAllTimersAsync() });
});

afterEach(async () => {
  await app.unmount();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const MODES = [
  {
    mode: 'new invoice',
    button: 'Save invoice',
    rpcName: 'save_invoice',
    title: 'Save invoice 55?',
    reach: async () => {
      await openNewInvoice(app);
      await pickGrn(app, 'A0010');
      await app.tap('Next: items');
      await app.tap('Next: review');
    },
  },
  {
    mode: 'edit',
    button: 'Update invoice',
    rpcName: 'update_invoice',
    title: 'Update invoice 42?',
    reach: async () => {
      await openEditFromDetails(app);
      await app.tap('Next: items');
      await app.tap('Next: review');
    },
  },
] as const;

describe.each(MODES)('$mode', ({ button, rpcName, title, reach }) => {
  const writes = () => server.callsOf(rpcName);

  it('two quick taps on the button open one question', async () => {
    await reach();
    expect(app.pathname()).toMatch(/step3$/);

    await app.rapid(button, 2);

    expect(app.dialogs().map((dialog) => dialog.props.title)).toEqual([title]);
    expect(writes()).toHaveLength(0);
  });

  it('two quick taps on the question\'s button send one request', async () => {
    await reach();
    await app.tap(button);

    await app.rapidDialog(button, 2);

    expect(writes()).toHaveLength(1);
    expect(app.successDialog()).toBeDefined();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a slow request keeps the question open and busy, and a third tap does nothing', async () => {
    await reach();
    const hold = server.hold(rpcName);
    await app.tap(button);
    expect(app.dialogButtonEnabled(button)).toBe(true);

    await app.rapidDialog(button, 2);

    // The request is on its way and not answered: one call, the question still open, its button busy.
    expect(writes()).toHaveLength(1);
    expect(app.dialog().props.busy).toBe(true);
    expect(app.dialogButtonEnabled(button)).toBe(false);
    expect(app.successDialog()).toBeUndefined();

    // A third tap on the button does nothing, and the question's other button is dead too.
    await app.rapidDialog(button, 1);
    expect(app.dialogButtonEnabled('Cancel')).toBe(false);
    expect(writes()).toHaveLength(1);
    expect(app.dialog().props.busy).toBe(true);

    hold.release();
    await app.settle();

    expect(writes()).toHaveLength(1);
    expect(app.dialogs()).toHaveLength(0);
    expect(app.successDialog()).toBeDefined();
  });

  // A refusal is an answer: the question is free again. (A request that gets no answer at all is a lost answer: the form
  // locks and asks the server before anything is sent again, owner rule D22.)
  it('a request that is refused frees the question: the person can answer it again, and the second try is the second request', async () => {
    await reach();
    server.fail(rpcName, 'Invoice line tax must be between 0 and 100');
    await app.tap(button);
    await app.tapDialog(button);

    expect(writes()).toHaveLength(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(app.successDialog()).toBeUndefined();

    server.restore(rpcName);
    await app.tap(button);
    await app.tapDialog(button);

    expect(writes()).toHaveLength(2);
    expect(app.successDialog()).toBeDefined();
  });
});
