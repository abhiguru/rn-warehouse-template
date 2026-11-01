/**
 * GRN details, Images tab: the only GRN photo is not deleted (the server refuses it too), and a photo add that got no
 * answer reads the photos again.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
const mockUploadGRNImage = jest.fn();
const mockDeleteGRNImage = jest.fn();
const mockShowAlert = jest.fn();
let mockImagesProps: any;
let mockTabProps: any;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1', tab: 'images' }),
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
jest.mock('@/utils/alert', () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }));
jest.mock('@/services/grn-detail-service', () => ({
  getGRNDetails: (...args: unknown[]) => mockGetGRNDetails(...args),
  getGRNItemDispatches: jest.fn(async () => ({ success: true, data: { dispatches: [] } })),
  deleteGRN: jest.fn(),
  settleLostDelete: jest.fn(),
  photoPathsOf: jest.fn(() => []),
  removeGRNPhotoFiles: jest.fn(),
}));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  uploadGRNImage: (...args: unknown[]) => mockUploadGRNImage(...args),
  deleteGRNImage: (...args: unknown[]) => mockDeleteGRNImage(...args),
}));
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: () => null,
  GRNTabNavigator: (props: unknown) => {
    mockTabProps = props;
    return null;
  },
  GRNOverviewTab: () => null,
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: () => null,
  GRNImagesTab: (props: unknown) => {
    mockImagesProps = props;
    return null;
  },
}));

const grnWith = (headerPhotos: number) => ({
  success: true,
  data: {
    grn: {
      id: 'grn-1',
      gr_no: 'A1',
      date: '2026-10-01',
      items: [],
      processed_header_images: Array.from({ length: headerPhotos }, (_, i) => ({ id: `h${i}`, image_url: `https://x/h${i}.jpg`, file_name: `h${i}.jpg` })),
      statistics: {},
    },
  },
});

let tree: ReturnType<typeof create> | undefined;
const mount = async () => {
  await act(async () => {
    tree = create(<GRNDetailScreen />);
  });
  await act(async () => {
    mockTabProps.onTabChange('images');
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockImagesProps = undefined;
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

it('does not offer to delete the only GRN photo', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  await mount();
  await act(async () => {
    mockImagesProps.onDeleteImage({ id: 'h0', image_url: 'x', category: 'header' });
  });
  expect(mockShowAlert).not.toHaveBeenCalled();
  expect(mockDeleteGRNImage).not.toHaveBeenCalled();
});

it('asks before deleting a GRN photo when another one remains', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(2));
  await mount();
  await act(async () => {
    mockImagesProps.onDeleteImage({ id: 'h0', image_url: 'x', category: 'header' });
  });
  expect(mockShowAlert).toHaveBeenCalledTimes(1);
});

it('reads the photos again when adding one got no answer', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  mockUploadGRNImage.mockResolvedValue({ success: false, error: 'Network request failed' });
  await mount();
  expect(mockGetGRNDetails).toHaveBeenCalledTimes(1);
  await act(async () => {
    await mockImagesProps.onUpload();
  });
  expect(mockGetGRNDetails).toHaveBeenCalledTimes(2);
});

it('does not read again after a plain refusal to add a photo', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  mockUploadGRNImage.mockResolvedValue({ success: false, error: 'Photo is too large' });
  await mount();
  await act(async () => {
    await mockImagesProps.onUpload();
  });
  expect(mockGetGRNDetails).toHaveBeenCalledTimes(1);
});
