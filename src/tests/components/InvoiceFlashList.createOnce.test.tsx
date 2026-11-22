/**
 * The empty invoice list's "Create invoice" button (review 2026-10-13, invoice
 * form): a second tap before the list is back in front opened a second step 1
 * and reset the form the first one had started. One tap opens the form; the
 * button works again once the list is in front again.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import InvoiceFlashList from '@/components/lists/InvoiceFlashList';
import { getAssignedCustomerInvoices, getInvoicesList } from '@/services/invoice-service';
import { resetScreenFocus, setScreenFocused } from './focusHarness';

const mockDispatch = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedInvoiceItem: () => null }));
// The empty list's "Create invoice" button: a stand-in that draws it and calls the list's real onCreatePress.
jest.mock('@/components/list/ListEmptyState', () => ({
  ListEmptyState: ({ onCreatePress }: { onCreatePress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return onCreatePress ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Create invoice" onPress={onCreatePress}>
        <Text>Create invoice</Text>
      </Pressable>
    ) : null;
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
const mockAccess = { canManageOrders: false, assignedCustomerIds: ['customer-fictional-1'] };
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => mockAccess }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'customer', assignedCustomers: [{ id: 'customer-fictional-1', name: 'Fictional Farms' }] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const empty = { success: true, message: '', data: { invoices: [], pagination: { has_more: false } } };

beforeEach(() => {
  jest.clearAllMocks();
  resetScreenFocus();
  jest.mocked(getInvoicesList).mockReset().mockResolvedValue(empty as never);
  jest.mocked(getAssignedCustomerInvoices).mockReset().mockResolvedValue(empty as never);
});

it('opens one new invoice on a double tap, and opens another once the list is back in front', async () => {
  await render(<InvoiceFlashList />);
  const create = await screen.findByRole('button', { name: 'Create invoice' });

  // A double tap: both presses land before anything is drawn again.
  await act(async () => { void fireEvent.press(create); void fireEvent.press(create); });
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
  expect(mockDispatch).toHaveBeenCalledTimes(1);

  // The form opened (the list is hidden), then the user came back to the list.
  await act(async () => { setScreenFocused(false); });
  await act(async () => { setScreenFocused(true); });
  await fireEvent.press(screen.getByRole('button', { name: 'Create invoice' }));
  expect(router.push).toHaveBeenCalledTimes(2);
});
