/** G-29: Items can be searched on the server, shows its count in the field's line, and says when a refresh failed. */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
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

// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

const ROWS = (names: string[]) => names.map((name, index) => ({ id: `i${index}`, name, packaging: 'Bag', description: '', active: true }));
const answer = (data: unknown[], total: number) => ({ success: true, message: '', data, pagination: { total_count: total } });
const renderItems = async () => { await render(<GestureHandlerRootView><ItemsScreen /></GestureHandlerRootView>); };

const type = async (text: string) => {
  const field = screen.getByLabelText('Search by name, packaging or description');
  await user.clear(field);
  await user.type(field, text);
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
    await renderItems();
    expect(screen.getAllByLabelText('Search by name, packaging or description').length).toBeGreaterThan(0);
    expect(await screen.findByText(/91 items/)).toBeOnTheScreen();
  });

  it('asks the server for the search from the first row and shows the count of the answer', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'pot' ? answer(ROWS(['Potatoes']), 1) : answer(ROWS(['Dry Red Chillies', 'Garlic', 'Onions']), 91)) as never);
    await renderItems();
    await screen.findByText(/Garlic/);
    await type('pot');

    const last = jest.mocked(itemService.getItemList).mock.calls.at(-1)!;
    expect(last[0]).toEqual(expect.objectContaining({ search: 'pot' }));
    expect(last[2]).toBe(0);
    expect(screen.getByText('1 item')).toBeOnTheScreen();
    expect(screen.getByText(/Potatoes/)).toBeOnTheScreen();
    expect(screen.queryByText(/Garlic/, hidden)).not.toBeOnTheScreen();
  });

  it('ignores the answer for an older search that arrives last', async () => {
    let answerPo!: (value: unknown) => void;
    jest.mocked(itemService.getItemList).mockImplementation(((filters: { search?: string }) => {
      if (filters.search === 'po') return new Promise(resolve => { answerPo = resolve; });
      if (filters.search === 'pot') return Promise.resolve(answer(ROWS(['Potatoes']), 1));
      return Promise.resolve(answer(ROWS(['Garlic']), 91));
    }) as never);
    await renderItems();
    await type('po');
    await type('pot');
    expect(screen.getByText(/Potatoes/)).toBeOnTheScreen();
    await act(async () => { answerPo(answer(ROWS(['Pomelo', 'Poppy seed']), 2)); });
    expect(screen.getByText(/Potatoes/)).toBeOnTheScreen();
    expect(screen.queryByText(/Pomelo/, hidden)).not.toBeOnTheScreen();
    expect(screen.getByText('1 item')).toBeOnTheScreen();
  });

  it('says nothing matches and offers Clear search', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'zzzz' ? answer([], 0) : answer(ROWS(['Garlic']), 91)) as never);
    await renderItems();
    await screen.findByText(/Garlic/);
    await type('zzzz');
    expect(screen.getByText('No items match "zzzz"')).toBeOnTheScreen();
    expect(screen.getByText('Try fewer letters or another spelling.')).toBeOnTheScreen();
    expect(screen.queryByText(/No items yet/, hidden)).not.toBeOnTheScreen();
    await user.press(screen.getByText('Clear search'));
    expect(jest.mocked(itemService.getItemList).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ search: '' }));
    expect(await screen.findByText(/Garlic/)).toBeOnTheScreen();
  });

  it('keeps the rows and says the list is older when a refresh fails', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValueOnce(answer(ROWS(['Garlic']), 91) as never);
    await renderItems();
    await screen.findByText(/Garlic/);
    jest.mocked(itemService.getItemList).mockResolvedValueOnce({ success: false, message: 'offline', data: [] } as never);
    // The refresh control is a prop of the scroll view the list draws: nothing is drawn for a query to reach.
    const list = screen.root!.queryAll(node => (node.type as unknown) === 'RCTScrollView')[0];
    await act(async () => { list.props.refreshControl.props.onRefresh(); });
    expect(screen.getByText("Couldn't refresh items.")).toBeOnTheScreen();
    expect(screen.getByText(/Showing the items loaded at/)).toBeOnTheScreen();
    expect(screen.getByText(/Garlic/)).toBeOnTheScreen();
    expect(screen.queryByText(/Couldn't load items/, hidden)).not.toBeOnTheScreen();
  });
});

/** The elements that offer Refresh as a screen-reader action: no query finds an element by its actions. */
const refreshTargets = () => screen.root!.queryAll(node => typeof node.type === 'string'
  && Array.isArray(node.props.accessibilityActions) && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));

describe('Items screen-reader Refresh (WH-220)', () => {
  it('offers Refresh on the search field, and it reads the list again', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValue(answer(ROWS(['Garlic', 'Onions']), 2) as never);
    await renderItems();
    await screen.findByText(/Garlic/);
    const target = refreshTargets()[0];
    expect(target.type).toBe('TextInput');
    expect(target.props.accessibilityActions).toContainEqual({ name: 'refresh', label: 'Refresh' });
    const before = jest.mocked(itemService.getItemList).mock.calls.length;
    await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(jest.mocked(itemService.getItemList).mock.calls.length).toBe(before + 1);
  });
});

describe('Items Refresh stays reachable when the list has nothing to count (WH-220)', () => {
  const expectRefreshWorks = async () => {
    const targets = refreshTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe('TextInput');
    const before = jest.mocked(itemService.getItemList).mock.calls.length;
    await fireEvent(targets[0], 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(jest.mocked(itemService.getItemList).mock.calls.length).toBe(before + 1);
  };

  it('with no items at all', async () => {
    jest.mocked(itemService.getItemList).mockResolvedValue(answer([], 0) as never);
    await renderItems();
    await expectRefreshWorks();
  });

  it('during the first load', async () => {
    jest.mocked(itemService.getItemList).mockReturnValue(new Promise(() => undefined) as never);
    await renderItems();
    await expectRefreshWorks();
  });

  it('on a search with no match', async () => {
    jest.mocked(itemService.getItemList).mockImplementation((async (filters: { search?: string }) =>
      filters.search === 'zzzz' ? answer([], 0) : answer(ROWS(['Garlic']), 91)) as never);
    await renderItems();
    await type('zzzz');
    expect(screen.getByText('No items match "zzzz"')).toBeOnTheScreen();
    await expectRefreshWorks();
  });
});
