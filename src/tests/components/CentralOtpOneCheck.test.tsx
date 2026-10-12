/**
 * The central code step starts one check per code. Real app/central-otp.tsx, real
 * CodeEntryForm, real centralSession.ts; only the network and the secure store are
 * stand-ins.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import CentralOtpScreen from '../../../app/central-otp';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { resetCentralSessionForTests, restoreCentralSession } from '@/config/centralSession';
import { showAlert } from '@/utils/alert';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const navigation = { addListener: jest.fn(() => () => undefined) };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(),
      canDismiss: jest.fn(() => false), dismissAll: jest.fn(),
    },
    useNavigation: () => navigation,
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));

const secure = new Map<string, string>();
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, url: '', headers: { get: () => null }, json: async () => body });

let tree: ReactTestRenderer | undefined;
/** Every promise chain that can run, runs; timers stay where they are. */
const settle = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const verifyCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/otp/verify'));

beforeEach(async () => {
  secure.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.mocked(showAlert).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  resetCentralSessionForTests();
  resetCentralStateForTests();
  await restoreCentralSession();
  setCentralState({ signInPhone: '+919000000001' });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});
afterAll(() => { global.fetch = originalFetch; });

const input = () => tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
const verifyButton = () => tree!.root.findAllByType(Button).find(node => node.props.children === 'Verify code')!;

describe('the central code step', () => {
  it('R7. "Verify code" pressed within 300 ms of the sixth digit starts ONE check', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => undefined)); // the answer is on its way
    await act(async () => { tree = create(<CentralOtpScreen />); });
    await act(async () => { input().props.onChangeText('482913'); });
    await act(async () => { jest.advanceTimersByTime(150); });
    await act(async () => { verifyButton().props.onPress(); await settle(); });
    await act(async () => { jest.advanceTimersByTime(1000); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
  });

  it('R7b. two submits in the same frame (before the screen has drawn "verifying") start ONE check', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    await act(async () => { tree = create(<CentralOtpScreen />); });
    await act(async () => { input().props.onChangeText('482913'); });
    const pressNow = verifyButton().props.onPress;
    await act(async () => { pressNow(); pressNow(); await settle(); });
    await act(async () => { jest.advanceTimersByTime(1000); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
  });

  it('R7c. nothing pressed: the sixth digit starts ONE check, 300 ms later (the auto-submit is unchanged)', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    await act(async () => { tree = create(<CentralOtpScreen />); });
    await act(async () => { input().props.onChangeText('482913'); });
    await act(async () => { jest.advanceTimersByTime(299); await settle(); });
    expect(verifyCalls()).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(1); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(2000); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
  });

  it('R7d. a wrong code answered before the 300 ms timer would fire: ONE check, ONE message', async () => {
    jest.useFakeTimers();
    // The answer comes at once, so the screen is free again when the sixth-digit timer is due.
    fetchMock.mockImplementation(async () => reply(401, { error: { code: 'invalid_code', message: 'x' } }));
    await act(async () => { tree = create(<CentralOtpScreen />); });
    await act(async () => { input().props.onChangeText('482913'); });
    await act(async () => { jest.advanceTimersByTime(150); });
    await act(async () => { verifyButton().props.onPress(); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(1000); await settle(); });
    expect(verifyCalls()).toHaveLength(1);
    expect(jest.mocked(showAlert).mock.calls.map(call => call[0])).toEqual(["Couldn't verify the code"]);
  });
});
