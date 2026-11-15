/**
 * WH-216: the Item and User pages when they cannot be read or are gone (exact texts in English and
 * Gujarati), Edit in the Item page header, the Deactivated strip on every tab of Item, and the status
 * tag in the Dispatch hero. The real pages run; only the services, the router and the pricing tab are
 * stand-ins. Stack.Screen draws what the page puts in the stack header. Fictional data only.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemPage from '../../../app/item/[id]';
import UserEditScreen from '../../../app/user-edit/[id]';
import { DispatchHeroHeader } from '@/components/dispatch-details/DispatchHeroHeader';
import { itemService } from '@/services/item-service';
import { adminUserService } from '@/services/admin-user-service';
import { setLanguage } from '@/i18n';

let mockParams: Record<string, string> = { id: 'item-1' };
let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole, name: 'Dev Administrator' } } }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
  useIsFocused: () => true,
  useFocusEffect: require('./focusHarness').useFocusEffect,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/features/item-pricing/components/ItemPricingTab', () => ({ ItemPricingTab: () => null }));
jest.mock('@/features/gst/ItemGstTreatment', () => ({ ItemGstTreatment: () => null }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ reloadItemRatesCache: jest.fn() }));
jest.mock('@/services/item-service', () => ({
  itemService: { getItemById: jest.fn(), toggleItemActive: jest.fn(), deleteItem: jest.fn() },
}));
jest.mock('@/services/admin-user-service', () => ({
  adminUserService: {
    getUserDetails: jest.fn(), updateUserRole: jest.fn(), updateUserStatus: jest.fn(),
    assignCustomerToUser: jest.fn(), removeCustomerAssignment: jest.fn(),
  },
}));
jest.mock('@/services/session-devices-service', () => ({
  listUserSessions: jest.fn(async () => ({ success: false, unsupported: true, message: '' })),
  revokeSession: jest.fn(),
}));
jest.mock('@/services/customer-service', () => ({ customerService: { searchCustomers: jest.fn() } }));
jest.mock('@/components/RolePickerBottomSheet', () => ({ RolePickerBottomSheet: () => null }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));

const ITEM = { id: 'item-1', name: 'Fictional Onion', packaging: 'Bag', description: 'Red', active: true, created_at: '2026-01-01' };

let tree: ReactTestRenderer | undefined;
const mount = async (element: React.ReactElement) => {
  await act(async () => { tree = create(element); });
  return tree as ReactTestRenderer;
};
const shownText = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(3).join(''));
const byLabel = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const press = async (label: string) => {
  const control = byLabel(label)[0];
  if (!control) throw new Error(`No control labelled "${label}"`);
  await act(async () => { control.props.onPress(); });
};
const testIds = (id: string) => tree!.root.findAll(node => node.props.testID === id);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'item-1' };
  mockRole = 'admin';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('Item page', () => {
  it('cannot be read: the title with the check-connection text, Try again, no Edit (English)', async () => {
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: false, message: 'x' } as never);
    await mount(<ItemPage />);
    expect(shownText()).toEqual(expect.arrayContaining(["Couldn't open this item", 'Check your connection and try again.']));
    expect(byLabel('Edit')).toHaveLength(0);
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, data: ITEM } as never);
    await press('Try again');
    expect(shownText()).toContain('Fictional Onion');
  });

  it('cannot be read: the same in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: false, message: 'x' } as never);
    await mount(<ItemPage />);
    expect(shownText()).toEqual(expect.arrayContaining(['આ આઇટમ ખોલી શકાઈ નથી', 'તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.']));
  });

  it('is gone: "Item not found" and "It may have been deleted." with Go back, no Try again (English)', async () => {
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: false, code: 'NOT_FOUND', message: 'x' } as never);
    await mount(<ItemPage />);
    expect(shownText()).toEqual(expect.arrayContaining(['Item not found', 'It may have been deleted.']));
    expect(shownText()).not.toContain("Couldn't open this item");
    expect(byLabel('Try again')).toHaveLength(0);
    await press('Go back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('is gone: the same in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: false, code: 'NOT_FOUND', message: 'x' } as never);
    await mount(<ItemPage />);
    expect(shownText()).toEqual(expect.arrayContaining(['આઇટમ મળી નથી', 'કદાચ તે ડિલીટ થઈ ગઈ છે.']));
    await press('પાછા જાઓ');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('has Edit in the header once read, and Edit opens the item form', async () => {
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, data: ITEM } as never);
    await mount(<ItemPage />);
    expect(byLabel('Edit').length).toBeGreaterThan(0);
    await press('Edit');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-edit/[id]', params: { id: 'item-1' } });
  });

  it('shows the Deactivated strip on the Overview tab and on the Pricing tab, and none for an active item', async () => {
    const strip = 'This item is deactivated. Activate it to change its rates.';
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, data: { ...ITEM, active: false } } as never);
    await mount(<ItemPage />);
    expect(testIds('item-deactivated').length).toBeGreaterThan(0);
    expect(shownText()).toContain(strip);
    await act(async () => { tree!.unmount(); });
    mockParams = { id: 'item-1', tab: 'pricing' };
    await mount(<ItemPage />);
    expect(shownText()).toContain(strip);
    await act(async () => { tree!.unmount(); });
    mockParams = { id: 'item-1' };
    jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, data: ITEM } as never);
    await mount(<ItemPage />);
    expect(testIds('item-deactivated')).toHaveLength(0);
    expect(shownText()).not.toContain(strip);
  });
});

describe('User page', () => {
  beforeEach(() => { mockParams = { id: 'u2' }; });

  it('cannot be read: the title, the check-connection text and Try again (English)', async () => {
    jest.mocked(adminUserService.getUserDetails).mockRejectedValue(new Error('offline'));
    await mount(<UserEditScreen />);
    expect(shownText()).toEqual(expect.arrayContaining(["Couldn't load this user", 'Check your connection and try again.']));
    expect(byLabel('Try again').length).toBeGreaterThan(0);
  });

  it('cannot be read: the same in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(adminUserService.getUserDetails).mockRejectedValue(new Error('offline'));
    await mount(<UserEditScreen />);
    expect(shownText()).toEqual(expect.arrayContaining(['આ યુઝર લોડ કરી શકાયો નથી', 'તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.']));
  });

  it('is gone: says the user is no longer at this facility, with Back to Users and no Try again (English)', async () => {
    jest.mocked(adminUserService.getUserDetails).mockResolvedValue({ success: false, code: 'NOT_FOUND', message: 'x' } as never);
    await mount(<UserEditScreen />);
    expect(shownText()).toEqual(expect.arrayContaining(["Couldn't load this user", 'This user is no longer at this facility.', 'Back to Users']));
    expect(byLabel('Try again')).toHaveLength(0);
  });

  it('is gone: the same in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(adminUserService.getUserDetails).mockResolvedValue({ success: false, code: 'NOT_FOUND', message: 'x' } as never);
    await mount(<UserEditScreen />);
    expect(shownText()).toEqual(expect.arrayContaining(['આ યુઝર લોડ કરી શકાયો નથી', 'આ યુઝર હવે આ કોલ્ડ સ્ટોરેજમાં નથી.', 'યુઝર પર પાછા જાઓ']));
  });
});

describe('Dispatch hero status tag', () => {
  const hero = async (quantity: number) =>
    mount(<DispatchHeroHeader disp_no="D0010" date="2026-10-01" total_items={1} total_quantity={quantity} />);
  const tag = () => testIds('dispatch-status-tag');

  it('says Complete once something has been dispatched, and Pending before that (English)', async () => {
    await hero(5);
    expect(tag().length).toBeGreaterThan(0);
    expect(shownText()).toContain('Complete');
    await act(async () => { tree!.unmount(); });
    await hero(0);
    expect(shownText()).toContain('Pending');
    expect(shownText()).not.toContain('Complete');
  });

  it('says it in Gujarati', async () => {
    setLanguage('gu');
    await hero(5);
    expect(shownText()).toContain('પૂર્ણ');
    await act(async () => { tree!.unmount(); });
    await hero(0);
    expect(shownText()).toContain('બાકી');
  });
});
