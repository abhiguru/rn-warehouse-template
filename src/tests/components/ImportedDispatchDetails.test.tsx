/**
 * WH-180: the dispatch page of an imported dispatch is read-only (no Edit, Delete or photo add), and its PDF is asked
 * for by the dispatch id on a server that knows imported documents (migration 191). The real PDF service runs.
 */
import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import DispatchDetailScreen from '../../../app/dispatch-details/[id]';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';

const mockFetch = jest.fn();
const mockGetDispatchDetails = jest.fn();
const mockShowAlert = jest.fn();
const mockActive = { origin: 'https://one.example.test', instanceId: 'instance-0001' };

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
// Stand-ins for the page's parts: each draws what this test looks at (the Imported mark, the tab buttons, Edit, Delete,
// Share PDF, Add photo) and calls the real props the page hands it.
jest.mock('@/components/dispatch-details', () => ({
  DispatchHeroHeader: (props: { imported?: boolean }) => {
    const { Text } = require('react-native');
    return <Text>{props.imported === true ? 'Imported' : props.imported === false ? 'Not imported' : 'Imported unknown'}</Text>;
  },
  DispatchTabNavigator: (props: { onTabChange: (tab: string) => void }) => {
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
  DispatchOverviewTab: (props: { can_edit?: boolean; can_delete?: boolean; onSharePDF: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const button = (name: string, enabled: boolean | undefined, onPress?: () => unknown) => (
      <Pressable accessibilityRole="button" accessibilityLabel={name} disabled={enabled !== true} onPress={onPress}>
        <Text>{name}</Text>
      </Pressable>
    );
    return (
      <View>
        {button('Edit', props.can_edit)}
        {button('Delete', props.can_delete)}
        {button('Share PDF', true, props.onSharePDF)}
      </View>
    );
  },
  DispatchItemsTab: () => null,
  DispatchGRNsTab: () => null,
  DispatchInvoicesTab: () => null,
  DispatchImagesTab: (props: { onUpload?: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Text>Photos</Text>
        {typeof props.onUpload === 'function' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={props.onUpload}>
            <Text>Add photo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
  mapDispatchItems: jest.fn(() => []),
  itemTotals: jest.fn(() => ({ totalQty: 0, totalItems: 0 })),
  buildInvoiceTable: jest.fn(() => []),
}));

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });
const dispatchAnswer = (imported?: boolean) => ({
  success: true,
  data: { dispatch: { id: 'dispatch-1', disp_no: 'D1', items: [], processed_images: [], ...(imported === undefined ? {} : { imported }) } },
});

const user = () => userEvent.setup({ delay: 0 });
const open = async (imported?: boolean) => {
  mockGetDispatchDetails.mockResolvedValue(dispatchAnswer(imported));
  await render(<DispatchDetailScreen />);
  // The page has loaded when the tab buttons are drawn; then the Overview tab is opened, as before.
  await user().press(await screen.findByRole('button', { name: 'overview tab' }));
  await screen.findByRole('button', { name: 'Share PDF' });
};
const openImagesTab = async () => {
  await user().press(screen.getByRole('button', { name: 'images tab' }));
  await screen.findByText('Photos');
};
const sharePdf = () => user().press(screen.getByRole('button', { name: 'Share PDF' }));
beforeEach(() => {
  jest.clearAllMocks();
  resetFacilityRelease();
  mockFetch.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('an imported dispatch', () => {
  it('shows the Imported mark and closes Edit and Delete', async () => {
    await open(true);
    expect(screen.getByText('Imported')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('offers no photo to add', async () => {
    await open(true);
    await openImagesTab();
    expect(screen.queryByRole('button', { name: 'Add photo' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Add photo', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('asks for its PDF by id on a server with migration 191', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    mockFetch.mockResolvedValue(reply(200, { success: true, pdf_url: 'https://example.invalid/x.pdf', expires_in: 60 }));
    await open(true);
    await sharePdf();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ disp_no: 'D1', id: 'dispatch-1' });
  });

  it('shows the several-documents refusal when the server cannot tell which one is meant', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
    mockFetch.mockResolvedValue(reply(409, { success: false, error: 'Several documents', code: 'SEVERAL_DOCUMENTS' }));
    await open(true);
    await sharePdf();
    await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith('Several documents', 'Several documents have this number. Update the app.'));
    expect(downloadAndSharePDF).not.toHaveBeenCalled();
  });
});

describe('a dispatch that is not imported', () => {
  it.each([[false], [undefined]])('keeps Edit, Delete and photos (flag %s)', async flag => {
    await open(flag);
    expect(screen.getByText('Not imported')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await openImagesTab();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeOnTheScreen();
  });

  it('does not send the id to a server older than migration 191', async () => {
    setFacilityRelease(mockActive, { schemaHead: '00000000000190_x' });
    mockFetch.mockResolvedValue(reply(200, { success: true, pdf_url: 'https://example.invalid/x.pdf', expires_in: 60 }));
    await open();
    await sharePdf();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ disp_no: 'D1' });
  });
});
