/**
 * Signed-in devices on the user page (backend migration 140): rows with the app and system, masked address, "Last used"
 * and a "This device" tag; "Sign out this device" asks first; an answer of "done" for a session that is still listed is
 * "Not signed out"; the device in hand signs out here; an older backend leaves the section out.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { SignedInDevicesSection } from '../components/SignedInDevicesSection';
import { listUserSessions, revokeSession } from '@/services/session-devices-service';
import { logout } from '@/store/slices/authSlice';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

const mockDispatch = jest.fn(async () => undefined);
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/store/slices/authSlice', () => ({ logout: jest.fn((options: unknown) => ({ type: 'auth/logout', options })) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/services/session-devices-service', () => ({ listUserSessions: jest.fn(), revokeSession: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

const NOW = new Date('2026-11-01T11:00:00Z').getTime();
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_agent: 'WarehouseApp/1.2 (Android 15)', created_ip: '203.0.113.0/24', created_at: '2026-11-01T10:00:00Z',
  last_refreshed_at: '2026-11-01T10:30:00Z', expires_at: '2026-12-01T10:30:00Z', is_current: false, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

const press = async (testID: string) => {
  await userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime }).press(screen.getByTestId(testID));
};
const open = async (onUnsupported?: () => void) => {
  await render(<SignedInDevicesSection userId="u1" onUnsupported={onUnsupported} />);
};
const confirmSignOut = async () => {
  const buttons = jest.mocked(showAlert).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons.find(b => b.text === 'Sign out')!.onPress!(); });
};

it('lists each device: app and system, masked address, last used, and the tag on this device', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1', { is_current: true }), row('s2', { user_agent: null, created_ip: null, last_refreshed_at: null })] });
  await open();
  expect(screen.getAllByText('WarehouseApp 1.2 · Android 15')).toHaveLength(1);
  expect(screen.getByText('This device')).toBeOnTheScreen();
  expect(screen.getByText('From 203.0.113.0/24')).toBeOnTheScreen();
  expect(screen.getByText('Last used 30 min ago')).toBeOnTheScreen();
  expect(screen.getByText('Unknown device')).toBeOnTheScreen();
  expect(screen.getAllByText('Sign out this device')).toHaveLength(2);
});

it('asks before signing out, and sends nothing when the question is not confirmed', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1')] });
  await open();
  await press('session-signout-s1');
  expect(showAlert).toHaveBeenCalledWith('Sign out this device?', 'This device will need to sign in again.', expect.any(Array));
  expect(revokeSession).not.toHaveBeenCalled();
});

it('revokes, reads the list again, and says Device signed out when the session is gone', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: true, sessions: [row('s1'), row('s2')] }).mockResolvedValueOnce({ success: true, sessions: [row('s2')] });
  jest.mocked(revokeSession).mockResolvedValue({ success: true, revokedCurrent: false });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(revokeSession).toHaveBeenCalledWith('s1');
  expect(showToast).toHaveBeenCalledWith('Device signed out.');
  expect(showAlert).toHaveBeenCalledTimes(1);
});

it('claims no success when the list cannot be read again after the revoke: Not confirmed', async () => {
  jest.mocked(listUserSessions)
    .mockResolvedValueOnce({ success: true, sessions: [row('s1')] })
    .mockResolvedValueOnce({ success: false, message: "Couldn't load the signed-in devices." });
  jest.mocked(revokeSession).mockResolvedValue({ success: true, revokedCurrent: false });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(showAlert).toHaveBeenLastCalledWith('Not confirmed', expect.stringContaining('not known'));
  expect(showToast).not.toHaveBeenCalled();
});

it('says "Not signed out" when the server answered done but the session is still listed', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1')] });
  jest.mocked(revokeSession).mockResolvedValue({ success: true, revokedCurrent: false });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(showAlert).toHaveBeenLastCalledWith('Not signed out', expect.stringContaining('still signed in'));
  expect(showToast).not.toHaveBeenCalled();
});

it('signs out here, without a second server call, when the session revoked is this phone\'s own', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1', { is_current: true })] });
  jest.mocked(revokeSession).mockResolvedValue({ success: true, revokedCurrent: true });
  await open();
  await press('session-signout-s1');
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('device you are using now');
  await confirmSignOut();
  expect(logout).toHaveBeenCalledWith({ localOnly: true });
  expect(mockDispatch).toHaveBeenCalled();
  expect(listUserSessions).toHaveBeenCalledTimes(1);
});

it('is left out, and says so to the page, on a backend without the function', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: false, unsupported: true, message: 'x' });
  const onUnsupported = jest.fn();
  await open(onUnsupported);
  expect(onUnsupported).toHaveBeenCalled();
  expect(screen.toJSON()).toBeNull();
});

it('offers Retry when the list cannot be read', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: false, message: "Couldn't load the signed-in devices." }).mockResolvedValueOnce({ success: true, sessions: [] });
  await open();
  expect(screen.getByText("Couldn't load the signed-in devices.")).toBeOnTheScreen();
  await userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('No signed-in devices.')).toBeOnTheScreen();
});

it('reads the list again when the sign out got no answer, and says Device signed out if the session is gone', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: true, sessions: [row('s1'), row('s2')] }).mockResolvedValueOnce({ success: true, sessions: [row('s2')] });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: "Couldn't sign out this device. Try again." });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(listUserSessions).toHaveBeenCalledTimes(2);
  expect(showToast).toHaveBeenCalledWith('Device signed out.');
  expect(showAlert).toHaveBeenCalledTimes(1);
});

it('says Not signed out when, after a sign out with no answer, the session is still listed', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1')] });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: "Couldn't sign out this device. Try again." });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(showAlert).toHaveBeenLastCalledWith('Not signed out', expect.stringContaining('may not have reached the server'));
  expect(showAlert).not.toHaveBeenLastCalledWith('Not signed out', expect.stringContaining('allowed'));
  expect(showToast).not.toHaveBeenCalled();
});

it('signs out here when this phone\'s own sign out got no answer and the list no longer shows it', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: true, sessions: [row('s1', { is_current: true })] }).mockResolvedValueOnce({ success: true, sessions: [] });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: 'x' });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(logout).toHaveBeenCalledWith({ localOnly: true });
  expect(showToast).not.toHaveBeenCalled();
});

it('signs out normally, and asks the server once, when this phone\'s own sign out got no answer and the list cannot be read (42501 is no proof the session has ended; WH-3 WH-4)', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: true, sessions: [row('s1', { is_current: true })] }).mockResolvedValueOnce({ success: false, code: '42501', message: 'x' });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: 'x' });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(logout).toHaveBeenCalledWith();
  expect(logout).not.toHaveBeenCalledWith({ localOnly: true });
});

it('signs out here and asks the server once when this phone\'s own sign out got no answer and the list failed for the network', async () => {
  jest.mocked(listUserSessions).mockResolvedValueOnce({ success: true, sessions: [row('s1', { is_current: true })] }).mockResolvedValueOnce({ success: false, message: 'Network request failed' });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: 'x' });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(logout).toHaveBeenCalledWith();
  expect(logout).not.toHaveBeenCalledWith({ localOnly: true });
});

it('stays signed in and says so when this phone\'s own sign out got no answer and the session is still listed', async () => {
  jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [row('s1', { is_current: true })] });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: 'x' });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(logout).not.toHaveBeenCalled();
  expect(showAlert).toHaveBeenLastCalledWith('Not signed out', expect.stringContaining('may not have reached the server'));
});

it('says Not confirmed when the sign out got no answer and the list cannot be read either', async () => {
  jest.mocked(listUserSessions)
    .mockResolvedValueOnce({ success: true, sessions: [row('s1')] })
    .mockResolvedValueOnce({ success: false, message: "Couldn't load the signed-in devices." });
  jest.mocked(revokeSession).mockResolvedValue({ success: false, lostAnswer: true, message: "Couldn't sign out this device. Try again." });
  await open();
  await press('session-signout-s1');
  await confirmSignOut();
  expect(showAlert).toHaveBeenLastCalledWith('Not confirmed', expect.stringContaining('not known'));
  expect(showToast).not.toHaveBeenCalled();
});

describe('WH-411: the list names a phone by its own name', () => {
  // The service's reading of device_name is in src/services/__tests__/sessionDevicesService.test.ts.
  it('shows device_name when the session has one, two phones of one model told apart by the mark, and no library name', async () => {
    jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [
      row('s1', { user_agent: 'okhttp/4.9.2', device_name: 'Samsung SM-A156E (7F3A)' }),
      row('s2', { user_agent: 'okhttp/4.9.2', device_name: 'Samsung SM-A156E (0B91)' }),
    ] });
    await open();
    expect(screen.getByText('Samsung SM-A156E (7F3A)')).toBeOnTheScreen();
    expect(screen.getByText('Samsung SM-A156E (0B91)')).toBeOnTheScreen();
    expect(screen.queryByText(/okhttp/)).not.toBeOnTheScreen();
  });

  it.each([
    ['null', null],
    ['absent', undefined],
    ['blank', '   '],
  ])('a device_name that is %s keeps the wording from the user agent, or "Unknown device" without one', async (_what, name) => {
    jest.mocked(listUserSessions).mockResolvedValue({ success: true, sessions: [
      row('s1', { device_name: name }),
      row('s2', { user_agent: null, device_name: name }),
    ] });
    await open();
    expect(screen.getByText('WarehouseApp 1.2 · Android 15')).toBeOnTheScreen();
    expect(screen.getByText('Unknown device')).toBeOnTheScreen();
  });
});
