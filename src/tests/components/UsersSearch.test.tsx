/** G-29: Users can be searched on the server, and a failed refresh says the list is older. */
import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import UsersScreen from '../../../app/users';
import { adminUserService } from '@/services/admin-user-service';
import { router } from 'expo-router';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Administrator' } } };
// The stale-list strip reads the network state from NetInfo (a native module, absent under Jest): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
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

// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
let ue: ReturnType<typeof userEvent.setup>;
const shows = (text: string | RegExp) => expect(screen.getAllByText(text)[0]).toBeOnTheScreen();
const notShown = (text: string | RegExp) => expect(screen.queryAllByText(text, everything)).toHaveLength(0);


jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
import { Platform, StyleSheet } from 'react-native';
jest.mock('@/services/admin-user-service', () => ({ adminUserService: { getUsersList: jest.fn() } }));
const user = (id: string, name: string, role: string, extra: Record<string, unknown> = {}) => ({
  id, auth_user_id: `a-${id}`, name, display_name: null, mobile: `90000000${id.padStart(2, '0')}`, role, active: true,
  created_at: '2026-01-01', updated_at: '2026-01-01', assigned_customers_count: 0, ...extra,
});
const answer = (users: unknown[], total = users.length) => ({ success: true, data: { users, pagination: { total_count: total, limit: 20, offset: 0, has_more: false } } });

const type = async (text: string) => {
  const field = screen.getByLabelText('Search by name or mobile');
  await ue.clear(field);
  await ue.type(field, text);
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
};
// The search field is the TextInput that offers the screen-reader action Refresh; no other element does.
const refreshTargets = () => screen.root!.queryAll(node => typeof node.type === 'string'
  && Array.isArray(node.props.accessibilityActions) && node.props.accessibilityActions.some((a: { name: string }) => a.name === 'refresh'));
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); ue = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime }); });
afterEach(() => { jest.useRealTimers(); });

const ALL = [user('1', 'Dev Administrator', 'admin'), user('2', 'Dev Staff', 'staff'), user('3', 'Review Customer', 'customer'), user('4', 'Review Staff', 'staff'), user('5', 'Dev Customer One', 'customer'), user('6', 'Dev Customer Two', 'customer'), user('7', 'Dev Supervisor', 'supervisor')];


describe('Users search', () => {
  it('has a Search by name or mobile field, and the count is a line under it', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer(ALL) as never);
    await render(<UsersScreen />);
    expect(screen.getAllByLabelText('Search by name or mobile')[0]).toBeOnTheScreen();
    shows(/\b7 users/);
  });

  it('asks the server for the search and shows the count of the answer', async () => {
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (filters: { search_query?: string }) =>
      filters.search_query === 'review' ? answer([ALL[2], ALL[3]]) : answer(ALL)) as never);
    await render(<UsersScreen />);
    await type('review');

    const last = jest.mocked(adminUserService.getUsersList).mock.calls.at(-1)!;
    expect(last[0]).toEqual(expect.objectContaining({ search_query: 'review' }));
    expect(last[2]).toBe(0);
    shows(/\b2 users/);
    shows(/Review Customer/);
    notShown(/Dev Staff/);
  });

  it('ignores the answer for an older search that arrives last', async () => {
    let answerRe!: (value: unknown) => void;
    jest.mocked(adminUserService.getUsersList).mockImplementation(((filters: { search_query?: string }) => {
      if (filters.search_query === 're') return new Promise(resolve => { answerRe = resolve; });
      if (filters.search_query === 'review') return Promise.resolve(answer([ALL[2], ALL[3]]));
      return Promise.resolve(answer(ALL));
    }) as never);
    await render(<UsersScreen />);
    await type('re');
    await type('review');
    await act(async () => { answerRe(answer([ALL[0]])); });
    shows(/Review Customer/);
    notShown(/Dev Administrator/);
  });

  it('says nobody matches and offers Clear search', async () => {
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (filters: { search_query?: string }) =>
      filters.search_query === 'zzzz' ? answer([]) : answer(ALL)) as never);
    await render(<UsersScreen />);
    await type('zzzz');
    shows(/No users match "zzzz"/);
    shows(/Try fewer letters or another spelling\./);
    notShown(/No users yet/);
    // The list is a FlashList with no role or text of its own: its style props are read.
    const list = screen.root!.queryAll(node => typeof node.props.ListEmptyComponent === 'function' && node.props.contentContainerStyle)[0];
    expect(StyleSheet.flatten(list.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toEqual(expect.objectContaining({ flexGrow: 1 }));
  });

  it('keeps the rows and says the list is older when a refresh fails', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValueOnce(answer(ALL) as never);
    await render(<UsersScreen />);
    jest.mocked(adminUserService.getUsersList).mockResolvedValueOnce({ success: false, error: 'offline' } as never);
    // The pull to refresh is a prop of the list (the same way as OrderManagementRenders.test.tsx reaches it).
    const list = screen.root!.queryAll(node => typeof node.props.refreshControl === 'object' && node.props.refreshControl !== null && 'props' in node.props.refreshControl)[0];
    await act(async () => { list.props.refreshControl.props.onRefresh(); });
    shows(/Couldn't refresh users\./);
    shows(/Showing the users loaded at/);
    shows(/Dev Staff/);
    notShown(/Couldn't load users/);
  });
});

describe('Users screen-reader Refresh (WH-220)', () => {
  it('offers Refresh on the search field, and it reads the list again', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer(ALL) as never);
    await render(<UsersScreen />);
    const target = refreshTargets()[0];
    expect(target.type).toBe('TextInput');
    expect(target.props.accessibilityActions).toContainEqual({ name: 'refresh', label: 'Refresh' });
    const before = jest.mocked(adminUserService.getUsersList).mock.calls.length;
    await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(jest.mocked(adminUserService.getUsersList).mock.calls.length).toBe(before + 1);
  });
});

describe('Users Refresh stays reachable when the list has nothing to count (WH-220)', () => {
  const expectRefreshWorks = async () => {
    const targets = refreshTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe('TextInput');
    const before = jest.mocked(adminUserService.getUsersList).mock.calls.length;
    await fireEvent(targets[0], 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(jest.mocked(adminUserService.getUsersList).mock.calls.length).toBe(before + 1);
  };

  it('with no users at all', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer([]) as never);
    await render(<UsersScreen />);
    await expectRefreshWorks();
  });

  it('during the first load', async () => {
    jest.mocked(adminUserService.getUsersList).mockReturnValue(new Promise(() => undefined) as never);
    await render(<UsersScreen />);
    await expectRefreshWorks();
  });

  it('on a search with no match', async () => {
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (filters: { search_query?: string }) =>
      filters.search_query === 'zzzz' ? answer([]) : answer(ALL)) as never);
    await render(<UsersScreen />);
    await type('zzzz');
    shows(/No users match "zzzz"/);
    await expectRefreshWorks();
  });
});
