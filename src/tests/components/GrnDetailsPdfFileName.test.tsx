/**
 * WH-185: the file name the GRN details page gives the PDF it shares carries the whole number ("GRN/23-24/0042" gives
 * "GRN_GRN_23-24_0042.pdf"). The real page and handler run; only the PDF service and the share call are faked.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { generateGRNPDF } from '@/services/pdf-service';
import { nameCases, expectSafeNames } from '@/tests/helpers/pdfFileNames';

const mockGetGRNDetails = jest.fn();
let mockOverviewProps: any;
let mockTabProps: any;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1', tab: 'overview' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: any) => children, Snackbar: () => null }));
jest.mock('@/store/hooks', () => {
  const state = { auth: { user: { id: 'u' }, session: {}, userProfile: { role: 'admin' } }, theme: { preference: 'light', brand: 'orange' } };
  return {
    useAppDispatch: () => jest.fn(),
    useAppSelector: (selector: (s: unknown) => unknown) => selector(state),
    useAppStore: () => ({ getState: () => state, dispatch: jest.fn() }),
  };
});
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: true, canDelete: true, isCustomer: false }) }));
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
jest.mock('@/services/invoice-service', () => ({ getGrnInvoiceRows: jest.fn() }));
jest.mock('@/components/common/invoiceTable', () => ({ invoiceTableFrom: jest.fn() }));
jest.mock('@/services/orderEffects', () => ({
  parseOrderEffects: jest.fn(() => []),
  previewDeleteGrn: jest.fn(),
  withOrderEffects: (text: string) => text,
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
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
  GRNTabNavigator: (props: unknown) => {
    mockTabProps = props;
    return null;
  },
  GRNOverviewTab: (props: unknown) => {
    mockOverviewProps = props;
    return null;
  },
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: () => null,
  GRNImagesTab: () => null,
}));

const grnNumbered = (grNo: string) => ({
  success: true,
  data: { grn: { id: 'grn-1', gr_no: grNo, date: '2026-10-01', items: [], processed_header_images: [], statistics: {} } },
});

const shareNumbered = async (grNo: string) => {
  mockGetGRNDetails.mockResolvedValue(grnNumbered(grNo));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GRNDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
  await act(async () => { await mockOverviewProps.onSharePDF(); });
  await act(async () => { tree.unmount(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  jest.mocked(generateGRNPDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.invalid/doc.pdf' } as never);
  jest.mocked(downloadAndSharePDF).mockResolvedValue({ success: true } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GRN details page: the PDF file name', () => {
  it.each(nameCases('GRN'))('$label gives the whole number in the name', async ({ number, expected }) => {
    await shareNumbered(number);
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(1);
    expect(downloadAndSharePDF).toHaveBeenCalledWith('https://example.invalid/doc.pdf', expected);
  });

  it('two GRNs of different years get different names, and every name is a safe file name', async () => {
    const [first, second] = nameCases('GRN');
    await shareNumbered(first.number);
    await shareNumbered(second.number);
    const names = jest.mocked(downloadAndSharePDF).mock.calls.map((call) => call[1] as string);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expectSafeNames(names);
  });
});
