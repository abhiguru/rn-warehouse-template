/** G-60: Edit user's section titles are SectionHeader. G-34: a connection shows no role, status or customer controls. */
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

describe('Edit user sections', () => {
  it('draws Role, Status and Customer assignments through SectionHeader', async () => {
    // Assignments are for the Customer role only; for staff the section says so and has no Add button.
    await loadUser({ ...STAFF, role: 'customer' });
    const headers = tree!.root.findAllByType(SectionHeader);
    expect(headers.map(header => header.props.title)).toEqual(['Role', 'Status', 'Customer assignments']);
    expect(shownText()).toContain('ROLE');
    // The Add button of Customer assignments keeps its spoken name.
    expect(byLabel('Assign customer')).toBeTruthy();
  });

  it('says assignments are for the Customer role only, with no Add button, for a staff user', async () => {
    await loadUser();
    expect(byLabel('Assign customer')).toBeUndefined();
    expect(shownText()).toContain("Staff see every active customer. Customer assignments apply only to the Customer role.");
  });
});

describe('Edit user for a connection', () => {
  it('says it is managed by the FAS sync setup and offers no controls', async () => {
    await loadUser({ ...STAFF, id: 'u9', name: 'FAS sync', role: 'admin', mobile: '0000000000', is_service_account: true, assigned_customers: [] });
    expect(shownText()).toContain('Managed by the FAS sync setup.');
    expect(tree!.root.findAllByType(SectionHeader)).toHaveLength(0);
    expect(tree!.root.findAll(node => node.props.accessibilityLabel === 'Account active')).toHaveLength(0);
    expect(shownText()).not.toContain('Customer assignments');
  });

  it('CR-47: shows no placeholder number, in the text or the card label', async () => {
    await loadUser({ ...STAFF, id: 'u9', name: 'FAS sync', role: 'admin', mobile: '0000000000', is_service_account: true, assigned_customers: [] });
    expect(shownText()).not.toContain('+91 00000 00000');
    const labels = tree!.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
    expect(labels.some(label => label.includes('00000'))).toBe(false);
    expect(labels).toContain('FAS sync');
  });
});
