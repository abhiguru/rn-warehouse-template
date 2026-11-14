/**
 * WH-205 (contract product/tech/bills-need-gst-details.md, section 3): GRN details' "Create invoice" (testID
 * `grn-create-invoice`, the `onCreateInvoice` of the Invoices tab) asks `can_make_bills` before anything is read or reset.
 * With no GST details the person gets the alert of their role and the form does not open; when allowed it opens as today.
 * The real gate (billsAllowed) and the real GRN details screen run; only the facility's `rpc` answers (and the preview
 * read that follows, which is not what is tested here). Fictional data only.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { prepareInvoiceFromGrn } from '@/features/invoice/utils/prepareInvoiceFromGrn';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
let mockTabProps: any;
let mockInvoicesProps: any;
let mockRole = 'admin';
let mockAllowed: boolean | 'fail' = false;
const mockRpc = jest.fn(async (name: string) => {
  if (name !== 'can_make_bills') return { data: null, error: { message: `Unexpected rpc ${name}` } };
  if (mockAllowed === 'fail') return { data: null, error: { message: 'Network request failed' } };
  return { data: { success: true, data: { allowed: mockAllowed } }, error: null };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
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
jest.mock('@/store/hooks', () => {
  const state = () => ({ auth: { user: { id: 'u' }, session: {}, userProfile: { role: mockRole } }, theme: { preference: 'light', brand: 'orange' } });
  return {
    useAppDispatch: () => jest.fn(),
    useAppSelector: (selector: (s: unknown) => unknown) => selector(state()),
    useAppStore: () => ({ getState: () => state(), dispatch: jest.fn() }),
  };
});
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ canManageOrders: true, assignedCustomerIds: [] }) }));
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
jest.mock('@/features/invoice/utils/prepareInvoiceFromGrn', () => ({ prepareInvoiceFromGrn: jest.fn() }));
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

const ADMIN_ALERT = "Save your GST details first. Bills can't be made until then.";
const STAFF_ALERT = "Ask an administrator to save the GST details. Bills can't be made until then.";

const grn = {
  success: true,
  data: {
    grn: {
      id: 'grn-1', gr_no: 'A1', date: '2026-10-01', items: [], statistics: {},
      processed_header_images: [],
      invoices_summary: { can_create_invoice: true, invoice_state: 'NOT_INVOICED' },
    },
  },
};

let tree: ReturnType<typeof create> | undefined;
const mount = async (role: string) => {
  mockRole = role;
  mockGetGRNDetails.mockResolvedValue(grn);
  await act(async () => { tree = create(<GRNDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('invoices'); });
  expect(typeof mockInvoicesProps.onCreateInvoice).toBe('function');
};
const tapCreate = async () => { await act(async () => { await mockInvoicesProps.onCreateInvoice(); }); };
const lastAlert = () => jest.mocked(showAlert).mock.calls.at(-1)!;
const buttonTexts = () => (lastAlert()[2] ?? []).map((button) => button.text);

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockAllowed = false;
  mockInvoicesProps = undefined;
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: mockRpc } as never);
  jest.mocked(prepareInvoiceFromGrn).mockResolvedValue({ ok: true, step: 'review' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('GRN details, Create invoice, with no GST details', () => {
  it('shows an administrator the alert with Cancel and Open GST details; nothing is read and the form does not open', async () => {
    await mount('admin');
    await tapCreate();

    expect(mockRpc.mock.calls.filter(([name]) => name === 'can_make_bills')).toHaveLength(1);
    expect(lastAlert()[0]).toBe('No bills yet');
    expect(lastAlert()[1]).toBe(ADMIN_ALERT);
    expect(buttonTexts()).toEqual(['Cancel', 'Open GST details']);
    expect(prepareInvoiceFromGrn).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    // The button is free again (not stuck busy) and asks again on the next tap.
    expect(mockInvoicesProps.creatingInvoice).toBe(false);

    await act(async () => { (lastAlert()[2] ?? []).find((button) => button.text === 'Open GST details')!.onPress?.(); });
    expect(router.push).toHaveBeenCalledWith('/gst-details');
  });

  it.each(['supervisor', 'staff'])('shows %s the ask-an-administrator alert with only OK', async (role) => {
    await mount(role);
    await tapCreate();

    expect(lastAlert()[1]).toBe(STAFF_ALERT);
    expect(buttonTexts()).toEqual(['OK']);
    expect(prepareInvoiceFromGrn).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('GRN details, Create invoice, when bills are allowed or the answer is unknown', () => {
  it('opens the form at Review when allowed, with no alert', async () => {
    mockAllowed = true;
    await mount('staff');
    await tapCreate();

    expect(showAlert).not.toHaveBeenCalled();
    expect(prepareInvoiceFromGrn).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step3');
  });

  it('opens the form as today when can_make_bills fails (the server still refuses a save)', async () => {
    mockAllowed = 'fail';
    await mount('admin');
    await tapCreate();

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step3');
  });

  it('asks again on the next tap once the details are saved', async () => {
    await mount('admin');
    await tapCreate();
    expect(router.push).not.toHaveBeenCalled();

    mockAllowed = true;
    jest.mocked(showAlert).mockClear();
    await tapCreate();

    expect(mockRpc.mock.calls.filter(([name]) => name === 'can_make_bills')).toHaveLength(2);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step3');
  });
});
