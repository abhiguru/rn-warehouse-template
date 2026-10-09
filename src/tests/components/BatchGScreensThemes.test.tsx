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
  useLocalSearchParams: () => ({ id: 'i1', userId: 'u1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useFocusEffect: jest.fn() }));
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
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  setUserProfile: jest.fn(),
}));
const mockPrice = {
  id: 'p1', item_id: 'i1', item_name: 'Potato', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: 12, weight_min: 0, weight_max: 50, labour_rate: 2, tax_percent: 18,
  effective_from: '2026-01-01', effective_to: '2026-02-01',
};
jest.mock('@/services/item-pricing-service', () => ({
  getItemStoragePrices: jest.fn(async () => ({
    success: true,
    data: [mockPrice],
    pagination: { total_count: 1, limit: 50, offset: 0, has_more: false },
  })),
  deleteItemStoragePrice: jest.fn(),
  createItemStoragePrice: jest.fn(),
  updateItemStoragePrice: jest.fn(),
}));
const mockFilterState = {
  debouncedValues: { priceType: 'monthly' },
  activeFilterCount: 1,
  updateFilter: () => undefined,
  clearAllFilters: () => undefined,
};
jest.mock('@/hooks/useFilterState', () => ({ useFilterState: () => mockFilterState }));
jest.mock('@/components/filters', () => ({ GenericFilterModal: () => null }));
jest.mock('@/components/list/ListSkeletonCard', () => ({ ListSkeletonCard: () => null }));
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
jest.mock('@/services/customer-service', () => ({ customerService: { searchCustomers: jest.fn() } }));
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
      },
    })),
    updateUser: jest.fn(),
  },
}));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));
jest.mock('@/hooks/useCustomerForm', () => ({
  useCustomerForm: () => ({
    formData: {
      name: 'Patel Traders', mobile: '9876543210', email: '', city: 'Rajkot', state: 'Gujarat', pincode: '360001',
      address: '', gst: '', pan: '', contact_name: '', contact_mobile: '', contact_email: '',
      document_images: [], document_urls: [],
    },
    currentStep: 1,
    validationErrors: { email: 'Enter an email address like name@example.com.' },
    isLoading: false,
    isSubmitting: false,
    isCreateMode: true,
    isDirty: false,
  }),
}));

import SettingsScreen from '../../../app/settings';
import ProfileScreen from '../../../app/profile';
import PrivacyPolicyScreen from '../../../app/privacy-policy';
import TermsOfServiceScreen from '../../../app/terms-of-service';
import ItemsScreen from '../../../app/items';
import ItemFormScreen from '../../../app/item-form';
import UsersScreen from '../../../app/users';
import ItemEditScreen from '../../../app/item-edit/[id]';
import ItemPricingScreen from '../../../app/item-pricing';
import ItemPricingFormScreen from '../../../app/item-pricing-form';
import UserEditScreen from '../../../app/user-edit/[id]';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';
import { CustomerBasicInfoStep } from '@/features/customer/screens/CustomerBasicInfoStep';
import { CustomerDetailsStep } from '@/features/customer/screens/CustomerDetailsStep';
import { CustomerReviewStep } from '@/features/customer/screens/CustomerReviewStep';
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
  ['item pricing form', () => <ItemPricingFormScreen />, t => t.background.base],
  ['own profile edit', () => <OwnProfileEditScreen />, t => t.background.base],
  ['customer basic info', () => <CustomerBasicInfoStep mode="create" />, t => t.background.base],
  ['customer details', () => <CustomerDetailsStep mode="create" />, t => t.background.base],
  ['customer review', () => <CustomerReviewStep mode="create" />, t => t.background.base],
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
