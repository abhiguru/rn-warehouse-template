/** G-25 and G-26: a role changes only after a question that names the new role; the changes of Edit user end in a toast. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import UserEditScreen from '../../../app/user-edit/[id]';
import { adminUserService } from '@/services/admin-user-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { SectionHeader } from '@/components/ui/SectionHeader';

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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const flat = (children: unknown) => [children].flat().join('');
const shownText = () => tree!.root.findAllByType(Text).map(node => flat(node.props.children)).join(' | ');
/** The first element with this accessibility label that can be pressed. */
const byLabel = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => { await act(async () => { byLabel(label).props.onPress(); }); };
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as { text?: string; onPress?: () => void }[] };
};
const rowFor = (name: string) => tree!.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(name) && node.props.accessibilityActions);

jest.mock('@/services/admin-user-service', () => ({
  adminUserService: {
    getUserDetails: jest.fn(), updateUserRole: jest.fn(), updateUserStatus: jest.fn(),
    assignCustomerToUser: jest.fn(), removeCustomerAssignment: jest.fn(),
  },
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
  await act(async () => { tree = create(<UserEditScreen />); });
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

describe('changing the role', () => {
  it('asks first, with the new role described, and changes nothing until confirmed', async () => {
    await loadUser();
    await act(async () => { mockPicker!.onSelect('supervisor'); });
    expect(adminUserService.updateUserRole).not.toHaveBeenCalled();
    const { title, message, buttons } = lastAlert();
    expect(title).toBe('Make Dev Staff a supervisor?');
    expect(message).toContain('Runs the warehouse');
    expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Make supervisor']);
  });

  it('changes the role and shows a toast after "Make supervisor"', async () => {
    await loadUser();
    await act(async () => { mockPicker!.onSelect('supervisor'); });
    await act(async () => { lastAlert().buttons[1].onPress!(); });
    expect(adminUserService.updateUserRole).toHaveBeenCalledWith('u2', 'supervisor');
    expect(showToast).toHaveBeenCalledWith('Dev Staff is now a supervisor.');
    expect(jest.mocked(showAlert).mock.calls.length).toBe(1);
  });

  it('Cancel leaves the role as it was, with no toast', async () => {
    await loadUser();
    await act(async () => { mockPicker!.onSelect('admin'); });
    expect(lastAlert().title).toBe('Make Dev Staff an admin?');
    expect(adminUserService.updateUserRole).not.toHaveBeenCalled();
    expect(shownText()).toContain('Staff');
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', 'Make Dev Staff an admin?', 'Make admin'],
    ['customer', 'Make Dev Staff a customer?', 'Make customer'],
  ])('names %s in the question and the button', async (role, title, action) => {
    await loadUser();
    await act(async () => { mockPicker!.onSelect(role); });
    expect(lastAlert().title).toBe(title);
    expect(lastAlert().buttons[1].text).toBe(action);
  });

  it('says "is now staff", not "is now a staff"', async () => {
    await loadUser({ ...STAFF, role: 'customer' });
    await act(async () => { mockPicker!.onSelect('staff'); });
    expect(lastAlert().title).toBe('Make Dev Staff staff?');
    await act(async () => { lastAlert().buttons[1].onPress!(); });
    expect(showToast).toHaveBeenCalledWith('Dev Staff is now staff.');
  });
});

describe('the other changes of Edit user', () => {
  it('deactivating (after the question) and activating end in a toast', async () => {
    await loadUser();
    const toggle = tree!.root.find(node => node.props.accessibilityLabel === 'Account active' && typeof node.props.onValueChange === 'function');
    await act(async () => { toggle.props.onValueChange(false); });
    expect(lastAlert().title).toBe('Deactivate Dev Staff?');
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Deactivate user')!.onPress!(); });
    expect(showToast).toHaveBeenLastCalledWith("Dev Staff can't use the app now.");
    const again = tree!.root.find(node => node.props.accessibilityLabel === 'Account active' && typeof node.props.onValueChange === 'function');
    await act(async () => { again.props.onValueChange(true); });
    expect(showToast).toHaveBeenLastCalledWith('Dev Staff can use the app again.');
    expect(jest.mocked(showAlert).mock.calls.length).toBe(1);
  });

  it('assigning and removing a customer end in a toast', async () => {
    // Assignments are for the Customer role only.
    await loadUser({ ...STAFF, role: 'customer' });
    await act(async () => { mockSearch!.onSelect({ id: 'c2', name: 'Shah Cold Store' }); });
    expect(showToast).toHaveBeenLastCalledWith('Shah Cold Store assigned.');
    await press('Remove Acme Foods');
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Remove customer')!.onPress!(); });
    expect(showToast).toHaveBeenLastCalledWith('Acme Foods removed.');
    expect(jest.mocked(showAlert).mock.calls.length).toBe(1);
  });
});
