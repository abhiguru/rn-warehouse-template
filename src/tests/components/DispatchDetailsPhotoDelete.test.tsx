/** Dispatch details, Images tab: who may delete a photo of a saved dispatch, and what confirming does (D26). */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetDispatchDetails = jest.fn();
const mockShowAlert = jest.fn();
const mockDeleteDispatchImage = jest.fn();
let mockPermissions = { canUpdate: true, canDelete: true, isCustomer: false };

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
  // Draws the tab buttons the page's tab bar draws, and calls the page's own onTabChange.
  DispatchTabNavigator: (props: { onTabChange: (tab: string) => void }) => {
    const { Pressable, Text } = require('react-native');
    return ['overview', 'images'].map((tab) => (
      <Pressable key={tab} accessibilityRole="button" accessibilityLabel={`${tab} tab`} onPress={() => props.onTabChange(tab)}>
        <Text>{tab}</Text>
      </Pressable>
    ));
  },
  DispatchOverviewTab: () => null,
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  // Draws Add photo and, only when the page passes onDelete, a Delete photo button that calls it.
  DispatchImagesTab: (props: { onUpload: () => void; onDelete?: (image: { id: string; image_url: string }) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={() => props.onUpload()}>
          <Text>Add photo</Text>
        </Pressable>
        {props.onDelete && (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete photo" onPress={() => props.onDelete?.({ id: 'img-1', image_url: 'dispatch/d1/img-1.jpg' })}>
            <Text>Delete photo</Text>
          </Pressable>
        )}
      </>
    );
  },
  DispatchInvoicesTab: () => null,
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  setLanguage('en');
  mockPermissions = { canUpdate: true, canDelete: true, isCustomer: false };
  mockGetDispatchDetails.mockResolvedValue({ success: true, data: { dispatch: { id: 'dispatch-1', disp_no: 'D1', items: [], processed_images: [] } } });
});

const user = userEvent.setup({ delay: 0 });
const mountOnImages = async () => {
  await render(<DispatchDetailScreen />);
  await user.press(screen.getByRole('button', { name: 'images tab' }));
};
const deleteButton = () => screen.queryByRole('button', { name: 'Delete photo' });

describe('deleting a photo of a saved dispatch (D26)', () => {
  it('a customer gets no delete button on the photos', async () => {
    mockPermissions = { canUpdate: false, canDelete: false, isCustomer: true };
    await mountOnImages();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeOnTheScreen();
    expect(deleteButton()).not.toBeOnTheScreen();
  });

  it('a person who can add photos can delete one: it asks first, then deletes it and reads the dispatch again', async () => {
    mockDeleteDispatchImage.mockResolvedValue({ success: true });
    await mountOnImages();
    const readsBefore = mockGetDispatchDetails.mock.calls.length;

    await user.press(screen.getByRole('button', { name: 'Delete photo' }));
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
    await user.press(screen.getByRole('button', { name: 'Delete photo' }));
    const buttons = mockShowAlert.mock.calls[0][2] as { style?: string; onPress: () => void }[];
    await act(async () => { buttons.find((button) => button.style === 'cancel')!.onPress(); });
    expect(mockDeleteDispatchImage).not.toHaveBeenCalled();
  });
});
