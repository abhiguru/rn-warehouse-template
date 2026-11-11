/** Sign-in with a code from the facility: the central link, the three steps and each refusal. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import FacilityCodeScreen from '../../../app/facility-code';
import CentralLoginScreen from '../../../app/central-login';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { Button } from '@/components/ui/Button';
import { listFacilitiesForCode, prepareFacilityForCode } from '@/config/breakGlass';
import { breakGlassSignIn } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';
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

let tree: ReactTestRenderer;
const render = async (element: React.ReactElement) => { await act(async () => { tree = create(element); }); };
const texts = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
const pressId = async (id: string) => {
  const node = tree.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function');
  await act(async () => { await node.props.onPress(); });
};
const toCodeStep = async () => {
  await render(<FacilityCodeScreen />);
  await pressId(`facility-code-${NORTH.origin}`);
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onChangePhone('9000000002'); });
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onSubmit(); });
};
const enterCode = async () => { await act(async () => { await tree.root.findByType(CodeEntryForm).props.onVerify('482913'); }); };

afterEach(() => { act(() => tree?.unmount()); });

beforeEach(() => {
  jest.clearAllMocks();
  resetCentralStateForTests();
  setLanguage('en');
  jest.mocked(listFacilitiesForCode).mockResolvedValue([NORTH] as never);
  jest.mocked(prepareFacilityForCode).mockResolvedValue({ ok: true });
});

it('is linked from the central sign-in, always', async () => {
  await render(<CentralLoginScreen />);
  const alternative = tree.root.findByType(PhoneSignInForm).props.alternative;
  expect(alternative.label).toBe('Sign in with a code from your facility');
  alternative.onPress();
  expect(router.push).toHaveBeenCalledWith('/facility-code');
});

it('offers the facilities of the phone and goes on to the mobile number and the code', async () => {
  await render(<FacilityCodeScreen />);
  expect(texts()).toContain('North Cold Storage');
  await pressId(`facility-code-${NORTH.origin}`);
  expect(prepareFacilityForCode).toHaveBeenCalledWith(NORTH);
  expect(tree.root.findByType(PhoneSignInForm).props.facility.name).toBe('North Cold Storage');
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onChangePhone('9000000002'); });
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onSubmit(); });
  expect(tree.root.findAllByType(CodeEntryForm)).toHaveLength(1);
  expect(tree.root.findByType(CodeEntryForm).props.facilityMade).toBe(true);
});

it('stays on the list and says why when the facility cannot be prepared', async () => {
  jest.mocked(prepareFacilityForCode).mockResolvedValue({ ok: false, message: 'North cannot be reached' });
  await render(<FacilityCodeScreen />);
  await pressId(`facility-code-${NORTH.origin}`);
  expect(showAlert).toHaveBeenCalledWith("Couldn't sign in", 'North cannot be reached');
  expect(tree.root.findAllByType(PhoneSignInForm)).toHaveLength(0);
});

it('asks for a valid number before the code', async () => {
  await render(<FacilityCodeScreen />);
  await pressId(`facility-code-${NORTH.origin}`);
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onChangePhone('123'); });
  await act(async () => { tree.root.findByType(PhoneSignInForm).props.onSubmit(); });
  expect(showAlert).toHaveBeenCalled();
  expect(tree.root.findAllByType(CodeEntryForm)).toHaveLength(0);
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
  expect(tree.root.findAllByType(CodeEntryForm)).toHaveLength(1);
});

it('explains an empty list and goes back', async () => {
  jest.mocked(listFacilitiesForCode).mockResolvedValue([]);
  await render(<FacilityCodeScreen />);
  expect(texts()).toContain('No facilities on this phone');
  await act(async () => { tree.root.findAllByType(Button).find(b => b.props.children === 'Back')!.props.onPress(); });
  expect(router.back).toHaveBeenCalled();
});

describe('a used, expired or locked facility code (WH-126)', () => {
  const codeInput = () => tree.root.find(n => n.props.textContentType === 'oneTimeCode' && typeof n.props.onChangeText === 'function');
  const refusalText = () => tree.root.findAll(n => n.props.testID === 'code-refusal' && typeof n.props.accessibilityLabel === 'string')[0]?.props.accessibilityLabel as string | undefined;
  const typeAndVerify = async () => {
    await act(async () => { codeInput().props.onChangeText('482913'); });
    await act(async () => { await tree.root.findByType(CodeEntryForm).props.onVerify('482913'); });
  };

  it.each([
    ['code_used', 'This code has already been used. Ask your facility for a new code.'],
    ['code_expired', 'This code has expired. Ask your facility for a new code.'],
    ['code_locked', 'This code is locked after too many wrong tries. Ask your facility for a new code.'],
  ] as const)('%s shows its own text under the code boxes, keeps the typed code and raises no alert', async (reason, text) => {
    jest.mocked(breakGlassSignIn).mockResolvedValue({ success: false, reason });
    await toCodeStep();
    expect(refusalText()).toBeUndefined();
    await typeAndVerify();
    expect(refusalText()).toBe(text);
    expect(texts()).toContain(text);
    expect(codeInput().props.value).toBe('482913');
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
    await typeAndVerify();
    expect(refusalText()).toBe(text);
  });

  it('the text goes when the person tries again and the next answer is another refusal', async () => {
    jest.mocked(breakGlassSignIn).mockResolvedValueOnce({ success: false, reason: 'code_used' });
    await toCodeStep();
    await typeAndVerify();
    expect(refusalText()).toContain('already been used');
    jest.mocked(breakGlassSignIn).mockResolvedValueOnce({ success: false, reason: 'refused' });
    await typeAndVerify();
    expect(refusalText()).toBeUndefined();
    expect(showAlert).toHaveBeenCalledWith("Couldn't sign in", expect.stringContaining("doesn't work"));
  });
});
