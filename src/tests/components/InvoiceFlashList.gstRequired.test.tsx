/**
 * WH-205 (contract product/tech/bills-need-gst-details.md, section 3): the empty invoice list's "Create invoice" button asks
 * `can_make_bills` first. With no GST details the person gets the alert of their role and the form does not open (and the
 * form is not reset); when allowed, or when the question gets no answer, it opens as today. The real list and the real gate
 * run; only the facility's `rpc` answers. Fictional data only.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import { getAssignedCustomerInvoices, getInvoicesList } from '@/services/invoice-service';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { resetScreenFocus } from './focusHarness';

const mockDispatch = jest.fn();
let mockRole = 'admin';
let mockAllowed: boolean | 'fail' = false;
const mockRpc = jest.fn(async (name: string) => {
  if (name !== 'can_make_bills') return { data: null, error: { message: `Unexpected rpc ${name}` } };
  if (mockAllowed === 'fail') return { data: null, error: { message: 'Network request failed' } };
  return { data: { success: true, data: { allowed: mockAllowed } }, error: null };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedInvoiceItem: () => null }));
// The empty list's "Create invoice" button, kept so the test can tap it.
let mockOnCreatePress: (() => void | Promise<void>) | undefined;
jest.mock('@/components/list/ListEmptyState', () => ({
  ListEmptyState: ({ onCreatePress }: { onCreatePress?: () => void }) => {
    mockOnCreatePress = onCreatePress;
    return null;
  },
}));
jest.mock('@/components/ErrorBoundary', () => ({ ErrorStateView: () => null }));
jest.mock('@/features/filters/configs', () => ({ INVOICE_FILTERS: { listKey: 'invoice-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({}),
}));
const mockFilters: { request: Record<string, unknown>; sort?: { field: string; order: string }; values: object } = {
  request: { p_sort_field: 'inv_date', p_sort_direction: 'desc' },
  values: {},
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/services/invoice-service', () => ({
  getInvoicesList: jest.fn(),
  getAssignedCustomerInvoices: jest.fn(),
}));
const mockAssigned: string[] = [];
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole, canManageOrders: true, assignedCustomerIds: mockAssigned }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/store/hooks', () => {
  // One object per role, so that a render does not see a new profile each time.
  const states: Record<string, unknown> = {};
  const state = () => (states[mockRole] ??= { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'profile-fictional', role: mockRole } } });
  return {
    useAppDispatch: () => mockDispatch,
    useAppSelector: (selector: (s: unknown) => unknown) => selector(state()),
  };
});

const ADMIN_ALERT = "Save your GST details first. Bills can't be made until then.";
const STAFF_ALERT = "Ask an administrator to save the GST details. Bills can't be made until then.";
const empty = { success: true, message: '', data: { invoices: [], pagination: { has_more: false } } };

let renderer: ReturnType<typeof create> | undefined;
const mount = async (role: string) => {
  mockRole = role;
  await act(async () => { renderer = create(<InvoiceFlashList />); });
  expect(mockOnCreatePress).toBeDefined();
};
const tapCreate = async () => { await act(async () => { await mockOnCreatePress!(); }); };
const lastAlert = () => jest.mocked(showAlert).mock.calls.at(-1)!;
const buttonTexts = () => (lastAlert()[2] ?? []).map((button) => button.text);

beforeEach(() => {
  jest.clearAllMocks();
  resetScreenFocus();
  mockOnCreatePress = undefined;
  mockAllowed = false;
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc: mockRpc } as never);
  jest.mocked(getInvoicesList).mockReset().mockResolvedValue(empty as never);
  jest.mocked(getAssignedCustomerInvoices).mockReset().mockResolvedValue(empty as never);
});
afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
});

describe('the empty Invoices list, Create invoice, with no GST details', () => {
  it('shows an administrator the alert with Cancel and Open GST details; the form is neither reset nor opened', async () => {
    await mount('admin');
    await tapCreate();

    expect(mockRpc.mock.calls.filter(([name]) => name === 'can_make_bills')).toHaveLength(1);
    expect(lastAlert()[0]).toBe('No bills yet');
    expect(lastAlert()[1]).toBe(ADMIN_ALERT);
    expect(buttonTexts()).toEqual(['Cancel', 'Open GST details']);
    expect(router.push).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();

    await act(async () => { (lastAlert()[2] ?? []).find((button) => button.text === 'Open GST details')!.onPress?.(); });
    expect(router.push).toHaveBeenCalledWith('/gst-details');
  });

  it.each(['supervisor', 'staff'])('shows %s the ask-an-administrator alert with only OK', async (role) => {
    await mount(role);
    await tapCreate();

    expect(lastAlert()[1]).toBe(STAFF_ALERT);
    expect(buttonTexts()).toEqual(['OK']);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('the empty Invoices list, Create invoice, when bills are allowed or the answer is unknown', () => {
  it.each(['admin', 'supervisor', 'staff'])('opens the form for %s when allowed, with no alert', async (role) => {
    mockAllowed = true;
    await mount(role);
    await tapCreate();

    expect(showAlert).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
  });

  it('opens the form as today when can_make_bills fails (the server still refuses a save)', async () => {
    mockAllowed = 'fail';
    await mount('admin');
    await tapCreate();

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
  });

  it('asks again on the next tap once the details are saved', async () => {
    await mount('admin');
    await tapCreate();
    expect(router.push).not.toHaveBeenCalled();

    mockAllowed = true;
    jest.mocked(showAlert).mockClear();
    await tapCreate();

    expect(mockRpc.mock.calls.filter(([name]) => name === 'can_make_bills')).toHaveLength(2);
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
  });
});
