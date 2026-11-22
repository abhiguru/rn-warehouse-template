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
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
async function draw() {
  await render(<OwnProfileEditScreen />);
  // The name field shows the saved name once the profile has loaded.
  await screen.findByDisplayValue('Asha Example');
}

const has = (text: string | RegExp) => expect(screen.getAllByText(text)[0]).toBeOnTheScreen();
const lacks = (text: string | RegExp) => expect(screen.queryByText(text, hidden)).not.toBeOnTheScreen();
const detailsButton = () => screen.getByTestId('self-edit-account-details');
const openDetails = async () => { await user.press(detailsButton()); };
// The fields are the screen's text inputs (plain host elements): they are counted by their type.
const inputs = () => (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : []).filter(node => (node.type as unknown) === 'TextInput');
const typeName = async (name: string) => {
  const field = inputs()[0];
  await user.clear(field);
  await user.type(field, name);
};

describe('role label (SR-07)', () => {
  it.each([
    ['admin', 'Admin'],
    ['supervisor', 'Supervisor'],
    ['staff', 'Staff'],
    ['customer', 'Customer'],
  ])('%s reads %s, as on Settings and Profile', async (role, label) => {
    getUserById.mockResolvedValue(profile(role));
    await draw();
    await openDetails();
    expect(screen.getAllByLabelText(`Role, ${label}`)).not.toHaveLength(0);
    has(label);
    lacks('User');
  });

  it('uses the Gujarati role name in Gujarati', async () => {
    setLanguage('gu');
    getUserById.mockResolvedValue(profile('staff'));
    await draw();
    await openDetails();
    has('સ્ટાફ');
    lacks('યુઝર');
  });
});

describe('Change name (O06)', () => {
  it('has one editable field, its scope, and the details collapsed', async () => {
    getUserById.mockResolvedValue(profile('staff'));
    await draw();
    has('Change name');
    has('This is the name North Cold Store shows for you.');
    expect(inputs()).toHaveLength(1);
    expect(detailsButton().props.accessibilityState).toEqual({ expanded: false });
    expect(detailsButton()).not.toBeExpanded();
    expect(detailsButton().props.accessibilityRole).toBe('button');
    // Collapsed: no mobile number, role or customer access yet.
    lacks(/Staff/);
    lacks(/1 customer/);

    await openDetails();
    expect(detailsButton().props.accessibilityState).toEqual({ expanded: true });
    expect(detailsButton()).toBeExpanded();
    for (const text of ['Staff', '1 customer', 'Customer access']) has(text);
    expect(inputs()).toHaveLength(1);
  });

  it('names the account when the facility is not known', async () => {
    mockServer = null;
    getUserById.mockResolvedValue(profile('staff'));
    await draw();
    has('This is the name shown for your account.');
  });

  it('saves the typed name once, by the profile id', async () => {
    getUserById.mockResolvedValue(profile('staff'));
    updateUser.mockResolvedValue({ success: true, message: 'ok' });
    await draw();
    await typeName('Asha Fictional');
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][0]).toBe('profile-1');
    expect(updateUser.mock.calls[0][1].name).toBe('Asha Fictional');
  });
});

describe('customer access (SR-08)', () => {
  it('a failed read says so and offers Try again, not "ask an administrator"', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    await draw();
    await openDetails();
    has("Couldn't load your customer access. Check your connection and try again.");
    lacks('No customers assigned yet.');
    lacks('Ask an administrator to assign customers to you.');
    expect(screen.getByTestId('self-edit-customers-retry').props.accessibilityLabel).toBe('Try again');
  });

  it('Try again reloads only the customer access and keeps the typed name', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    let answer!: (value: { status: 'loaded'; customers: typeof CUSTOMER[] }) => void;
    getAccessibleCustomers.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    await draw();
    await typeName('Asha Fictional');
    await openDetails();
    await user.press(screen.getByTestId('self-edit-customers-retry'));
    has('Loading customer access…');
    await act(async () => {
      answer({ status: 'loaded', customers: [CUSTOMER] });
    });
    expect(getAccessibleCustomers).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledTimes(1);
    has('1 customer');
    lacks("Couldn't load your customer access. Check your connection and try again.");
    expect(inputs()[0]).toHaveDisplayValue('Asha Fictional');
  });

  it('a retry that fails again keeps the error and the typed name', async () => {
    getUserById.mockResolvedValue(profile('staff', 'failed'));
    getAccessibleCustomers.mockResolvedValue({ status: 'failed', customers: [] });
    await draw();
    await typeName('Asha Fictional');
    await openDetails();
    await user.press(screen.getByTestId('self-edit-customers-retry'));
    has("Couldn't load your customer access. Check your connection and try again.");
    expect(inputs()[0]).toHaveDisplayValue('Asha Fictional');
  });

  it('a customer with no assignments keeps the assignments wording', async () => {
    getUserById.mockResolvedValue(profile('customer', 'loaded', []));
    await draw();
    await openDetails();
    for (const text of ['Customer assignments', 'No customers assigned yet.', 'Ask an administrator to assign customers to you.']) has(text);
  });

  it('a warehouse role with no customers is told the facility has none, not to ask for assignments', async () => {
    getUserById.mockResolvedValue(profile('staff', 'loaded', []));
    await draw();
    await openDetails();
    for (const text of ['Customer access', 'This facility has no active customers yet.']) has(text);
    lacks('Ask an administrator to assign customers to you.');
    lacks('Customer assignments');
  });
});
