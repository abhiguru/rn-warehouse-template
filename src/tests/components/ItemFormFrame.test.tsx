/** G-28: Add and Edit item draw Back + a centred title, keep Save out of the header, and show the header while Edit item loads. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { router } from 'expo-router';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ id: 'i2' }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
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
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'loading', refresh: jest.fn(), key: 'k' }) }));
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

const GARLIC = { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(itemService.getItemById).mockResolvedValue({ success: true, message: '', data: GARLIC } as never);
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.updateItem).mockResolvedValue({ success: true, message: 'ok' } as never);
  jest.mocked(itemService.createItem).mockResolvedValue({ success: true, message: 'ok' } as never);
});
const renderEdit = async () => { await act(async () => { tree = create(<ItemEditScreen />); }); };
const renderAdd = async () => { await act(async () => { tree = create(<ItemFormScreen />); }); };
const typeInto = async (label: string, text: string) => {
  const field = tree!.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
};

const within = (testID: string) => tree!.root.find(node => node.props.testID === testID);
const labelsIn = (testID: string) => within(testID).findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel);

describe('Edit item frame', () => {
  it('shows the title and a Back button while the item loads', async () => {
    jest.mocked(itemService.getItemById).mockReturnValue(new Promise(() => undefined) as never);
    await renderEdit();
    expect(shownText()).toContain('Edit item');
    expect(byLabel('Back')).toBeTruthy();
    expect(shownText()).toContain('Loading item…');
  });

  it('puts Save item in a bottom bar, not in the header', async () => {
    await renderEdit();
    expect(labelsIn('item-header')).toContain('Back');
    expect(labelsIn('item-header')).not.toContain('Save item');
    expect(within('item-header').findAllByType(Text).map(node => flat(node.props.children))).toEqual(expect.arrayContaining(['Back', 'Edit item']));
    expect(labelsIn('item-bottom-bar')).toContain('Save item');
  });
});

describe('Add item frame', () => {
  it('has an Add item button in the bottom bar and nothing to save in the header', async () => {
    await renderAdd();
    expect(labelsIn('item-header')).not.toContain('Save item');
    expect(labelsIn('item-header')).not.toContain('Add item');
    expect(labelsIn('item-bottom-bar')).toContain('Add item');
  });
});
