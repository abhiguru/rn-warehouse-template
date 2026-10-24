/** G-29: Items can be searched on the server, shows its count in the field's line, and says when a refresh failed. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ItemsScreen from '../../../app/items';
import { itemService } from '@/services/item-service';
import { getItemStoragePrices } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'staff', name: 'Dev Staff' } } };
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

const ROWS = (names: string[]) => names.map((name, index) => ({ id: `i${index}`, name, packaging: 'Bag', description: '', active: true }));
const answer = (data: unknown[], total: number) => ({ success: true, message: '', data, pagination: { total_count: total } });

const type = async (text: string) => {
  const field = tree!.root.find(node => node.props.accessibilityLabel === 'Search by name, packaging or description' && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => { jest.useRealTimers(); });

describe('Items search', () => {
  it('has a search field (labelled by its placeholder) and a count line under it, not in the header', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValue(answer(ROWS(['Dry Red Chillies', 'Garlic', 'Onions']), 91) as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    expect(tree!.root.findAll(n => n.props.accessibilityLabel === 'Search by name, packaging or description').length).toBeGreaterThan(0);
    expect(shownText()).toContain('91 items');
  });

  it('asks the server for the search from the first row and shows the count of the answer', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'pot' ? answer(ROWS(['Potatoes']), 1) : answer(ROWS(['Dry Red Chillies', 'Garlic', 'Onions']), 91)) as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    await type('pot');

    const last = jest.mocked(itemService.getItemList).mock.calls.at(-1)!;
    expect(last[0]).toEqual(expect.objectContaining({ search: 'pot' }));
    expect(last[2]).toBe(0);
    expect(shownText()).toContain('1 item');
    expect(shownText()).toContain('Potatoes');
    expect(shownText()).not.toContain('Garlic');
  });

  it('ignores the answer for an older search that arrives last', async () => {
    let answerPo!: (value: unknown) => void;
    jest.mocked(itemService.getItemList).mockImplementation(((filters: { search?: string }) => {
      if (filters.search === 'po') return new Promise(resolve => { answerPo = resolve; });
      if (filters.search === 'pot') return Promise.resolve(answer(ROWS(['Potatoes']), 1));
      return Promise.resolve(answer(ROWS(['Garlic']), 91));
    }) as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    await type('po');
    await type('pot');
    expect(shownText()).toContain('Potatoes');
    await act(async () => { answerPo(answer(ROWS(['Pomelo', 'Poppy seed']), 2)); });
    expect(shownText()).toContain('Potatoes');
    expect(shownText()).not.toContain('Pomelo');
    expect(shownText()).toContain('1 item');
  });

  it('says nothing matches and offers Clear search', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'zzzz' ? answer([], 0) : answer(ROWS(['Garlic']), 91)) as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    await type('zzzz');
    expect(shownText()).toContain('No items match "zzzz". Try fewer letters.');
    expect(shownText()).not.toContain('No items yet');
    const clear = tree!.root.findAll(node => node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(t => flat(t.props.children) === 'Clear search'))[0];
    await act(async () => { clear.props.onPress(); });
    expect(jest.mocked(itemService.getItemList).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ search: '' }));
    expect(shownText()).toContain('Garlic');
  });

  it('keeps the rows and says the list is older when a refresh fails', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValueOnce(answer(ROWS(['Garlic']), 91) as never);
    await act(async () => { tree = create(<ItemsScreen />); });
    jest.mocked(itemService.getItemList).mockResolvedValueOnce({ success: false, message: 'offline', data: [] } as never);
    const list = tree!.root.find(node => typeof node.props.refreshControl === 'object' && node.props.refreshControl !== null && 'props' in node.props.refreshControl);
    await act(async () => { list.props.refreshControl.props.onRefresh(); });
    expect(shownText()).toContain("Couldn't refresh items. Showing the list from");
    expect(shownText()).toContain('Garlic');
    expect(shownText()).not.toContain("Couldn't load items");
  });
});
