/**
 * One press of "Verify code" starts one check on the screens that draw the shared code form
 * (src/components/auth/CodeEntryForm.tsx): a facility's own SMS sign-in (app/otp.tsx) and the
 * linking step (app/facility-link.tsx). The central code step has its own file
 * (CentralOtpOneCheck.test.tsx).
 *
 * The form arms a 300 ms submit when the sixth digit is typed. A press of the button before
 * that timer fires must take the timer's place, not add to it. The real screens and the real
 * form run; only the network calls and navigation are stand-ins, and the check never answers
 * (the person is still waiting), so every call is counted.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '@/components/ui/Button';
import OTPScreen from '../../../app/otp';
import FacilityLinkScreen from '../../../app/facility-link';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { verifyOTP } from '@/config/supabaseConfig';
import { completeFacilityLink } from '@/config/openFacility';
import { showAlert } from '@/utils/alert';

const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { phoneNumber: '+919000000001', isVerifyingOTP: false, isAuthenticating: false },
};
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
jest.mock('@/config/supabaseConfig', () => ({
  verifyOTP: jest.fn(() => new Promise(() => undefined)),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/config/openFacility', () => ({
  completeFacilityLink: jest.fn(() => new Promise(() => undefined)),
  resendFacilityLinkCode: jest.fn(),
  cancelFacilityLink: jest.fn(),
}));

let tree: ReactTestRenderer | undefined;
/** Every promise chain that can run, runs; timers stay where they are. */
const settle = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const input = () => tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
const verifyButton = () => tree!.root.findAllByType(Button).find(node => node.props.children === 'Verify code')!;

/** What each screen does with the code 482913: the call that starts its check, and what it is called with. */
const SCREENS = [
  { name: 'app/otp.tsx (facility SMS sign-in)', screen: <OTPScreen />, started: () => jest.mocked(verifyOTP), args: ['+919000000001', '482913'] },
  { name: 'app/facility-link.tsx (linking step)', screen: <FacilityLinkScreen />, started: () => jest.mocked(completeFacilityLink), args: ['482913'] },
];

beforeEach(() => {
  jest.mocked(verifyOTP).mockClear();
  jest.mocked(completeFacilityLink).mockClear();
  jest.mocked(showAlert).mockClear();
  resetCentralStateForTests();
  setCentralState({ pendingLink: { origin: 'https://north-cold.example.test', name: 'North Cold Store', phoneNumber: '919000000001' } });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.useRealTimers();
});

describe.each(SCREENS)('$name', ({ screen, started, args }) => {
  it('"Verify code" pressed 150 ms after the sixth digit starts ONE check, also after the 300 ms timer would have fired', async () => {
    jest.useFakeTimers();
    await act(async () => { tree = create(screen); });
    await act(async () => { input().props.onChangeText('482913'); });
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(started()).not.toHaveBeenCalled();
    await act(async () => { verifyButton().props.onPress(); await settle(); });
    expect(started()).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1000); await settle(); });
    expect(started()).toHaveBeenCalledTimes(1);
    expect(started()).toHaveBeenCalledWith(...args);
  });

  it('with nothing pressed the sixth digit starts ONE check, 300 ms later', async () => {
    jest.useFakeTimers();
    await act(async () => { tree = create(screen); });
    await act(async () => { input().props.onChangeText('482913'); });
    await act(async () => { jest.advanceTimersByTime(299); await settle(); });
    expect(started()).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); await settle(); });
    expect(started()).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(2000); await settle(); });
    expect(started()).toHaveBeenCalledTimes(1);
  });

  it('a short code is not sent; the button says so and no timer sends it later', async () => {
    jest.useFakeTimers();
    await act(async () => { tree = create(screen); });
    await act(async () => { input().props.onChangeText('4829'); });
    await act(async () => { verifyButton().props.onPress(); await settle(); });
    expect(jest.mocked(showAlert).mock.calls.map(call => call[0])).toEqual(['Enter the full code']);
    await act(async () => { jest.advanceTimersByTime(2000); await settle(); });
    expect(started()).not.toHaveBeenCalled();
  });
});
