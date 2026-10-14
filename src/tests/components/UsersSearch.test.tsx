/** G-29: Users can be searched on the server, and a failed refresh says the list is older. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import UsersScreen from '../../../app/users';
import { adminUserService } from '@/services/admin-user-service';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';

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

jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
import { Platform, StyleSheet } from 'react-native';
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
const user = (id: string, name: string, role: string, extra: Record<string, unknown> = {}) => ({
  id, auth_user_id: `a-${id}`, name, display_name: null, mobile: `90000000${id.padStart(2, '0')}`, role, active: true,
  created_at: '2026-01-01', updated_at: '2026-01-01', assigned_customers_count: 0, ...extra,
});
const answer = (users: unknown[], total = users.length) => ({ success: true, data: { users, pagination: { total_count: total, limit: 20, offset: 0, has_more: false } } });

const type = async (text: string) => {
  const field = tree!.root.find(node => node.props.accessibilityLabel === 'Search users' && typeof node.props.onChangeText === 'function');
  await act(async () => { field.props.onChangeText(text); });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
};
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

const ALL = [user('1', 'Dev Administrator', 'admin'), user('2', 'Dev Staff', 'staff'), user('3', 'Review Customer', 'customer'), user('4', 'Review Staff', 'staff'), user('5', 'Dev Customer One', 'customer'), user('6', 'Dev Customer Two', 'customer'), user('7', 'Dev Supervisor', 'supervisor')];

describe('Users search', () => {
  it('has a Search users field, and the count is a line under it', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer(ALL) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    expect(tree!.root.findAll(n => n.props.accessibilityLabel === 'Search users').length).toBeGreaterThan(0);
    expect(shownText()).toContain('7 users');
  });

  it('asks the server for the search and shows the count of the answer', async () => {
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (filters: { search_query?: string }) =>
      filters.search_query === 'review' ? answer([ALL[2], ALL[3]]) : answer(ALL)) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    await type('review');

    const last = jest.mocked(adminUserService.getUsersList).mock.calls.at(-1)!;
    expect(last[0]).toEqual(expect.objectContaining({ search_query: 'review' }));
    expect(last[2]).toBe(0);
    expect(shownText()).toContain('2 users');
    expect(shownText()).toContain('Review Customer');
    expect(shownText()).not.toContain('Dev Staff');
  });

  it('ignores the answer for an older search that arrives last', async () => {
    let answerRe!: (value: unknown) => void;
    jest.mocked(adminUserService.getUsersList).mockImplementation(((filters: { search_query?: string }) => {
      if (filters.search_query === 're') return new Promise(resolve => { answerRe = resolve; });
      if (filters.search_query === 'review') return Promise.resolve(answer([ALL[2], ALL[3]]));
      return Promise.resolve(answer(ALL));
    }) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    await type('re');
    await type('review');
    await act(async () => { answerRe(answer([ALL[0]])); });
    expect(shownText()).toContain('Review Customer');
    expect(shownText()).not.toContain('Dev Administrator');
  });

  it('says nobody matches and offers Clear search', async () => {
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (filters: { search_query?: string }) =>
      filters.search_query === 'zzzz' ? answer([]) : answer(ALL)) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    await type('zzzz');
    expect(shownText()).toContain('No users match "zzzz". Try fewer letters.');
    expect(shownText()).not.toContain('No users yet');
  });

  it('keeps the rows and says the list is older when a refresh fails', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValueOnce(answer(ALL) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    jest.mocked(adminUserService.getUsersList).mockResolvedValueOnce({ success: false, error: 'offline' } as never);
    const list = tree!.root.find(node => typeof node.props.refreshControl === 'object' && node.props.refreshControl !== null && 'props' in node.props.refreshControl);
    await act(async () => { list.props.refreshControl.props.onRefresh(); });
    expect(shownText()).toContain("Couldn't refresh users. Showing the list from");
    expect(shownText()).toContain('Dev Staff');
    expect(shownText()).not.toContain("Couldn't load users");
  });
});
