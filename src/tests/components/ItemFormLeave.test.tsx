/**
 * G-27: Add item's Back and the phone's Back on Edit item ask before typed work
 * is thrown away, and only then.
 *
 * The real expo-router stack runs (the in-memory route context of expo-router's
 * own testing library) with the real Add item and Edit item screens and the real
 * useLeaveGuard.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { routerStore } from '@/tests/helpers/routerStore';
import { router, Stack } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { itemService } from '@/services/item-service';
import { showAlert } from '@/utils/alert';
import ItemFormScreen from '../../../app/item-form';
import ItemEditScreen from '../../../app/item-edit/[id]';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/services/item-service', () => ({
  itemService: { getItemList: jest.fn(), getItemById: jest.fn(), createItem: jest.fn(), updateItem: jest.fn(), toggleItemActive: jest.fn(), deleteItem: jest.fn() },
}));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'loading', refresh: jest.fn(), key: 'k' }) }));

function ItemsList() {
  return <Text>Items list</Text>;
}

type Buttons = { text?: string; style?: string; onPress?: () => void }[];

let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;

const settle = async () => {
  await act(async () => { await jest.runAllTimersAsync(); });
};
const pathname = () => routerStore.getRouteInfo().pathname;
const lastAlert = () => {
  const calls = jest.mocked(showAlert).mock.calls;
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as Buttons };
};
const open = async (href: string) => {
  await act(async () => { router.push(href as never); });
  await settle();
};
const typeInto = async (label: string, text: string) => {
  const field = tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
  await settle();
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  jest.mocked(itemService.getItemList).mockResolvedValue({ success: true, message: '', data: [], pagination: { total_count: 0 } } as never);
  jest.mocked(itemService.getItemById).mockResolvedValue({
    success: true, message: '', data: { id: 'i2', name: 'Garlic', packaging: 'Bag', description: '', active: true },
  } as never);
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    index: ItemsList,
    'item-form': () => <ItemFormScreen />,
    'item-edit/[id]': () => <ItemEditScreen />,
  });
  await act(async () => {
    tree = create(<ExpoRoot context={context} location="/" />);
  });
  await settle();
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  backKey.restore();
  jest.useRealTimers();
});

describe('Add item', () => {
  it('leaves at once when nothing was typed', async () => {
    await open('/item-form');
    await act(async () => { router.back(); });
    await settle();
    expect(pathname()).toBe('/');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('asks "Discard this item?" when a name was typed, and keeps the form on "Keep editing"', async () => {
    await open('/item-form');
    await typeInto('Item name, required', 'Test ZZ');
    await act(async () => { router.back(); });
    await settle();

    expect(lastAlert().title).toBe('Discard this item?');
    expect(lastAlert().message).toBe('The details you entered will be lost.');
    expect(lastAlert().buttons.map(b => b.text)).toEqual(['Keep editing', 'Discard']);
    expect(pathname()).toBe('/item-form');

    await act(async () => { lastAlert().buttons[1].onPress?.(); });
    await settle();
    expect(pathname()).toBe('/');
  });

  it('asks when only the Active switch was turned off', async () => {
    await open('/item-form');
    const toggle = tree.root.find(node => node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function');
    await act(async () => { toggle.props.onPress(); });
    await act(async () => { router.back(); });
    await settle();
    expect(lastAlert().title).toBe('Discard this item?');
  });
});

describe('Edit item', () => {
  it('leaves with the phone Back key when nothing changed', async () => {
    await open('/item-edit/i2');
    let taken = false;
    await act(async () => { taken = backKey.press(); });
    await settle();
    expect(taken).toBe(true);
    expect(pathname()).toBe('/');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('asks "Discard changes?" on the phone Back key after the name changed', async () => {
    await open('/item-edit/i2');
    await typeInto('Item name, required', 'Garlic X');
    await act(async () => { backKey.press(); });
    await settle();
    expect(lastAlert().title).toBe('Discard changes?');
    expect(lastAlert().message).toBe('Your unsaved changes to this item will be lost.');
    expect(pathname()).toBe('/item-edit/i2');
    await act(async () => { lastAlert().buttons.find(b => b.text === 'Discard')!.onPress?.(); });
    await settle();
    expect(pathname()).toBe('/');
  });
});
