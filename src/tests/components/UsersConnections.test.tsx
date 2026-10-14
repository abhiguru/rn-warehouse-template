/** G-34: the FAS sync connection is listed after the people under Connections, without a phone number, and is not counted. */
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

beforeEach(() => jest.clearAllMocks());

describe('Users with a connection', () => {
  it('lists FAS sync under Connections, tagged Connection, with no phone line, and counts 6 users', async () => {
    const people = [1, 2, 3, 4, 5, 6].map(n => user(String(n), `Person ${n}`, n === 1 ? 'admin' : 'staff'));
    // The server sends the connection among the people, as an admin profile with +91 00000 00000.
    const fas = user('9', 'FAS sync', 'admin', { mobile: '0000000000', is_service_account: true });
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer([people[0], fas, ...people.slice(1)], 7) as never);
    await act(async () => { tree = create(<UsersScreen />); });

    const text = shownText();
    expect(text).toContain('6 users');
    expect(text).not.toContain('7 users');
    expect(text).toContain('CONNECTIONS');
    expect(text).not.toContain('+91 00000 00000');
    // Order: the people, then the heading, then the connection.
    expect(text.indexOf('Person 6')).toBeLessThan(text.indexOf('CONNECTIONS'));
    expect(text.indexOf('CONNECTIONS')).toBeLessThan(text.indexOf('FAS sync'));
    const row = tree!.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('FAS sync') && typeof node.props.onPress === 'function');
    expect(row.props.accessibilityLabel).toBe('FAS sync, Connection');
  });

  it('shows no Connections heading when there is none', async () => {
    jest.mocked(adminUserService.getUsersList).mockResolvedValue(answer([user('1', 'Person 1', 'admin')]) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    expect(shownText()).not.toContain('CONNECTIONS');
    expect(shownText()).toContain('1 user');
  });
});

describe('CR-26: a connection beyond the first rows is still found', () => {
  it('loads every row, counts 24 users for 25 profiles with one connection, and shows Connections', async () => {
    const all = Array.from({ length: 25 }, (_, n) =>
      n === 22
        ? user('99', 'FAS sync', 'admin', { mobile: '0000000000', is_service_account: true })
        : user(String(n + 1), `Person ${n + 1}`, 'staff')
    );
    // A server that honours the page size: a 20-row page would hide the connection (row 23).
    jest.mocked(adminUserService.getUsersList).mockImplementation((async (_filters: unknown, limit: number, offset: number) => ({
      success: true,
      data: { users: all.slice(offset, offset + limit), pagination: { total_count: all.length, limit, offset, has_more: offset + limit < all.length } },
    })) as never);
    await act(async () => { tree = create(<UsersScreen />); });
    const text = shownText();
    expect(text).toContain('24 users');
    expect(text).not.toContain('25 users');
    // The list draws only the first rows; its data holds the heading row before the connection.
    const list = tree!.root.findAll(node => Array.isArray(node.props.data) && node.props.data.length > 10)[0];
    const kinds = (list.props.data as { kind: string; user?: { name: string } }[]).map(row => (row.kind === 'user' ? row.user!.name : row.kind));
    expect(kinds).toHaveLength(26);
    expect(kinds.slice(-2)).toEqual(['connectionsHeader', 'FAS sync']);
  });
});
