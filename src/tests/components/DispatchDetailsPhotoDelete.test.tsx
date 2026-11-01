/** Dispatch details, Images tab: who may delete a photo of a saved dispatch, and what confirming does (D26). */
import React from 'react';
import { act, create } from 'react-test-renderer';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetDispatchDetails = jest.fn();
const mockShowAlert = jest.fn();
const mockDeleteDispatchImage = jest.fn();
let mockPermissions = { canUpdate: true, canDelete: true, isCustomer: false };
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
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => mockPermissions }));
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
  uploadDispatchImage: jest.fn(),
  deleteDispatchImage: (...args: unknown[]) => mockDeleteDispatchImage(...args),
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
  mockPermissions = { canUpdate: true, canDelete: true, isCustomer: false };
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

describe('deleting a photo of a saved dispatch (D26)', () => {
  const image = { id: 'img-1', image_url: 'dispatch/d1/img-1.jpg' };

  it('a customer gets no delete button on the photos', async () => {
    mockPermissions = { canUpdate: false, canDelete: false, isCustomer: true };
    await mountOnImages();
    expect(mockImagesProps.onDelete).toBeUndefined();
  });

  it('a person who can add photos can delete one: it asks first, then deletes it and reads the dispatch again', async () => {
    mockDeleteDispatchImage.mockResolvedValue({ success: true });
    await mountOnImages();
    expect(typeof mockImagesProps.onDelete).toBe('function');
    const readsBefore = mockGetDispatchDetails.mock.calls.length;

    await act(async () => { mockImagesProps.onDelete(image); });
    // Nothing is deleted before the question is answered.
    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockDeleteDispatchImage).not.toHaveBeenCalled();
    const buttons = mockShowAlert.mock.calls[0][2] as { text: string; style?: string; onPress: () => Promise<void> }[];
    const confirm = buttons.find((button) => button.style === 'destructive')!;

    await act(async () => { await confirm.onPress(); });

    expect(mockDeleteDispatchImage).toHaveBeenCalledWith('img-1', 'dispatch/d1/img-1.jpg');
    expect(mockGetDispatchDetails.mock.calls.length).toBe(readsBefore + 1);
  });

  it('cancelling the question deletes nothing', async () => {
    await mountOnImages();
    await act(async () => { mockImagesProps.onDelete(image); });
    const buttons = mockShowAlert.mock.calls[0][2] as { style?: string; onPress: () => void }[];
    await act(async () => { buttons.find((button) => button.style === 'cancel')!.onPress(); });
    expect(mockDeleteDispatchImage).not.toHaveBeenCalled();
  });
});
