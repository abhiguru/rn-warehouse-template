/**
 * WH-121: "Share PDF" on the dispatch page. The real PDF service runs against the answers the backend really gives;
 * the long-name refusal shows its own title and message, any other failure keeps the old alert.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { downloadAndSharePDF } from '@/utils/shareDocument';

const mockFetch = jest.fn();
const mockGetDispatchDetails = jest.fn();
const mockShowAlert = jest.fn();
let mockTabProps: any;
let mockOverviewProps: any;

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
  DispatchHeroHeader: () => null,
  DispatchTabNavigator: (props: unknown) => {
    mockTabProps = props;
    return null;
  },
  DispatchOverviewTab: (props: unknown) => {
    mockOverviewProps = props;
    return null;
  },
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  DispatchInvoicesTab: () => null,
  DispatchImagesTab: () => null,
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });

let tree: ReturnType<typeof create>;
beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockGetDispatchDetails.mockResolvedValue({ success: true, data: { dispatch: { id: 'dispatch-1', disp_no: 'D1', items: [], processed_images: [] } } });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => { tree = create(<DispatchDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => { tree.unmount(); });
});

const share = () => act(async () => { await mockOverviewProps.onSharePDF(); });

describe('Share PDF on the dispatch page', () => {
  it.each([
    ['the line limit', 'Document exceeds the limit of 3,500 lines'],
    ['the page limit', 'Document is too long to print (about 130 pages; the limit is 120)'],
  ])('shows the long-name refusal text when the server refuses for %s', async (_name, error) => {
    mockFetch.mockResolvedValue(reply(400, { success: false, error }));
    await share();
    expect(mockFetch.mock.calls[0][0]).toBe('https://example.invalid/functions/v1/generate-dispatch-pdf');
    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockShowAlert).toHaveBeenCalledWith('Too long for a PDF', 'This document is too long to make into a PDF.');
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
  });

  it('keeps the old alert for any other failure', async () => {
    mockFetch.mockResolvedValue(reply(500, { success: false, error: 'Internal error' }));
    await share();
    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockShowAlert.mock.calls[0][0]).toBe("Couldn't create the PDF");
  });
});
