/** G-60: Edit user's section titles are SectionHeader. G-34: a connection shows no role, status or customer controls. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import UserEditScreen from '../../../app/user-edit/[id]';
import { adminUserService } from '@/services/admin-user-service';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useFocusEffect: require('./focusHarness').useFocusEffect,
  useLocalSearchParams: () => ({ id: 'u2' }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@/services/item-service', () => ({
  itemService: {
    getItemList: jest.fn(),
    getItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    toggleItemActive: jest.fn(),
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));

// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const sectionTitles = () =>
  screen.queryAllByRole('header', everything).map(node => node.props.accessibilityLabel as string | undefined).filter((label): label is string => label !== undefined);

jest.mock('@/services/admin-user-service', () => ({
  adminUserService: {
    getUserDetails: jest.fn(), updateUserRole: jest.fn(), updateUserStatus: jest.fn(),
    assignCustomerToUser: jest.fn(), removeCustomerAssignment: jest.fn(),
  },
}));
// An older backend has no signed-in devices list: the section is left out, and these tests are about the others.
jest.mock('@/services/session-devices-service', () => ({
  listUserSessions: jest.fn(async () => ({ success: false, unsupported: true, message: '' })),
  revokeSession: jest.fn(),
}));
jest.mock('@/services/customer-service', () => ({ customerService: { searchCustomers: jest.fn() } }));
let mockPicker: { onSelect: (role: string) => void } | undefined;
jest.mock('@/components/RolePickerBottomSheet', () => ({ RolePickerBottomSheet: (props: { onSelect: (role: string) => void }) => { mockPicker = props; return null; } }));
let mockSearch: { onSelect: (customer: unknown) => void } | undefined;
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: (props: { onSelect: (customer: unknown) => void }) => { mockSearch = props; return null; } }));

const STAFF = {
  id: 'u2', auth_user_id: 'a2', name: 'Dev Staff', display_name: null, mobile: '9000000002', role: 'staff', active: true,
  created_at: '2026-01-01', updated_at: '2026-01-01', assigned_customers_count: 1,
  assigned_customers: [{ customer_id: 'c1', customer_name: 'Acme Foods', customer_mobile: null, customer_city: null, assigned_at: '2026-01-01', assigned_by_name: null }],
};
const loadUser = async (details: Record<string, unknown> = STAFF) => {
  jest.mocked(adminUserService.getUserDetails).mockResolvedValue({ success: true, data: details } as never);
  await render(<UserEditScreen />);
};
beforeEach(() => {
  jest.clearAllMocks();
  mockPicker = undefined;
  mockSearch = undefined;
  jest.mocked(adminUserService.updateUserRole).mockResolvedValue({ success: true } as never);
  jest.mocked(adminUserService.updateUserStatus).mockResolvedValue({ success: true } as never);
  jest.mocked(adminUserService.assignCustomerToUser).mockResolvedValue({ success: true } as never);
  jest.mocked(adminUserService.removeCustomerAssignment).mockResolvedValue({ success: true } as never);
});

describe('Edit user sections', () => {
  it('draws Role, Status and Customer assignments through SectionHeader', async () => {
    // Assignments are for the Customer role only; for staff the section says so and has no Add button.
    await loadUser({ ...STAFF, role: 'customer' });
    // SectionHeader draws a header named by its title.
    expect(sectionTitles()).toEqual(['Role', 'Status', 'Customer assignments']);
    expect(screen.getAllByText('ROLE')[0]).toBeOnTheScreen();
    // The Add button of Customer assignments keeps its spoken name.
    expect(screen.getAllByLabelText('Assign customer')[0]).toBeOnTheScreen();
  });

  it('says assignments are for the Customer role only, with no Add button, for a staff user', async () => {
    await loadUser();
    expect(screen.queryAllByLabelText('Assign customer', everything)).toHaveLength(0);
    expect(screen.getAllByText(/Staff see every active customer\. Customer assignments apply only to the Customer role\./)[0]).toBeOnTheScreen();
  });
});

describe('Edit user for a connection', () => {
  it('says it is managed by the FAS sync setup and offers no controls', async () => {
    await loadUser({ ...STAFF, id: 'u9', name: 'FAS sync', role: 'admin', mobile: '0000000000', is_service_account: true, assigned_customers: [] });
    expect(screen.getAllByText(/Managed by the FAS sync setup\./)[0]).toBeOnTheScreen();
    expect(sectionTitles()).toHaveLength(0);
    expect(screen.queryAllByLabelText('Account active', everything)).toHaveLength(0);
    expect(screen.queryAllByText(/Customer assignments/, everything)).toHaveLength(0);
  });

  it('CR-47: shows no placeholder number, in the text or the card label', async () => {
    await loadUser({ ...STAFF, id: 'u9', name: 'FAS sync', role: 'admin', mobile: '0000000000', is_service_account: true, assigned_customers: [] });
    expect(screen.queryAllByText(/\+91 00000 00000/, everything)).toHaveLength(0);
    const labels = screen.queryAllByLabelText(/./, everything).map(node => node.props.accessibilityLabel as string);
    expect(labels.some(label => label.includes('00000'))).toBe(false);
    expect(labels).toContain('FAS sync');
  });
});

describe('Edit user: signed-in devices', () => {
  const { listUserSessions } = jest.requireMock('@/services/session-devices-service');
  const showsDevices = () => screen.queryAllByTestId('signed-in-devices', everything).length > 0;

  it('is shown to an administrator for a staff user when the backend lists them', async () => {
    listUserSessions.mockResolvedValueOnce({ success: true, sessions: [] });
    await loadUser();
    expect(showsDevices()).toBe(true);
  });

  it('is not asked for a supervisor looking at an administrator', async () => {
    mockState = { ...mockState, auth: { userProfile: { id: 'u1', role: 'supervisor', name: 'Dev Supervisor' } } };
    listUserSessions.mockClear();
    await loadUser({ ...STAFF, role: 'admin' });
    expect(listUserSessions).not.toHaveBeenCalled();
    expect(showsDevices()).toBe(false);
    mockState = { ...mockState, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
  });
});
