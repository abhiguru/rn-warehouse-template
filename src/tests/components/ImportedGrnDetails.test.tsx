/**
 * WH-180: the GRN details page of an imported GRN. Its details, photos and deletion are closed; its rates stay open
 * (the rates action keeps the person's right to edit). A GRN that was not imported keeps every action.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import GRNDetailScreen from '../../../app/grn-details/[id]';
import { setLanguage } from '@/i18n';

const mockGetGRNDetails = jest.fn();
let mockOverview: any;
let mockHero: any;
let mockImagesProps: any;
let mockTabProps: any;
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
jest.mock('@/components/grn-details', () => ({
  GRNHeroHeader: (props: unknown) => { mockHero = props; return null; },
  GRNTabNavigator: (props: unknown) => { mockTabProps = props; return null; },
  GRNOverviewTab: (props: unknown) => { mockOverview = props; return null; },
  GRNItemsTab: () => null,
  GRNDispatchesTab: () => null,
  GRNInvoicesTab: () => null,
  GRNImagesTab: (props: unknown) => { mockImagesProps = props; return null; },
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

let tree: ReturnType<typeof create> | undefined;
const mount = async (answer: unknown) => {
  mockGetGRNDetails.mockResolvedValue(answer);
  await act(async () => { tree = create(<GRNDetailScreen />); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
  await act(async () => { mockTabProps.onTabChange('images'); });
  await act(async () => { mockTabProps.onTabChange('overview'); });
};

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockCanUpdate = true;
  mockCanDelete = true;
  mockOverview = mockHero = mockImagesProps = undefined;
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

describe('an imported GRN', () => {
  it('shows the Imported mark, closes Edit and Delete, and keeps the rates open', async () => {
    await mount(grn(true));
    expect(mockHero.imported).toBe(true);
    expect(mockOverview.imported).toBe(true);
    expect(mockOverview.can_edit).toBe(false);
    expect(mockOverview.can_delete).toBe(false);
    expect(mockOverview.can_edit_rates).toBe(true);
  });

  it('offers no photo to add or delete', async () => {
    await mount(grn(true));
    await act(async () => { mockTabProps.onTabChange('images'); });
    expect(mockImagesProps.onUpload).toBeUndefined();
    expect(mockImagesProps.onDeleteImage).toBeUndefined();
  });

  it('keeps the rates closed for a person who may not edit', async () => {
    mockCanUpdate = false;
    await mount(grn(true));
    expect(mockOverview.can_edit_rates).toBe(false);
  });
});

describe.each([['a GRN that was not imported', false], ['a GRN from a server that does not say (older than migration 191)', undefined]])('%s', (_name, flag) => {
  it('has no mark and keeps Edit, Delete, rates and photos', async () => {
    await mount(grn(flag));
    expect(mockHero.imported).toBe(false);
    expect(mockOverview.imported).toBe(false);
    expect(mockOverview.can_edit).toBe(true);
    expect(mockOverview.can_delete).toBe(true);
    expect(mockOverview.can_edit_rates).toBe(true);
    await act(async () => { mockTabProps.onTabChange('images'); });
    expect(typeof mockImagesProps.onUpload).toBe('function');
    expect(typeof mockImagesProps.onDeleteImage).toBe('function');
  });
});
