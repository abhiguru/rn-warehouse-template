/** Bundle fix F38: a second tap on the same search result assigns the customer once. */
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

describe('Assigning a customer', () => {
  it('two taps on one result assign once and list it once', async () => {
    let answer: (value: { success: boolean }) => void = () => {};
    jest.mocked(adminUserService.assignCustomerToUser).mockReturnValue(new Promise(resolve => { answer = resolve as never; }) as never);
    await loadUser();
    const orchard = { id: 'c9', name: 'Orchard Traders', mobile: '9000000009', city: 'Rajkot' };
    await act(async () => { void mockSearch!.onSelect(orchard); void mockSearch!.onSelect(orchard); });
    await act(async () => { answer({ success: true }); });
    expect(adminUserService.assignCustomerToUser).toHaveBeenCalledTimes(1);
    expect(shownText().split('Orchard Traders').length - 1).toBe(1);
  });
});

describe('Disconnecting a connection (F41)', () => {
  it('shows Disconnect for an active connection and sends status false after confirming', async () => {
    await loadUser({ ...STAFF, is_service_account: true, assigned_customers: [] });
    expect(byLabel('Disconnect')).toBeTruthy();
    await press('Disconnect');
    const buttons = jest.mocked(showAlert).mock.calls.at(-1)![2] as { text?: string; onPress?: () => void }[];
    await act(async () => { buttons[1].onPress?.(); });
    expect(adminUserService.updateUserStatus).toHaveBeenCalledWith('u2', false);
  });
});

describe('A refused change on a lost connection (review fix)', () => {
  it('shows the connection alert before the reload of the user has answered', async () => {
    await loadUser();
    // The reload after the failure never answers during this test.
    jest.mocked(adminUserService.getUserDetails).mockReturnValue(new Promise(() => {}) as never);
    jest.mocked(adminUserService.assignCustomerToUser).mockResolvedValue({ success: false, code: 'NETWORK', error: 'Network request failed' } as never);
    await act(async () => { void mockSearch!.onSelect({ id: 'c9', name: 'Orchard Traders', mobile: '9000000009', city: 'Rajkot' }); });
    expect(adminUserService.getUserDetails).toHaveBeenCalledTimes(2);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toMatch(/connection|internet/i);
  });
});
