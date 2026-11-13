/**
 * WH-180: the dispatch page of an imported dispatch is read-only (no Edit, Delete or photo add), and its PDF is asked
 * for by the dispatch id on a server that knows imported documents (migration 191). The real PDF service runs.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';

const mockFetch = jest.fn();
const mockGetDispatchDetails = jest.fn();
const mockShowAlert = jest.fn();
const mockActive = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
let mockTabProps: any;
let mockOverviewProps: any;
let mockHeroProps: any;
let mockImagesProps: any;

jest.mock('@/config/operatorServer', () => ({ ...jest.requireActual('@/config/operatorServer'), getActiveOperatorServer: () => mockActive }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'dispatch-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: any) => children, Snackbar: () => null }));
jest.mock('@/store/hooks', () => {
  const state = { auth: { user: { id: 'u' }, session: {}, userProfile: { role: 'admin' } }, theme: { preference: 'light', brand: 'orange' } };
  return { useAppDispatch: () => jest.fn(), useAppSelector: (selector: (s: unknown) => unknown) => selector(state) };
});
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: true, canDelete: true, isCustomer: false }) }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/components/skeletons', () => ({ DetailSkeleton: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: () => null }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }));
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));
jest.mock('@/services/dispatch-service', () => ({ deleteDispatch: jest.fn() }));
jest.mock('@/services/dispatch-detail-service', () => ({ getDispatchDetails: (...args: unknown[]) => mockGetDispatchDetails(...args) }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({ uploadDispatchImage: jest.fn(), deleteDispatchImage: jest.fn() }));
jest.mock('@/components/dispatch-details', () => ({
  DispatchHeroHeader: (props: unknown) => { mockHeroProps = props; return null; },
  DispatchTabNavigator: (props: unknown) => { mockTabProps = props; return null; },
  DispatchOverviewTab: (props: unknown) => { mockOverviewProps = props; return null; },
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  DispatchInvoicesTab: () => null,
  DispatchImagesTab: (props: unknown) => { mockImagesProps = props; return null; },
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });
const dispatchAnswer = (imported?: boolean) => ({
  success: true,
  data: { dispatch: { id: 'dispatch-1', disp_no: 'D1', items: [], processed_images: [], ...(imported === undefined ? {} : { imported }) } },
});

let tree: ReturnType<typeof create>;
const open = async (imported?: boolean) => {
  mockGetDispatchDetails.mockResolvedValue(dispatchAnswer(imported));
  await act(async () => { tree = create(<DispatchDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('images'); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
};
beforeEach(() => {
  jest.clearAllMocks();
  resetFacilityRelease();
  mockFetch.mockReset();
  mockHeroProps = mockOverviewProps = mockImagesProps = undefined;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => { tree.unmount(); });
});

describe('an imported dispatch', () => {
  it('shows the Imported mark and closes Edit and Delete', async () => {
    await open(true);
    expect(mockHeroProps.imported).toBe(true);
    expect(mockOverviewProps.can_edit).toBe(false);
    expect(mockOverviewProps.can_delete).toBe(false);
  });

  it('offers no photo to add', async () => {
    await open(true);
    await act(async () => { mockTabProps.onTabChange('images'); });
    expect(mockImagesProps.onUpload).toBeUndefined();
  });

  it('asks for its PDF by id on a server with migration 191', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    mockFetch.mockResolvedValue(reply(200, { success: true, pdf_url: 'https://example.invalid/x.pdf', expires_in: 60 }));
    await open(true);
    await act(async () => { await mockOverviewProps.onSharePDF(); });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ disp_no: 'D1', id: 'dispatch-1' });
  });

  it('shows the several-documents refusal when the server cannot tell which one is meant', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    mockFetch.mockResolvedValue(reply(409, { success: false, error: 'Several documents', code: 'SEVERAL_DOCUMENTS' }));
    await open(true);
    await act(async () => { await mockOverviewProps.onSharePDF(); });
    expect(mockShowAlert).toHaveBeenCalledWith('Several documents', 'Several documents have this number. Update the app.');
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
  });
});

describe('a dispatch that is not imported', () => {
  it.each([[false], [undefined]])('keeps Edit, Delete and photos (flag %s)', async flag => {
    await open(flag);
    expect(mockHeroProps.imported).toBe(false);
    expect(mockOverviewProps.can_edit).toBe(true);
    expect(mockOverviewProps.can_delete).toBe(true);
    await act(async () => { mockTabProps.onTabChange('images'); });
    expect(typeof mockImagesProps.onUpload).toBe('function');
  });

  it('does not send the id to a server older than migration 191', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000190_x' });
    mockFetch.mockResolvedValue(reply(200, { success: true, pdf_url: 'https://example.invalid/x.pdf', expires_in: 60 }));
    await open();
    await act(async () => { await mockOverviewProps.onSharePDF(); });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ disp_no: 'D1' });
  });
});
