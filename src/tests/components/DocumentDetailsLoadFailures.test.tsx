/**
 * WH-216: what the GRN and Dispatch pages show for each kind of answer from get_grn_details / get_dispatch_details.
 * The real services and pages run; only the network reply (the authenticated client's rpc) and the native or
 * unrelated parts are stand-ins. Fictional data only.
 *
 * Only the server's own not-found text is "not found". Its SQL-error answer ({success:false, data:null},
 * "Error retrieving ...") is a load error with Try again, and a refusal (permission) is told in its own words,
 * not as "check your connection".
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';

const mockRpc = jest.fn();

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
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'admin', canManageOrders: true, assignedCustomerIds: [] }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => true }));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(async () => ({ rpc: (...args: unknown[]) => mockRpc(...args) })),
  createAuthenticatedFetch: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'k' }),
}));
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
jest.mock('@/services/dispatch-service', () => ({ deleteDispatch: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNImage: jest.fn(), deleteGRNImage: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({ uploadDispatchImage: jest.fn(), deleteDispatchImage: jest.fn() }));
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: () => null, GRNTabNavigator: () => null, GRNOverviewTab: () => null, GRNItemsTab: () => null,
  GRNDispatchesTab: () => null, GRNInvoicesTab: () => null, GRNImagesTab: () => null,
}));
jest.mock('@/components/dispatch-details', () => ({
  DispatchHeroHeader: () => null, DispatchTabNavigator: () => null, DispatchOverviewTab: () => null, DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null, DispatchInvoicesTab: () => null, DispatchImagesTab: () => null,
  mapDispatchItems: jest.fn(() => []), itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })), buildInvoiceTable: jest.fn(() => []),
}));

const mount = async (page: 'grn' | 'dispatch') => {
  await render(page === 'grn' ? <GRNDetailScreen /> : <DispatchDetailScreen />);
};
const shown = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const notShown = (text: string) => expect(screen.queryByText(text)).not.toBeOnTheScreen();
const retryLabel = (page: 'grn' | 'dispatch') => (page === 'dispatch' ? 'Try loading the dispatch again' : 'Try again');
const retryButton = (page: 'grn' | 'dispatch') => screen.queryByRole('button', { name: retryLabel(page) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe.each([
  ['grn', 'GRN', "Couldn't load the GRN", 'GRN not found'],
  ['dispatch', 'Dispatch', "Couldn't load the dispatch", 'Dispatch not found'],
] as const)('%s page, real service (WH-216)', (page, word, loadErrorTitle, notFoundTitle) => {
  const CHECK = 'Check your connection and try again.';
  const NO_PERMISSION = 'You do not have permission to perform this action.';

  it('a server error answer ({success:false, data:null}, "Error retrieving ...") is the load error with Try again, not "not found"', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, data: null, message: `Error retrieving ${word} details: relation does not exist` }, error: null });
    await mount(page);
    shown(loadErrorTitle);
    notShown(notFoundTitle);
    expect(retryButton(page)).toBeOnTheScreen();
    expect(screen.queryByText(/relation does not exist/)).not.toBeOnTheScreen();
  });

  it('only the backend\'s not-found text says "not found" (and then offers no Try again)', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, data: null, message: `${word} not found or access denied` }, error: null });
    await mount(page);
    shown(notFoundTitle);
    notShown(loadErrorTitle);
    expect(retryButton(page)).not.toBeOnTheScreen();
  });

  it('an empty answer without the document is the load error, not "not found"', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    await mount(page);
    shown(loadErrorTitle);
    notShown(notFoundTitle);
  });

  it('a permission refusal in the answer is told in its own words, not as "check your connection"', async () => {
    mockRpc.mockResolvedValue({ data: { success: false, data: null, message: 'Permission denied: you may not view this document' }, error: null });
    await mount(page);
    shown(loadErrorTitle);
    shown(NO_PERMISSION);
    notShown(CHECK);
  });

  it('a permission refusal as an rpc error is told in its own words too', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function get_document_details' } });
    await mount(page);
    shown(NO_PERMISSION);
    notShown(CHECK);
  });

  it('a network failure still says to check the connection', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await mount(page);
    shown(CHECK);
  });
});
