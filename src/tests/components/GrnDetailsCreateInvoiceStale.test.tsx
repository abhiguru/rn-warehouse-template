/**
 * WH-205 rework 2: GRN details' "Create invoice" while its `can_make_bills` answer is still waiting. When the answer comes
 * as "allowed" and another invoice form has been opened meanwhile (and typed into), or this page was left, nothing is reset,
 * nothing opens, no alert shows, and the button is free again. The real GRN details screen, the real gate, the real
 * `prepareInvoiceFromGrn` and the real invoice-form slice run; only the facility's `rpc` answers (can_make_bills held).
 * Fictional data only.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import InvoicesTab from '../../../app/(tabs)/invoices';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';
import { registerInvoiceForm } from '@/features/invoice/utils/openInvoiceForms';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import { newFlowStore, flowStore } from '@/tests/helpers/invoiceFlowStore';
import { fillNewInvoice, IDS, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { makeFlowServer, type FlowServer } from '@/tests/helpers/invoiceFlowServer';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

const mockGetGRNDetails = jest.fn();
let mockTabProps: any;
let mockInvoicesProps: any;

jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks());
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: any) => children, Snackbar: () => null }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'admin', canManageOrders: true, assignedCustomerIds: [] }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/features/grn/components/LostAnswerNotice', () => ({ LostAnswerNotice: () => null }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/services/invoice-service', () => ({ getGrnInvoiceRows: jest.fn(async () => ({ success: true, invoices: [] })) }));
jest.mock('@/components/common/invoiceTable', () => ({ invoiceTableFrom: jest.fn(() => []) }));
jest.mock('@/services/orderEffects', () => ({
  parseOrderEffects: jest.fn(() => []),
  previewDeleteGrn: jest.fn(),
  withOrderEffects: (text: string) => text,
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/lists', () => ({ InvoiceFlashList: () => null }));
jest.mock('@/components/list/ListErrorBoundary', () => ({ ListErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/services/grn-detail-service', () => ({
  getGRNDetails: (...args: unknown[]) => mockGetGRNDetails(...args),
  getGRNItemDispatches: jest.fn(async () => ({ success: true, data: { dispatches: [] } })),
  deleteGRN: jest.fn(),
  settleLostDelete: jest.fn(),
  photoPathsOf: jest.fn(() => []),
  removeGRNPhotoFiles: jest.fn(),
}));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNImage: jest.fn(), deleteGRNImage: jest.fn() }));
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: () => null,
  GRNTabNavigator: (props: unknown) => { mockTabProps = props; return null; },
  GRNOverviewTab: () => null,
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: (props: unknown) => { mockInvoicesProps = props; return null; },
  GRNImagesTab: () => null,
}));

const grn = {
  success: true,
  data: {
    grn: {
      id: IDS.grn, gr_no: 'A0010', date: '2026-10-01', items: [], statistics: {},
      processed_header_images: [],
      invoices_summary: { can_create_invoice: true, invoice_state: 'NOT_INVOICED' },
    },
  },
};

/** Each can_make_bills call waits until released with its answer; every other call goes to the flow server. */
let server: FlowServer;
let held: Array<(allowed: boolean) => void> = [];
const rpc = (name: string, args?: any) => {
  if (name !== 'can_make_bills') return server.rpc(name, args);
  return new Promise((resolve) => {
    held.push((allowed) => resolve({ data: { success: true, data: { allowed } }, error: null }));
  });
};

let grnTree: ReturnType<typeof create> | undefined;
let invoicesTree: ReturnType<typeof create> | undefined;
let unregister: (() => void) | undefined;
const resets = () => jest.mocked(flowStore().dispatch).mock.calls.filter(([action]) => (action as { type: string }).type === 'invoiceForm/resetForm').length;
const tapGrn = () => act(async () => { void mockInvoicesProps.onCreateInvoice(); });
const release = (index: number, allowed = true) => act(async () => { held[index](allowed); });
const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });

/** Another form is opened from the Invoices tab and typed into (its layout registers it while it is open). */
const openOtherFormAndType = async () => {
  await act(async () => { invoicesTree = create(<InvoicesTab />); });
  const fab = invoicesTree!.root.find((n) => n.props.accessibilityLabel === 'Create invoice' && typeof n.props.onPress === 'function');
  await act(async () => { fab.props.onPress(); });
  expect(held).toHaveLength(2);
  await release(1);
  expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
  jest.mocked(router.push).mockClear();
  unregister = registerInvoiceForm({ kind: 'create' });
  typeInOtherForm();
};
const typeInOtherForm = () => {
  fillNewInvoice(flowStore(), [invoiceLine()]);
  flowStore().dispatch(updateHeader({ discount: 12 }));
};
const typedInputKept = () => {
  const { items, header } = flowStore().getState().invoiceForm;
  expect(items).toHaveLength(1);
  expect(header.discount).toBe(12);
  expect(header.customer_name).toBe('Example Traders');
};

beforeEach(async () => {
  jest.clearAllMocks();
  resetScreenFocus();
  setLanguage('en');
  held = [];
  mockInvoicesProps = undefined;
  const store = newFlowStore('admin');
  jest.spyOn(store, 'dispatch');
  server = makeFlowServer();
  server.addGrn(IDS.grn, 'A0010', [invoiceLine()]);
  mockGetGRNDetails.mockResolvedValue(grn);
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => { grnTree = create(<GRNDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('invoices'); });
  expect(typeof mockInvoicesProps.onCreateInvoice).toBe('function');
});
afterEach(async () => {
  unregister?.();
  unregister = undefined;
  await act(async () => { grnTree?.unmount(); invoicesTree?.unmount(); });
  grnTree = undefined;
  invoicesTree = undefined;
  jest.restoreAllMocks();
});

describe('GRN details, Create invoice, answered "allowed" after the person went elsewhere', () => {
  it('keeps the input of another form opened meanwhile: no reset, no navigation, no alert, the button is free', async () => {
    await tapGrn();
    expect(held).toHaveLength(1);
    expect(mockInvoicesProps.creatingInvoice).toBe(true);

    await openOtherFormAndType();
    const resetsBefore = resets();
    await release(0, true);
    await settle();

    expect(resets()).toBe(resetsBefore);
    typedInputKept();
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(mockInvoicesProps.creatingInvoice).toBe(false);
    expect(server.callsOf('generate_invoice_data_for_grn_with_pricing')).toHaveLength(0);
  });

  it('keeps the other form when only the open form says no (no newer tap took over)', async () => {
    await tapGrn();
    unregister = registerInvoiceForm({ kind: 'create' });
    typeInOtherForm();
    const resetsBefore = resets();
    await release(0, true);
    await settle();

    expect(resets()).toBe(resetsBefore);
    typedInputKept();
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(mockInvoicesProps.creatingInvoice).toBe(false);
  });

  it('does nothing when the page lost focus: no reset, no navigation, no alert, the button is free', async () => {
    await tapGrn();
    await act(async () => { setScreenFocused(false); });
    const resetsBefore = resets();
    await release(0, true);
    await settle();

    expect(resets()).toBe(resetsBefore);
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(mockInvoicesProps.creatingInvoice).toBe(false);
    expect(server.callsOf('generate_invoice_data_for_grn_with_pricing')).toHaveLength(0);
  });

  it('keeps the other form when the page also lost focus', async () => {
    await tapGrn();
    await openOtherFormAndType();
    await act(async () => { setScreenFocused(false); });
    const resetsBefore = resets();
    await release(0, true);
    await settle();

    expect(resets()).toBe(resetsBefore);
    typedInputKept();
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(mockInvoicesProps.creatingInvoice).toBe(false);
  });

  it('still opens the form when nothing changed (control)', async () => {
    await tapGrn();
    await release(0, true);
    await settle();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(String(jest.mocked(router.push).mock.calls[0][0])).toMatch(/^\/invoice-form\/step/);
  });
});
