/**
 * WH-161 (228cfd25): the title of GRN details. A GRN with no number (a new one this phone has not sent) is titled
 * "New GRN" / "નવી આવક પાવતી"; a sent one is "GRN A0299". The header's visible title and its spoken label are one Text.
 * The real details screen runs; the header is drawn from the page's own `Stack.Screen` options. Fictional data only.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'grn-1' }),
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  // Draws the header title the page gives, as the navigator would.
  Stack: { Screen: ({ options }: { options: { headerTitle?: () => React.ReactNode } }) => options.headerTitle?.() ?? null },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(async () => ({ rpc: jest.fn(async () => ({ data: null, error: null })) })) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ Portal: ({ children }: any) => children, Snackbar: () => null }));
jest.mock('@/store/hooks', () => {
  const state = () => ({ auth: { user: { id: 'u' }, session: {}, userProfile: { role: 'admin' } }, theme: { preference: 'light', brand: 'orange' } });
  return {
    useAppDispatch: () => jest.fn(),
    useAppSelector: (selector: (s: unknown) => unknown) => selector(state()),
    useAppStore: () => ({ getState: () => state(), dispatch: jest.fn() }),
  };
});
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true, canDelete: true, isCustomer: false }) }));
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
jest.mock('@/services/invoice-service', () => ({ getGrnInvoiceRows: jest.fn(async () => ({ success: true, invoices: [] })) }));
jest.mock('@/components/common/invoiceTable', () => ({ invoiceTableFrom: jest.fn(() => []) }));
jest.mock('@/services/orderEffects', () => ({
  parseOrderEffects: jest.fn(() => []),
  previewDeleteGrn: jest.fn(),
  withOrderEffects: (text: string) => text,
}));
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
  // Draws the Create invoice button of the Invoices tab; it is busy while the page's creatingInvoice is true.
  GRNInvoicesTab: (props: { onCreateInvoice: () => void; creatingInvoice: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID="grn-create-invoice" accessibilityRole="button" accessibilityLabel="Create invoice" accessibilityState={{ busy: props.creatingInvoice }} onPress={() => props.onCreateInvoice()}>
        <Text>Create invoice</Text>
      </Pressable>
    );
  },
  GRNImagesTab: () => null,
}));


const detail = (grNo: string | null | undefined) => ({
  success: true,
  data: {
    grn: {
      id: 'grn-1', gr_no: grNo, date: '2026-10-01', items: [], statistics: {},
      processed_header_images: [],
      invoices_summary: { can_create_invoice: false, invoice_state: 'NOT_INVOICED' },
    },
  },
});
const open = async (grNo: string | null | undefined) => {
  mockGetGRNDetails.mockResolvedValue(detail(grNo));
  await render(<GRNDetailScreen />);
  // The page's loads end before the test does.
  await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
};

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('GRN details title', () => {
  it.each([[null], [undefined], [''], ['   ']])('titles a GRN with no number (%p) "New GRN"', async grNo => {
    await open(grNo);
    expect(await screen.findByRole('header', { name: 'New GRN' })).toHaveTextContent('New GRN');
    expect(screen.queryByText(/^GRN /)).not.toBeOnTheScreen();
  });

  it('titles a sent GRN with its number', async () => {
    await open('A0299');
    expect(await screen.findByRole('header', { name: 'GRN A0299' })).toHaveTextContent('GRN A0299');
    expect(screen.queryByText('New GRN')).not.toBeOnTheScreen();
  });

  it('in Gujarati, a GRN with no number is "નવી આવક પાવતી"', async () => {
    setLanguage('gu');
    await open(null);
    expect(await screen.findByRole('header', { name: 'નવી આવક પાવતી' })).toBeOnTheScreen();
  });

  it('in Gujarati, a sent GRN keeps its number in 0-9', async () => {
    setLanguage('gu');
    await open('A0299');
    expect(await screen.findByRole('header', { name: 'આવક પાવતી A0299' })).toBeOnTheScreen();
  });
});
