/**
 * WH-185: the file name the dispatch details page gives the PDF it shares carries the whole number ("DSP/23-24/0042"
 * gives "Dispatch_DSP_23-24_0042.pdf"). The real page and handler run; only the PDF service and the share call are faked.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { generateDispatchPDF } from '@/services/pdf-service';
import { nameCases, expectSafeNames } from '@/tests/helpers/pdfFileNames';

const mockGetDispatchDetails = jest.fn();
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
jest.mock('@/services/pdf-service', () => ({ ...jest.requireActual('@/services/pdf-service'), generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => jest.fn(),
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

const shareNumbered = async (dispNo: string) => {
  mockGetDispatchDetails.mockResolvedValue({ success: true, data: { dispatch: { id: 'dispatch-1', disp_no: dispNo, items: [], processed_images: [] } } });
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DispatchDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
  await act(async () => { await mockOverviewProps.onSharePDF(); });
  await act(async () => { tree.unmount(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(generateDispatchPDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.invalid/doc.pdf' } as never);
  jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: true } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Dispatch details page: the PDF file name', () => {
  it.each(nameCases('Dispatch'))('$label gives the whole number in the name', async ({ number, expected }) => {
    await shareNumbered(number);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith('https://example.invalid/doc.pdf', expected);
  });

  it('two dispatches of different years get different names, and every name is a safe file name', async () => {
    const [first, second] = nameCases('Dispatch');
    await shareNumbered(first.number);
    await shareNumbered(second.number);
    const names = jest.mocked(downloadAndSharePDF).mock.calls.map((call) => call[1] as string);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expectSafeNames(names);
  });
});
