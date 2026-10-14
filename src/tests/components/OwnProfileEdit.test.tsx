/**
 * The own-profile edit (app/user/edit/[userId].tsx), rebuilt as "Change name".
 *
 * SR-07: it showed "User" for admin, staff and customer (the label came from the
 *        legacy supervisor flag); it now shows the same four role names as
 *        Settings and Profile.
 * SR-08: a failed customer-access read looked like "No customers assigned yet. Ask
 *        an administrator…"; it now says the read failed and offers Try again,
 *        which reloads only that part and keeps a typed name.
 * O06:   one editable field with its scope; mobile, role, status and customer
 *        access sit in a collapsed "Account details".
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { setLanguage } from '@/i18n';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: 'profile-1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/store/slices/authSlice', () => ({ setUserProfile: jest.fn((profile: unknown) => ({ type: 'set', profile })) }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }),
}));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
let mockServer: Record<string, string> | null = null;
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('@/services/user-service', () => ({
  UserService: { getUserById: jest.fn(), getAccessibleCustomers: jest.fn(), updateUser: jest.fn() },
}));

import { UserService } from '@/services/user-service';
import OwnProfileEditScreen from '../../../app/user/edit/[userId]';

const getUserById = jest.mocked(UserService.getUserById);
const getAccessibleCustomers = jest.mocked(UserService.getAccessibleCustomers);
const updateUser = jest.mocked(UserService.updateUser);

const CUSTOMER = { id: 'customer-1', name: 'Fictional Traders', mobile: '9000000001', city: 'Rajkot', active: true };

function profile(role: string, status: 'loaded' | 'failed' = 'loaded', customers = [CUSTOMER]) {
  return {
    success: true,
    message: 'ok',
    data: {
      id: 'profile-1',
      auth_user_id: 'auth-1',
      name: 'Asha Example',
      email: '',
      mobile: '9000000002',
      role: role as never,
      supervisor: role === 'supervisor',
      active: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      assignedCustomers: status === 'failed' ? [] : customers,
      assignedCustomersStatus: status,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setLanguage('en');
  mockServer = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
  mockState = {
    theme: { preference: 'light', brand: 'orange' },
    auth: { userProfile: { id: 'profile-1', name: 'Asha Example', role: 'staff' } },
  };
});
afterEach(() => setLanguage('en'));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<OwnProfileEditScreen />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
const composite = (tree: ReactTestRenderer, match: (node: ReactTestInstance) => boolean) =>
  tree.root.findAll((node) => typeof node.type !== 'string' && match(node));
const byTestID = (tree: ReactTestRenderer, id: string) => composite(tree, (node) => node.props.testID === id)[0];
const press = async (node: ReactTestInstance) => {
  await act(async () => {
    node.props.onPress();
  });
};
const openDetails = async (tree: ReactTestRenderer) => press(byTestID(tree, 'self-edit-account-details'));
const nameInput = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput)[0];
const typeName = async (tree: ReactTestRenderer, name: string) => {
  await act(async () => {
    nameInput(tree).props.onChangeText(name);
  });
};

describe('role label (SR-07)', () => {
  it.each([
    ['admin', 'Admin'],
    ['supervisor', 'Supervisor'],
    ['staff', 'Staff'],
    ['customer', 'Customer'],
  ])('%s reads %s, as on Settings and Profile', async (role, label) => {
    getUserById.mockResolvedValue(profile(role));
    const tree = await render();
    await openDetails(tree);
    expect(composite(tree, (node) => node.props.accessibilityLabel === `Role, ${label}`)).not.toHaveLength(0);
    expect(texts(tree)).toContain(label);
    expect(texts(tree)).not.toContain('User');
  });

  it('uses the Gujarati role name in Gujarati', async () => {
    setLanguage('gu');
    getUserById.mockResolvedValue(profile('staff'));
    const tree = await render();
    await openDetails(tree);
    expect(texts(tree)).toContain('સ્ટાફ');
    expect(texts(tree)).not.toContain('યુઝર');
  });
});

describe('Change name (O06)', () => {
  it('has one editable field, its scope, and the details collapsed', async () => {
    getUserById.mockResolvedValue(profile('staff'));
    const tree = await render();
    const shown = texts(tree);
    expect(shown).toContain('Change name');
    expect(shown).toContain('This is the name North Cold Store shows for you.');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    const details = byTestID(tree, 'self-edit-account-details');
    expect(details.props.accessibilityState).toEqual({ expanded: false });
    expect(details.props.accessibilityRole).toBe('button');
    // Collapsed: no mobile number, role or customer access yet.
    expect(shown.join('\n')).not.toContain('Staff');
    expect(shown.join('\n')).not.toContain('1 customer');

    await openDetails(tree);
    expect(byTestID(tree, 'self-edit-account-details').props.accessibilityState).toEqual({ expanded: true });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Staff', '1 customer', 'Customer access']));
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it('names the account when the facility is not known', async () => {
    mockServer = null;
    getUserById.mockResolvedValue(profile('staff'));
    const tree = await render();
    expect(texts(tree)).toContain('This is the name shown for your account.');
  });

  it('saves the typed name once, by the profile id', async () => {
    getUserById.mockResolvedValue(profile('staff'));
    updateUser.mockResolvedValue({ success: true, message: 'ok' });
    const tree = await render();
    await typeName(tree, 'Asha Fictional');
    await press(composite(tree, (node) => node.props.accessibilityLabel === 'Save name' && node.props.accessibilityRole === 'button')[0]);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][0]).toBe('profile-1');
    expect(updateUser.mock.calls[0][1].name).toBe('Asha Fictional');
  });
});

describe('customer access (SR-08)', () => {
  it('a failed read says so and offers Try again, not "ask an administrator"', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    const tree = await render();
    await openDetails(tree);
    const shown = texts(tree);
    expect(shown).toContain("Couldn't load your customer access. Check your connection and try again.");
    expect(shown).not.toContain('No customers assigned yet.');
    expect(shown).not.toContain('Ask an administrator to assign customers to you.');
    expect(byTestID(tree, 'self-edit-customers-retry').props.accessibilityLabel).toBe('Try again');
  });

  it('Try again reloads only the customer access and keeps the typed name', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    let answer!: (value: { status: 'loaded'; customers: typeof CUSTOMER[] }) => void;
    getAccessibleCustomers.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const tree = await render();
    await typeName(tree, 'Asha Fictional');
    await openDetails(tree);
    await press(byTestID(tree, 'self-edit-customers-retry'));
    expect(texts(tree)).toContain('Loading customer access…');
    await act(async () => {
      answer({ status: 'loaded', customers: [CUSTOMER] });
    });
    expect(getAccessibleCustomers).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain('1 customer');
    expect(texts(tree)).not.toContain("Couldn't load your customer access. Check your connection and try again.");
    expect(nameInput(tree).props.value).toBe('Asha Fictional');
  });

  it('a retry that fails again keeps the error and the typed name', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    getAccessibleCustomers.mockResolvedValue({ status: 'failed', customers: [] });
    const tree = await render();
    await typeName(tree, 'Asha Fictional');
    await openDetails(tree);
    await press(byTestID(tree, 'self-edit-customers-retry'));
    expect(texts(tree)).toContain("Couldn't load your customer access. Check your connection and try again.");
    expect(nameInput(tree).props.value).toBe('Asha Fictional');
  });

  it('a customer with no assignments keeps the assignments wording', async () => {
    getUserById.mockResolvedValue(profile('customer', 'loaded', []));
    const tree = await render();
    await openDetails(tree);
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Customer assignments', 'No customers assigned yet.', 'Ask an administrator to assign customers to you.'])
    );
  });

  it('a warehouse role with no customers is told the facility has none, not to ask for assignments', async () => {
    getUserById.mockResolvedValue(profile('staff', 'loaded', []));
    const tree = await render();
    await openDetails(tree);
    const shown = texts(tree);
    expect(shown).toEqual(expect.arrayContaining(['Customer access', 'This facility has no active customers yet.']));
    expect(shown).not.toContain('Ask an administrator to assign customers to you.');
    expect(shown).not.toContain('Customer assignments');
  });
});
