/**
 * Dispatch details, Images tab: a photo that could not be added says so in a dialog with the app's own words
 * (a 4 second toast was gone before anyone read it while offline).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetDispatchDetails = jest.fn();
const mockUploadDispatchImage = jest.fn();
const mockShowAlert = jest.fn();
let mockImagesProps: any;
let mockTabProps: any;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'dispatch-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///p.jpg' }] })),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
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
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }));
jest.mock('@/services/dispatch-service', () => ({ deleteDispatch: jest.fn() }));
jest.mock('@/services/dispatch-detail-service', () => ({ getDispatchDetails: (...args: unknown[]) => mockGetDispatchDetails(...args) }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDispatchImage: (...args: unknown[]) => mockUploadDispatchImage(...args),
  deleteDispatchImage: jest.fn(),
}));
jest.mock('@/components/dispatch-details', () => ({
  DispatchHeroHeader: () => null,
  DispatchTabNavigator: (props: unknown) => {
    mockTabProps = props;
    return null;
  },
  DispatchOverviewTab: () => null,
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  DispatchInvoicesTab: () => null,
  DispatchImagesTab: (props: unknown) => {
    mockImagesProps = props;
    return null;
  },
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

let tree: ReturnType<typeof create> | undefined;
beforeEach(async () => {
  jest.clearAllMocks();
  setLanguage('en');
  mockImagesProps = undefined;
  mockGetDispatchDetails.mockResolvedValue({ success: true, data: { dispatch: { id: 'dispatch-1', disp_no: 'D1', items: [], processed_images: [] } } });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

const mountOnImages = async () => {
  await act(async () => { tree = create(<DispatchDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('images'); });
};

it('says it in the app\'s words when the photo could not be sent for want of a connection', async () => {
  mockUploadDispatchImage.mockResolvedValue({ success: false, error: 'Network request failed' });
  await mountOnImages();
  expect(mockImagesProps).toBeDefined();
  await act(async () => { await mockImagesProps.onUpload(); });
  expect(mockShowAlert).toHaveBeenCalledTimes(1);
  const [title, message] = mockShowAlert.mock.calls[0];
  expect(title).toBe("Couldn't upload the photo");
  expect(message).not.toMatch(/Network request failed|fetch failed/i);
  expect(message.length).toBeGreaterThan(10);
});
