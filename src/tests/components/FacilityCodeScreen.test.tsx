/** Sign-in with a code from the facility: the central link, the three steps and each refusal. */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import FacilityCodeScreen from '../../../app/facility-code';
import CentralLoginScreen from '../../../app/central-login';
import { listFacilitiesForCode, prepareFacilityForCode } from '@/config/breakGlass';
import { breakGlassSignIn } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { setLanguage, t as tr } from '@/i18n';
import { resetCentralStateForTests } from '@/config/centralState';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));
jest.mock('@/config/centralSession', () => ({ requestCentralCode: jest.fn(), verifyCentralCode: jest.fn() }));
jest.mock('@/config/breakGlass', () => ({ listFacilitiesForCode: jest.fn(), prepareFacilityForCode: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({ breakGlassSignIn: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({ setUserProfile: (p: unknown) => ({ type: 'setUserProfile', payload: p }), clearSignOutReason: jest.fn() }));
jest.mock('@/components/AppTooOldScreen', () => () => null);

const NORTH = { origin: 'https://north-cold.example.test', instanceId: 'i', name: 'North Cold Storage', city: 'Rajkot', status: 'approved', lastOpenedAt: null, addedAt: '', source: null, gone: false };

const user = userEvent.setup({ delay: 0 });
const sendCode = () => user.press(screen.getByRole('button', { name: tr('common.continue') }));
const toCodeStep = async () => {
  await render(<FacilityCodeScreen />);
  await user.press(await screen.findByTestId(`facility-code-${NORTH.origin}`));
  await user.type(await screen.findByLabelText(tr('common.mobileNumber')), '9000000002');
  await sendCode();
};
const codeInput = () => screen.getByLabelText(tr('auth.otp.codeLabel'));
const enterCode = async () => {
  await user.clear(codeInput());
  await user.type(codeInput(), '482913');
  await user.press(screen.getByRole('button', { name: tr('auth.otp.verify') }));
};

beforeEach(() => {
  jest.clearAllMocks();
  resetCentralStateForTests();
  setLanguage('en');
  jest.mocked(listFacilitiesForCode).mockResolvedValue([NORTH] as never);
  jest.mocked(prepareFacilityForCode).mockResolvedValue({ ok: true });
});

it('is linked from the central sign-in, always', async () => {
  await render(<CentralLoginScreen />);
  await user.press(screen.getByRole('button', { name: 'Sign in with a code from your facility' }));
  expect(router.push).toHaveBeenCalledWith('/facility-code');
});

it('offers the facilities of the phone and goes on to the mobile number and the code', async () => {
  await render(<FacilityCodeScreen />);
  expect(await screen.findByText('North Cold Storage')).toBeOnTheScreen();
  await user.press(await screen.findByTestId(`facility-code-${NORTH.origin}`));
  expect(prepareFacilityForCode).toHaveBeenCalledWith(NORTH);
  // The facility's name now heads the mobile number step, and the facility list has gone.
  expect(await screen.findByLabelText(tr('common.mobileNumber'))).toBeOnTheScreen();
  expect(screen.getByText('North Cold Storage')).toBeOnTheScreen();
  await user.type(await screen.findByLabelText(tr('common.mobileNumber')), '9000000002');
  await sendCode();
  expect(codeInput()).toBeOnTheScreen();
  // A code the facility made has no expiry countdown and no Resend (the facility's operator gives a new one).
  expect(screen.queryByText(/^Code expires in/)).not.toBeOnTheScreen();
  expect(screen.queryByText('Resend code')).not.toBeOnTheScreen();
});

it('stays on the list and says why when the facility cannot be prepared', async () => {
  jest.mocked(prepareFacilityForCode).mockResolvedValue({ ok: false, message: 'North cannot be reached' });
  await render(<FacilityCodeScreen />);
  await user.press(await screen.findByTestId(`facility-code-${NORTH.origin}`));
  expect(showAlert).toHaveBeenCalledWith("Couldn't sign in", 'North cannot be reached');
  expect(screen.queryByLabelText(tr('common.mobileNumber'))).not.toBeOnTheScreen();
});

it('asks for a valid number before the code', async () => {
  await render(<FacilityCodeScreen />);
  await user.press(await screen.findByTestId(`facility-code-${NORTH.origin}`));
  await user.type(await screen.findByLabelText(tr('common.mobileNumber')), '123');
  await sendCode();
  expect(showAlert).toHaveBeenCalled();
  expect(screen.queryByLabelText(tr('auth.otp.codeLabel'))).not.toBeOnTheScreen();
});

it('signs in on a correct code and opens the facility', async () => {
  jest.mocked(breakGlassSignIn).mockResolvedValue({ success: true, data: { userProfile: { id: 'p' } } } as never);
  await toCodeStep();
  await enterCode();
  expect(breakGlassSignIn).toHaveBeenCalledWith('+919000000002', '482913');
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'setUserProfile', payload: { id: 'p' } });
  expect(router.replace).toHaveBeenCalledWith('/');
});

it.each([
  ['refused', "That code doesn't work. Facility codes are for facility staff; ask your facility's operator for a new code."],
  ['rate_limited', 'Too many tries. Wait a few minutes and try again.'],
  ['unavailable', "This facility's server can't sign you in with a code right now. Try again later."],
  ['network', 'Check your connection and try again.'],
] as const)('tells a %s refusal in its own words and stays on the code step', async (reason, text) => {
  jest.mocked(breakGlassSignIn).mockResolvedValue({ success: false, reason });
  await toCodeStep();
  await enterCode();
  expect(showAlert).toHaveBeenCalledWith("Couldn't sign in", text);
  expect(router.replace).not.toHaveBeenCalled();
  expect(codeInput()).toBeOnTheScreen();
});

it('explains an empty list and goes back', async () => {
  jest.mocked(listFacilitiesForCode).mockResolvedValue([]);
  await render(<FacilityCodeScreen />);
  expect(await screen.findByText('No facilities on this phone')).toBeOnTheScreen();
  await user.press(screen.getByTestId('facility-code-back'));
  expect(router.back).toHaveBeenCalled();
});

describe('a used, expired or locked facility code (WH-126)', () => {
  const refusalText = () => screen.queryByTestId('code-refusal')?.props.accessibilityLabel as string | undefined;

  it.each([
    ['code_used', 'This code has already been used. Ask your facility for a new code.'],
    ['code_expired', 'This code has expired. Ask your facility for a new code.'],
    ['code_locked', 'This code is locked after too many wrong tries. Ask your facility for a new code.'],
  ] as const)('%s shows its own text under the code boxes, keeps the typed code and raises no alert', async (reason, text) => {
    jest.mocked(breakGlassSignIn).mockResolvedValue({ success: false, reason });
    await toCodeStep();
    expect(refusalText()).toBeUndefined();
    await enterCode();
    expect(refusalText()).toBe(text);
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(codeInput()).toHaveDisplayValue('482913');
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['code_used', 'આ કોડ વપરાઈ ગયો છે. તમારી ફેસિલિટી પાસેથી નવો કોડ માંગો.'],
    ['code_expired', 'આ કોડનો સમય પૂરો થયો છે. તમારી ફેસિલિટી પાસેથી નવો કોડ માંગો.'],
    ['code_locked', 'ઘણા ખોટા પ્રયાસો પછી આ કોડ બંધ થઈ ગયો છે. તમારી ફેસિલિટી પાસેથી નવો કોડ માંગો.'],
  ] as const)('%s is told in Gujarati with the facility wording, and a locked code is never told to wait', async (reason, text) => {
    setLanguage('gu');
    jest.mocked(breakGlassSignIn).mockResolvedValue({ success: false, reason });
    await toCodeStep();
    await enterCode();
    expect(refusalText()).toBe(text);
  });

  it('the text goes when the person tries again and the next answer is another refusal', async () => {
    jest.mocked(breakGlassSignIn).mockResolvedValueOnce({ success: false, reason: 'code_used' });
    await toCodeStep();
    await enterCode();
    expect(refusalText()).toContain('already been used');
    jest.mocked(breakGlassSignIn).mockResolvedValueOnce({ success: false, reason: 'refused' });
    await enterCode();
    expect(refusalText()).toBeUndefined();
    expect(showAlert).toHaveBeenCalledWith("Couldn't sign in", expect.stringContaining("doesn't work"));
  });
});
