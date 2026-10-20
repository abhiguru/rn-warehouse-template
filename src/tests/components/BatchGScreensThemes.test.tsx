/**
 * Renders the customer, item, user, settings, profile and legal screens in all
 * four themes (Orange and GCSA, light and dark) and checks that each paints
 * its themed background and never falls back to a legacy colour.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'i1', userId: 'u1', itemId: 'i1', customerId: 'c1', item_id: 'i1', price_type: 'monthly' }),
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: require('react-native').View,
  Swipeable: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/GenericStepIndicatorHeader', () => ({ GenericStepIndicatorHeader: () => null }));
jest.mock('@/components/RolePickerBottomSheet', () => ({ RolePickerBottomSheet: () => null }));
jest.mock('@/components/common', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({
  forceLogoutOnInvalidToken: jest.fn(),
  logout: Object.assign(jest.fn(), { fulfilled: { type: 'auth/logout/fulfilled', match: () => false } }),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
  setUserProfile: jest.fn(),
}));
const mockPrice = {
  id: 'p1', item_id: 'i1', item_name: 'Potato', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: 12, weight_min: 0, weight_max: 50, labour_rate: 2, tax_percent: 18,
  effective_from: '2026-01-01', effective_to: null,
};
jest.mock('@/services/item-pricing-service', () => ({
  getItemStoragePrices: jest.fn(async () => ({
    success: true,
    data: [mockPrice],
    pagination: { total_count: 1, limit: 50, offset: 0, has_more: false },
  })),
  replaceItemRates: jest.fn(),
  // The item pricing list and pages read the active items and the rates of the facility.
  listActiveItems: jest.fn(async () => [{ id: 'i1', name: 'Potato', packaging: 'Bag' }]),
  listAllRates: jest.fn(async () => [mockPrice]),
  listItemRates: jest.fn(async () => [mockPrice]),
  getItemGrnRates: jest.fn(async () => []),
}));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => null }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
// The customer picker of the item page is a sheet opened on demand; its hook chain needs the whole store.
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@gorhom/bottom-sheet', () => {
  const RN = require('react-native');
  return {
    BottomSheetModal: () => null,
    BottomSheetFlatList: RN.FlatList,
    BottomSheetTextInput: RN.TextInput,
    BottomSheetBackdrop: () => null,
    BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('@react-native-community/datetimepicker', () => () => null);
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/customer-service', () => ({
  customerService: {
    searchCustomers: jest.fn(),
    getCustomerById: jest.fn(async () => ({
      success: true,
      message: '',
      data: { id: 'i1', name: 'Patel Traders', mobile: '9876543210', city: 'Rajkot', state: 'Gujarat', pincode: '360001', active: true, created_at: '2026-01-01' },
    })),
  },
}));
jest.mock('@/services/item-service', () => ({
  itemService: {
    getItemById: jest.fn(async () => ({
      success: true,
      data: { id: 'i1', name: 'Potato', packaging: 'Bag', description: '', active: true },
    })),
    getItemList: jest.fn(async () => ({
      success: true,
      data: [{ id: 'i1', name: 'Potato', packaging: 'Bag', description: 'Jyoti', active: false }],
      pagination: { total_count: 1 },
    })),
  },
}));
jest.mock('@/services/admin-user-service', () => ({
  adminUserService: {
    getUserDetails: jest.fn(async () => ({
      success: true,
      data: {
        id: 'u3', name: 'Ravi', mobile: '9876543210', role: 'staff', active: true,
        assigned_customers: [{ customer_id: 'c1', customer_name: 'Patel Traders', customer_mobile: '9812345678', customer_city: 'Rajkot' }],
      },
    })),
    getUsersList: jest.fn(async () => ({
      success: true,
      data: {
        users: [{ id: 'u2', name: 'Ravi', role: 'staff', mobile: '9876543210', active: true, assigned_customers_count: 2 }],
        pagination: { total_count: 1 },
      },
    })),
  },
}));
jest.mock('@/services/user-service', () => ({
  UserService: {
    getUserById: jest.fn(async () => ({
      success: true,
      data: {
        name: 'Asha', email: '', mobile: '9876543210', supervisor: false, active: true, role: 'staff',
        assignedCustomers: [{ id: 'c1', name: 'Patel Traders', mobile: '9812345678', city: 'Rajkot', active: true }],
        assignedCustomersStatus: 'loaded',
      },
    })),
    getAccessibleCustomers: jest.fn(async () => ({ status: 'loaded', customers: [] })),
    updateUser: jest.fn(),
  },
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));

import SettingsScreen from '../../../app/settings';
import ProfileScreen from '../../../app/profile';
import PrivacyPolicyScreen from '../../../app/privacy-policy';
import TermsOfServiceScreen from '../../../app/terms-of-service';
import ItemsScreen from '../../../app/items';
import ItemFormScreen from '../../../app/item-form';
import UsersScreen from '../../../app/users';
import ItemEditScreen from '../../../app/item-edit/[id]';
import ItemPricingScreen from '../../../app/item-pricing';
import ItemRatesPageScreen from '../../../app/item-rates/[itemId]';
import RateStopScreen from '../../../app/item-rates/stop';
import CustomerRatePageScreen from '../../../app/item-rates/[itemId]/customer/[customerId]';
import UserEditScreen from '../../../app/user-edit/[id]';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';
import HelpScreen from '../../../app/help';
import { clearOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import CustomerPageScreen from '../../../app/customer/[id]';
import CustomerFormScreen from '../../../app/customer-form';
import CustomerEditScreen from '../../../app/customer-edit/[id]';
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';

const LEGACY = ['#f69000', '#fff4e6', '#ffffff', '#000000', '#000', '#fff'];

const SCREENS: Array<[string, () => React.ReactElement, string | ((t: ReturnType<typeof getTokens>) => string)]> = [
  ['settings', () => <SettingsScreen />, t => t.background.grouped],
  ['profile', () => <ProfileScreen />, t => t.background.grouped],
  ['privacy policy', () => <PrivacyPolicyScreen />, t => t.background.base],
  ['terms of service', () => <TermsOfServiceScreen />, t => t.background.base],
  ['items', () => <ItemsScreen />, t => t.background.base],
  ['item form', () => <ItemFormScreen />, t => t.background.base],
  ['users', () => <UsersScreen />, t => t.background.base],
  ['user edit', () => <UserEditScreen />, t => t.background.base],
  ['item edit', () => <ItemEditScreen />, t => t.background.base],
  ['item pricing', () => <ItemPricingScreen />, t => t.background.base],
  ['item rates page', () => <ItemRatesPageScreen />, t => t.background.base],
  ['customer rate page', () => <CustomerRatePageScreen />, t => t.background.base],
  ['rate stop', () => <RateStopScreen />, t => t.background.base],
  ['own profile edit', () => <OwnProfileEditScreen />, t => t.background.base],
  ['help', () => <HelpScreen />, t => t.background.grouped],
  ['customer page', () => <CustomerPageScreen />, t => t.background.base],
  ['customer add form', () => <CustomerFormScreen />, t => t.background.base],
  ['customer edit form', () => <CustomerEditScreen />, t => t.background.base],
  [
    'customer order group card',
    () => (
      <CustomerOrderGroupCard
        order={{ id: 'o1', customer_id: 'c1', customer: { name: 'Patel Traders' }, item_count: 2, quantity_sum: 40 } as never}
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    ),
    t => t.surface.card,
  ],
];

const MODES: Mode[] = ['light', 'dark'];

function styleValues(tree: ReactTestRenderer, key: 'backgroundColor' | 'color'): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string' && !!node.props.style)
    .flatMap(node =>
      [node.props.style]
        .flat(Infinity)
        .filter(Boolean)
        .map((s: Record<string, string>) => s[key])
        .filter(Boolean)
    );
}

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as [Brand, Mode])))('%s %s', (brand, mode) => {
  const tokens = getTokens(brand, mode);

  it.each(SCREENS)('renders %s with themed colours', async (_name, render, background) => {
    mockState = {
      theme: { preference: mode, brand },
      auth: { user: { id: 'a1' }, userProfile: { id: 'u1', name: 'Asha', role: 'admin', mobile: '9876543210' } },
      // Item pricing reads its filters from here: one applied, as before.
      listFilters: { lists: { 'item-rates-list': { values: { priceType: 'monthly' } } } },
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(render());
    });
    const backgrounds = styleValues(tree, 'backgroundColor');
    const expected = typeof background === 'function' ? background(tokens) : background;
    expect(backgrounds).toContain(expected);
    const colours = [...backgrounds, ...styleValues(tree, 'color')].map(c => String(c).toLowerCase());
    // Token colours of every brand in this mode (Settings shows both brands' swatches).
    const allowed = new Set(
      BRANDS.flatMap(b => JSON.stringify(getTokens(b, mode)).match(/#[0-9a-f]{3,8}/gi) ?? []).map(c =>
        c.toLowerCase()
      )
    );
    for (const c of colours) {
      if (c.startsWith('#') && LEGACY.includes(c)) {
        expect(allowed.has(c)).toBe(true);
      }
    }
    expect(tree.root.findAllByType(Text).length).toBeGreaterThan(0);
    await act(async () => {
      tree.unmount();
    });
  });
});

// ---------------------------------------------------------------------------
// What each role is offered on these screens (backend docs/STAFF_GRN_POLICY.md,
// "Roles after migration 45"). The rows and controls are read from the rendered screen.
// ---------------------------------------------------------------------------
describe('what each role is offered', () => {
  const { adminUserService } = jest.requireMock('@/services/admin-user-service') as {
    adminUserService: { getUserDetails: jest.Mock };
  };
  const signedInAs = (role: string, id = 'u1') => {
    mockState = {
      theme: { preference: 'light', brand: 'orange' },
      auth: { user: { id: 'a1' }, userProfile: { id, name: 'Asha', role, mobile: '9876543210' } },
      listFilters: { lists: {} },
    };
  };
  const renderScreen = async (element: React.ReactElement) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(element);
    });
    return tree;
  };

  // The Sensors row also needs the facility's `sensors` capability (its public config).
  const FACILITY = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
  it.each([
    ['admin', true, ['customers', 'enrollmentReview', 'items', 'users', 'itemPricing', 'standardRate', 'sensors']],
    ['supervisor', true, ['customers', 'items', 'users', 'itemPricing', 'standardRate', 'sensors']],
    ['staff', true, ['sensors']],
    ['customer', true, []],
    ['admin', false, ['customers', 'enrollmentReview', 'items', 'users', 'itemPricing', 'standardRate']],
    ['staff', false, []],
  ])('Settings feature rows for %s, sensors capability %s: %j', async (role, sensors, rows) => {
    signedInAs(role);
    await saveOperatorServer(FACILITY, false);
    setFacilityCapabilities(FACILITY, { sensors });
    const tree = await renderScreen(<SettingsScreen />);
    const shown = tree.root
      .findAll(node => typeof node.type !== 'string' && String(node.props.testID ?? '').startsWith('settings-feature-'))
      .map(node => String(node.props.testID).replace('settings-feature-', ''));
    expect([...new Set(shown)]).toEqual(rows);
    await act(async () => { tree.unmount(); });
    resetFacilityCapabilities();
    await clearOperatorServer();
  });

  it.each([
    // caller, caller id, target role, target id, role and status open, assignments open
    ['admin', 'u1', 'staff', 'u3', true, true],
    ['admin', 'u1', 'admin', 'u9', true, true],
    ['admin', 'u1', 'admin', 'u1', false, true],
    ['supervisor', 'u1', 'staff', 'u3', true, true],
    ['supervisor', 'u1', 'customer', 'u3', true, true],
    ['supervisor', 'u1', 'supervisor', 'u4', true, true],
    // The server refuses a supervisor on an administrator and on the own profile.
    ['supervisor', 'u1', 'admin', 'u9', false, false],
    ['supervisor', 'u1', 'supervisor', 'u1', false, false],
  ])('%s (%s) on a %s (%s): role and status %s, assignments %s', async (callerRole, callerId, targetRole, targetId, canEdit, canAssign) => {
    signedInAs(callerRole, callerId);
    // The route id in this file's router stand-in is 'i1'; the loaded user decides the target.
    adminUserService.getUserDetails.mockResolvedValueOnce({
      success: true,
      data: {
        id: targetId, name: 'Ravi', mobile: '9876543210', role: targetRole, active: true,
        assigned_customers: [{ customer_id: 'c1', customer_name: 'Patel Traders', customer_mobile: '9812345678', customer_city: 'Rajkot' }],
      },
    });
    const tree = await renderScreen(<UserEditScreen />);
    const byLabel = (label: string) =>
      tree.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label);
    const roleRow = tree.root.findAll(
      node => typeof node.type !== 'string' && String(node.props.accessibilityLabel ?? '').startsWith('User role,') && node.props.accessibilityState
    )[0];
    expect(roleRow.props.accessibilityState.disabled).toBe(!canEdit);
    const statusSwitch = byLabel('Account active')[0];
    expect(statusSwitch.props.disabled).toBe(!canEdit);
    expect(byLabel('Assign customer').length > 0).toBe(canAssign);
    expect(byLabel('Remove Patel Traders').length > 0).toBe(canAssign);
    await act(async () => { tree.unmount(); });
  });
});
