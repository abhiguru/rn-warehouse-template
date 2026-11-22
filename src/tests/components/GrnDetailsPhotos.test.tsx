/**
 * GRN details, Images tab: the only GRN photo is not deleted (the server refuses it too), and a photo add that got no
 * answer reads the photos again.
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
const mockUploadGRNImage = jest.fn();
const mockDeleteGRNImage = jest.fn();
const mockShowAlert = jest.fn();

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
  // Draws the tab buttons the page's tab bar draws, and calls the page's own onTabChange.
  GRNTabNavigator: (props: { onTabChange: (tab: string) => void }) => {
    const { Pressable, Text } = require('react-native');
    return ['overview', 'invoices', 'images'].map((tab) => (
      <Pressable key={tab} accessibilityRole="button" accessibilityLabel={`${tab} tab`} onPress={() => props.onTabChange(tab)}>
        <Text>{tab}</Text>
      </Pressable>
    ));
  },
  GRNOverviewTab: () => null,
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  // Draws Add photo and Delete photo buttons that call the page's own onUpload and onDeleteImage (for a header photo).
  GRNImagesTab: (props: { onUpload: () => void; onDeleteImage: (image: { id: string; image_url: string; category: string }) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={() => props.onUpload()}>
          <Text>Add photo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete photo" onPress={() => props.onDeleteImage({ id: 'h0', image_url: 'x', category: 'header' })}>
          <Text>Delete photo</Text>
        </Pressable>
      </>
    );
  },
  GRNInvoicesTab: () => null,
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

const user = userEvent.setup({ delay: 0 });
const mount = async () => {
  await render(<GRNDetailScreen />);
  await user.press(await screen.findByRole('button', { name: 'images tab' }));
};

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
});

it('does not offer to delete the only GRN photo', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  await mount();
  await user.press(screen.getByRole('button', { name: 'Delete photo' }));
  expect(mockShowAlert).not.toHaveBeenCalled();
  expect(mockDeleteGRNImage).not.toHaveBeenCalled();
});

it('asks before deleting a GRN photo when another one remains', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(2));
  await mount();
  await user.press(screen.getByRole('button', { name: 'Delete photo' }));
  expect(mockShowAlert).toHaveBeenCalledTimes(1);
});

it('reads the photos again when adding one got no answer', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  mockUploadGRNImage.mockResolvedValue({ success: false, error: 'Network request failed' });
  await mount();
  expect(mockGetGRNDetails).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole('button', { name: 'Add photo' }));
  await waitFor(() => expect(mockGetGRNDetails).toHaveBeenCalledTimes(2));
});

it('does not read again after a plain refusal to add a photo', async () => {
  mockGetGRNDetails.mockResolvedValue(grnWith(1));
  mockUploadGRNImage.mockResolvedValue({ success: false, error: 'Photo is too large' });
  await mount();
  await user.press(screen.getByRole('button', { name: 'Add photo' }));
  // Once the add has been tried and its answer handled, no second read has been made.
  await waitFor(() => expect(mockUploadGRNImage).toHaveBeenCalledTimes(1));
  await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  expect(mockGetGRNDetails).toHaveBeenCalledTimes(1);
});
