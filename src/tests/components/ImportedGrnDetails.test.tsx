/**
 * WH-180: the GRN details page of an imported GRN. Its details, photos and deletion are closed; its rates stay open
 * (the rates action keeps the person's right to edit). A GRN that was not imported keeps every action.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
let mockCanUpdate = true;
let mockCanDelete = true;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1' }),
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
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: mockCanUpdate, canDelete: mockCanDelete, isCustomer: false }) }));
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
// Stand-ins for the page's parts: each draws what this test looks at (the Imported mark, the tab buttons, Edit, Delete,
// Edit rates, Add photo, Delete photo) and calls the real props the page hands it.
const mockMark = (imported: unknown) => (imported === true ? 'imported' : imported === false ? 'not imported' : 'imported unknown');
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: (props: { imported?: boolean }) => {
    const { Text } = require('react-native');
    return <Text>{`Hero: ${mockMark(props.imported)}`}</Text>;
  },
  GRNTabNavigator: (props: { onTabChange: (tab: string) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        {['overview', 'images'].map(tab => (
          <Pressable key={tab} accessibilityRole="button" accessibilityLabel={`${tab} tab`} onPress={() => props.onTabChange(tab)}>
            <Text>{tab}</Text>
          </Pressable>
        ))}
      </View>
    );
  },
  GRNOverviewTab: (props: { imported?: boolean; can_edit?: boolean; can_delete?: boolean; can_edit_rates?: boolean }) => {
    const { Pressable, Text, View } = require('react-native');
    const button = (name: string, enabled: boolean | undefined) => (
      <Pressable accessibilityRole="button" accessibilityLabel={name} disabled={enabled !== true}>
        <Text>{name}</Text>
      </Pressable>
    );
    return (
      <View>
        <Text>{`Overview: ${mockMark(props.imported)}`}</Text>
        {button('Edit', props.can_edit)}
        {button('Delete', props.can_delete)}
        {button('Edit rates', props.can_edit_rates)}
      </View>
    );
  },
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: () => null,
  GRNImagesTab: (props: { onUpload?: () => unknown; onDeleteImage?: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Text>Photos</Text>
        {typeof props.onUpload === 'function' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={props.onUpload}>
            <Text>Add photo</Text>
          </Pressable>
        ) : null}
        {typeof props.onDeleteImage === 'function' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete photo" onPress={props.onDeleteImage}>
            <Text>Delete photo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
}));

const grn = (imported?: boolean) => ({
  success: true,
  data: {
    grn: {
      id: 'grn-1', gr_no: 'A1', date: '2026-10-01', items: [], statistics: {},
      processed_header_images: [{ id: 'h0', image_url: 'https://x/h0.jpg', file_name: 'h0.jpg' }, { id: 'h1', image_url: 'https://x/h1.jpg', file_name: 'h1.jpg' }],
      ...(imported === undefined ? {} : { imported }),
    },
  },
});

const user = () => userEvent.setup({ delay: 0 });
const mount = async (answer: unknown) => {
  mockGetGRNDetails.mockResolvedValue(answer);
  await render(<GRNDetailScreen />);
  // The page has loaded when the tab buttons are drawn; then the Overview tab is opened, as before.
  await user().press(await screen.findByRole('button', { name: 'overview tab' }));
  await screen.findByText(/^Overview: /);
};
const openImagesTab = async () => {
  await user().press(screen.getByRole('button', { name: 'images tab' }));
  await screen.findByText('Photos');
};
// A negative check must also see an element that is mounted but hidden.
const anywhere = { includeHiddenElements: true } as const;

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockCanUpdate = true;
  mockCanDelete = true;
});

describe('an imported GRN', () => {
  it('shows the Imported mark, closes Edit and Delete, and keeps the rates open', async () => {
    await mount(grn(true));
    expect(screen.getByText('Hero: imported')).toBeOnTheScreen();
    expect(screen.getByText('Overview: imported')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit rates' })).toBeEnabled();
  });

  it('offers no photo to add or delete', async () => {
    await mount(grn(true));
    await openImagesTab();
    expect(screen.queryByRole('button', { name: 'Add photo', ...anywhere })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Delete photo', ...anywhere })).not.toBeOnTheScreen();
  });

  it('keeps the rates closed for a person who may not edit', async () => {
    mockCanUpdate = false;
    await mount(grn(true));
    expect(screen.getByRole('button', { name: 'Edit rates' })).toBeDisabled();
  });
});

describe.each([['a GRN that was not imported', false], ['a GRN from a server that does not say (older than migration 191)', undefined]])('%s', (_name, flag) => {
  it('has no mark and keeps Edit, Delete, rates and photos', async () => {
    await mount(grn(flag));
    expect(screen.getByText('Hero: not imported')).toBeOnTheScreen();
    expect(screen.getByText('Overview: not imported')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit rates' })).toBeEnabled();
    await openImagesTab();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete photo' })).toBeOnTheScreen();
  });
});
