/**
 * WH-216: the GRN and Dispatch pages when they cannot be read, and Edit in their stack header.
 * The real pages run; only the services (the facility's answers), the permission hooks and the
 * tab components are stand-ins. Stack.Screen draws what the page puts in the stack header.
 * Fictional data only.
 *
 * Not tested here: the "not found" layout of these two pages. In the code a missing GRN or dispatch
 * ends in the load error (the page has no state in which a read succeeded with nothing in it),
 * so its texts are never shown; reported to Development.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
const mockGetDispatchDetails = jest.fn();
let mockCanUpdate = true;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'doc-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: any) => children, Snackbar: () => null }));
jest.mock('@/store/hooks', () => {
  const state = { auth: { user: { id: 'u' }, session: {}, userProfile: { id: 'u', role: 'admin' } }, theme: { preference: 'light', brand: 'orange' } };
  return { useAppDispatch: () => jest.fn(), useAppStore: () => ({ getState: () => state, dispatch: jest.fn() }), useAppSelector: (selector: (s: unknown) => unknown) => selector(state) };
});
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canUpdate: mockCanUpdate, canDelete: true, isCustomer: false }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'admin', canManageOrders: true, assignedCustomerIds: [] }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), createAuthenticatedFetch: jest.fn(), getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'k' }) }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: () => null }));
jest.mock('@/features/grn/components/LostAnswerNotice', () => ({ LostAnswerNotice: () => null }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn(), generateDispatchPDF: jest.fn(), pdfRefusalText: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn(), printDispatchRange: jest.fn(), printFailureMessage: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/invoice-service', () => ({ getGrnInvoiceRows: jest.fn(async () => ({ success: true, invoices: [] })) }));
jest.mock('@/components/common/invoiceTable', () => ({ invoiceTableFrom: jest.fn(() => []) }));
jest.mock('@/services/orderEffects', () => ({ parseOrderEffects: jest.fn(() => []), previewDeleteGrn: jest.fn(), withOrderEffects: (text: string) => text }));
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
jest.mock('@/services/dispatch-service', () => ({ deleteDispatch: jest.fn() }));
jest.mock('@/services/dispatch-detail-service', () => ({ getDispatchDetails: (...args: unknown[]) => mockGetDispatchDetails(...args) }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({ uploadDispatchImage: jest.fn(), deleteDispatchImage: jest.fn() }));
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: () => null,
  GRNTabNavigator: () => null,
  GRNOverviewTab: () => null,
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: () => null,
  GRNImagesTab: () => null,
}));
jest.mock('@/components/dispatch-details', () => ({
  DispatchHeroHeader: () => null,
  DispatchTabNavigator: () => null,
  DispatchOverviewTab: () => null,
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  DispatchInvoicesTab: () => null,
  DispatchImagesTab: () => null,
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

const GRN_OK = { success: true, data: { grn: { id: 'doc-1', gr_no: 'A0010', date: '2026-10-01', items: [], statistics: {}, processed_header_images: [], invoices_summary: {} } } };
const DISPATCH_OK = { success: true, data: { dispatch: { id: 'doc-1', disp_no: 'D0010', items: [], processed_images: [] } } };

let tree: ReactTestRenderer | undefined;
const mount = async (screen: 'grn' | 'dispatch') => {
  await act(async () => { tree = create(screen === 'grn' ? <GRNDetailScreen /> : <DispatchDetailScreen />); });
  return tree as ReactTestRenderer;
};
const shownText = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(3).join(''));
const press = async (label: string) => {
  const control = tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  if (!control) throw new Error(`No control labelled "${label}"`);
  await act(async () => { control.props.onPress(); });
};
const editButtons = () => tree!.root.findAll(node => node.props.accessibilityLabel === 'Edit' && typeof node.props.onPress === 'function');

beforeEach(() => {
  jest.clearAllMocks();
  mockCanUpdate = true;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  setLanguage('en');
  jest.restoreAllMocks();
});

describe.each([
  ['grn', mockGetGRNDetails, "Couldn't load the GRN", 'આવક પાવતી લોડ કરી શકાઈ નથી'],
  ['dispatch', mockGetDispatchDetails, "Couldn't load the dispatch", 'જાવક લોડ કરી શકાઈ નથી'],
] as const)('%s page that cannot be read', (screen, service, titleEn, titleGu) => {
  it('shows the title with the check-connection text under it, Try again and Go back (English)', async () => {
    service.mockResolvedValue({ success: false, message: 'Failed to fetch' });
    await mount(screen);
    expect(shownText()).toEqual(expect.arrayContaining([titleEn, 'Check your connection and try again.']));
    expect(shownText()).not.toContain('Failed to fetch');
    await press('Go back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('says the same in Gujarati', async () => {
    setLanguage('gu');
    service.mockResolvedValue({ success: false, message: 'Failed to fetch' });
    await mount(screen);
    expect(shownText()).toEqual(expect.arrayContaining([titleGu, 'તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.']));
    await press('પાછા જાઓ');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Try again reads the page again and shows it', async () => {
    service.mockResolvedValueOnce({ success: false, message: 'x' });
    service.mockResolvedValue(screen === 'grn' ? GRN_OK : DISPATCH_OK);
    await mount(screen);
    expect(service).toHaveBeenCalledTimes(1);
    await press(screen === 'dispatch' ? 'Try loading the dispatch again' : 'Try again');
    expect(service).toHaveBeenCalledTimes(2);
    expect(shownText()).not.toContain(titleEn);
  });
});

describe.each([
  ['grn', mockGetGRNDetails, GRN_OK],
  ['dispatch', mockGetDispatchDetails, DISPATCH_OK],
] as const)('Edit in the header of the %s page', (screen, service, ok) => {
  it('is in the stack header for a role that may update, and opens the edit form', async () => {
    service.mockResolvedValue(ok);
    await mount(screen);
    expect(editButtons().length).toBeGreaterThan(0);
    await act(async () => { editButtons()[0].props.onPress(); });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('is not shown to a role that may not update', async () => {
    mockCanUpdate = false;
    service.mockResolvedValue(ok);
    await mount(screen);
    expect(editButtons()).toHaveLength(0);
  });

  it('is not shown for an imported document, which is read only', async () => {
    const key = screen === 'grn' ? 'grn' : 'dispatch';
    service.mockResolvedValue({ success: true, data: { [key]: { ...(ok.data as any)[key], imported: true } } });
    await mount(screen);
    expect(editButtons()).toHaveLength(0);
  });

  it('is not shown while the page is loading or when it cannot be read', async () => {
    service.mockResolvedValue({ success: false, message: 'x' });
    await mount(screen);
    expect(editButtons()).toHaveLength(0);
  });
});
