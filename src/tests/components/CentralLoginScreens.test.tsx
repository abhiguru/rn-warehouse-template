/**
 * The central login screens (docs/CENTRAL_LOGIN.md, style guide §14.8): central
 * sign-in and its code step, My facilities, the catalogue, the linking step and
 * the account. Each renders in all four themes with token colours; below that,
 * what each screen does.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui/StatusTag';
import CentralLoginScreen from '../../../app/central-login';
import CentralOtpScreen from '../../../app/central-otp';
import FacilitiesScreen from '../../../app/facilities';
import FacilityCatalogueScreen, { matchesFacilitySearch } from '../../../app/facility-catalogue';
import FacilityLinkScreen from '../../../app/facility-link';
import CentralAccountScreen, { isValidCentralName } from '../../../app/central-account';
import { resetCentralStateForTests, setCentralState, getCentralState, type OpenOutcome } from '@/config/centralState';
import {
  fetchCentralProfile,
  fetchFacilityCatalogue,
  requestCentralCode,
  updateCentralName,
  verifyCentralCode,
  type CatalogueFacility,
} from '@/config/centralSession';
import { addMyFacility, loadMyFacilities, type MyFacility } from '@/config/centralFacilities';
import { beginFacilitySmsSignIn, completeFacilityLink, openFacility, resendFacilityLinkCode } from '@/config/openFacility';
import { deleteAccountEverywhere, signOutAllDevices, signOutEverywhere } from '@/store/centralSignOut';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { setLanguage } from '@/i18n';

type MockState = { theme: { preference: Mode; brand: Brand }; auth: Record<string, unknown> };
let mockState: MockState = { theme: { preference: 'light', brand: 'orange' }, auth: {} };
const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  // The code step listens for its own removal from the stack; nothing removes it here.
  const navigation = { addListener: jest.fn(() => () => undefined) };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(),
      canDismiss: jest.fn(() => false), dismissAll: jest.fn(),
    },
    useNavigation: () => navigation,
    useIsFocused: () => true,
    useFocusEffect: require('./focusHarness').useFocusEffect,
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));
jest.mock('@/config/centralSession', () => ({
  requestCentralCode: jest.fn(),
  verifyCentralCode: jest.fn(),
  fetchFacilityCatalogue: jest.fn(),
  fetchCentralProfile: jest.fn(async () => ({ ok: true })),
  updateCentralName: jest.fn(),
}));
// The test renderer has no native node to name: the box gets a handle, so the focus move can be seen.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({ ...jest.requireActual('react-native/Libraries/ReactNative/RendererProxy'), findNodeHandle: jest.fn(() => 7) }));
jest.mock('@/config/centralFacilities', () => ({
  ...jest.requireActual('@/config/centralFacilities'),
  loadMyFacilities: jest.fn(),
  addMyFacility: jest.fn(async () => {}),
  onMyFacilitiesChange: jest.fn(() => () => undefined),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/config/openFacility', () => ({
  openFacility: jest.fn(async () => ({ kind: 'login' })),
  beginFacilitySmsSignIn: jest.fn(async () => ({ kind: 'sms_offer' })),
  // This My facilities is the one that takes the answer.
  consumeOpenOutcome: jest.fn(() => true),
  completeFacilityLink: jest.fn(),
  resendFacilityLinkCode: jest.fn(),
  cancelFacilityLink: jest.fn(),
}));
jest.mock('@/store/centralSignOut', () => ({
  signOutEverywhere: jest.fn(async () => ({ ok: true })),
  signOutAllDevices: jest.fn(async () => ({ ok: true })),
  deleteAccountEverywhere: jest.fn(async () => ({ ok: true })),
}));
// The language switch has its own controls and store access; it is not under test here.
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));
const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '2026-10-12T06:00:12.000Z' };
const NORTH = 'https://north-cold.example.test';

let tree: ReactTestRenderer | undefined;
async function render(element: React.ReactElement, brand: Brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand }, auth: {} };
  await act(async () => { tree = create(element); });
  return tree!;
}
const texts = () =>
  tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
const hasBackground = (colour: string) =>
  tree!.root.findAll(node => {
    const style = [].concat(node.props.style ?? []).flat(3).filter(Boolean) as Array<{ backgroundColor?: string }>;
    return style.some(s => s.backgroundColor === colour);
  }).length > 0;
const button = (label: string) => {
  const found = tree!.root.findAllByType(Button).find(node => node.props.children === label || node.props.accessibilityLabel === label);
  if (!found) throw new Error(`no button "${label}"; buttons: ${tree!.root.findAllByType(Button).map(node => node.props.children).join(' | ')}`);
  return found;
};
const byTestID = (testID: string) => tree!.root.find(node => node.props.testID === testID && typeof node.props.onPress === 'function');
const press = async (node: { props: { onPress?: () => unknown } }) => {
  await act(async () => { await node.props.onPress?.(); });
};
const alerts = () => jest.mocked(showAlert).mock.calls;
const lastAlertButton = (text: string) => {
  const call = alerts()[alerts().length - 1];
  return (call[2] as Array<{ text: string; onPress?: () => void }>).find(entry => entry.text === text)!;
};
const facility = (name: string, status: MyFacility['status'], city = 'Rajkot'): MyFacility => ({
  origin: `https://${name.toLowerCase().replace(/[^a-z]+/g, '-')}.example.test`,
  instanceId: null,
  name,
  city,
  status,
  lastOpenedAt: null,
  addedAt: '',
});
/** A catalogue entry as centralSession.ts reads it; `online: null` is a catalogue from before central 0.8.0. */
const entry = (id: string, name: string, town: string, extra: Partial<CatalogueFacility> = {}): CatalogueFacility => ({
  id,
  name,
  city: town,
  town,
  district: '',
  origin: `https://${id}.example.test`,
  operator: 'Fictional Operator',
  online: null,
  lastSeenAt: null,
  ...extra,
});
const publish = async (outcome: OpenOutcome, name = 'North Cold Store') => {
  await act(async () => { setCentralState({ outcome: { id: 7, origin: NORTH, name, outcome } }); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER, autoOpenSpent: true });
  jest.mocked(loadMyFacilities).mockResolvedValue([]);
  jest.mocked(openFacility).mockResolvedValue({ kind: 'login' });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  setLanguage('en');
});

// ---------------------------------------------------------------------------------------
describe.each(THEMES)('central login screens in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('central sign-in: title, note, +91 field, the terms tick and "Send code"', async () => {
    setCentralState({ status: 'signedOut', user: null });
    await render(<CentralLoginScreen />, brand, mode);
    for (const words of [
      'Sign in',
      'Enter your mobile number to get a one-time code.',
      'One sign-in for every member cold storage.',
      'MOBILE NUMBER',
      '+91',
      'I agree to the Terms of Service and the Privacy Policy',
      'Send code',
    ]) {
      expect(texts()).toContain(words);
    }
    // No facility line: this sign-in is not for one facility.
    expect(texts()).not.toContain('Change');
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('central code step uses one-time-code autofill for the number the code went to', async () => {
    setCentralState({ status: 'signedOut', user: null, signInPhone: '+919000000001' });
    await render(<CentralOtpScreen />, brand, mode);
    const input = tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
    expect(input.props.autoComplete).toBe('sms-otp');
    expect(texts()).toContain('+91 90000 00001');
    expect(texts()).toContain('Verify your phone');
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('My facilities: one status tag per status, in its colour role', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([
      facility('North Cold Store', 'approved'),
      facility('South Cold Store', 'requested', 'Gondal'),
      facility('East Cold Store', 'revoked', 'Morbi'),
      facility('West Cold Store', 'link_needed', ''),
      facility('Central Cold Store', 'unavailable', 'Jamnagar'),
    ]);
    await render(<FacilitiesScreen />, brand, mode);
    for (const words of ['My facilities', 'North Cold Store', 'Rajkot', 'Approved', 'Requested', 'Revoked', 'Code needed', 'Unavailable', 'Add facility', 'Sign out', 'Asha Fictional', '+91 90000 00001']) {
      expect(texts()).toContain(words);
    }
    const tagBackground = (origin: string) =>
      ([] as Array<{ backgroundColor?: string }>)
        .concat(tree!.root.find(node => node.props.testID === `facility-status-${origin}` && (node.type as unknown) === 'View').props.style)
        .flat(3)
        .find(style => style?.backgroundColor)?.backgroundColor;
    expect(tagBackground('https://north-cold-store.example.test')).toBe(t.status.positive.background);
    expect(tagBackground('https://south-cold-store.example.test')).toBe(t.status.critical.background);
    expect(tagBackground('https://east-cold-store.example.test')).toBe(t.status.negative.background);
    expect(tagBackground('https://west-cold-store.example.test')).toBe(t.status.neutral.background);
    expect(tagBackground('https://central-cold-store.example.test')).toBe(t.status.neutral.background);
    expect(hasBackground(t.background.base)).toBe(true);
    expect(hasBackground(t.surface.card)).toBe(true);
  });

  it('Add facility: the catalogue with its search field, one tag per availability in its colour role, a greyed member with no app server', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({
      ok: true,
      facilities: [
        entry('north-cold', 'North Cold Store', 'Rajkot', { origin: NORTH, online: true }),
        entry('east-cold', 'East Cold Store', 'Morbi', { online: false }),
        entry('gcsa-024', 'Fictional Sabar Cold', 'Himmatnagar', { district: 'Sabarkantha', origin: null }),
      ],
    });
    await render(<FacilityCatalogueScreen />, brand, mode);
    expect(texts()).toEqual(
      expect.arrayContaining(['Add facility', 'North Cold Store', 'Rajkot', 'Himmatnagar, Sabarkantha', 'Online', 'Offline', 'No app server yet', 'Enter address'])
    );
    expect(tree!.root.findAll(node => node.props.placeholder === 'Search by name, town or district').length).toBeGreaterThan(0);
    const tagBackground = (id: string) =>
      ([] as Array<{ backgroundColor?: string }>)
        .concat(tree!.root.find(node => node.props.testID === `catalogue-status-${id}` && (node.type as unknown) === 'View').props.style)
        .flat(3)
        .find(style => style?.backgroundColor)?.backgroundColor;
    expect(tagBackground('north-cold')).toBe(t.status.positive.background);
    expect(tagBackground('east-cold')).toBe(t.status.negative.background);
    expect(tagBackground('gcsa-024')).toBe(t.status.neutral.background);
    // Greyed with the secondary tokens, never with opacity.
    const styleOf = (text: string) =>
      Object.assign({}, ...[].concat(tree!.root.find(node => (node.type as unknown) === 'Text' && node.props.children === text).props.style).flat(3).filter(Boolean)) as {
        color?: string;
        opacity?: number;
      };
    expect(styleOf('Fictional Sabar Cold').color).toBe(t.text.secondary);
    expect(styleOf('North Cold Store').color).toBe(t.text.primary);
    expect(styleOf('Fictional Sabar Cold').opacity).toBeUndefined();
    expect(byTestID('catalogue-gcsa-024').findAll(node => node.props.name === 'office-building-outline')[0].props.color).toBe(t.icon.secondary);
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('the linking step says why a code is asked for', async () => {
    setCentralState({ pendingLink: { origin: NORTH, name: 'North Cold Store', phoneNumber: '919000000001' } });
    await render(<FacilityLinkScreen />, brand, mode);
    expect(texts()).toContain('Enter the code from North Cold Store');
    expect(texts()).toContain('North Cold Store asks for its own code each time you sign in. Enter the 6-digit code it sent to');
    expect(texts()).toContain('+91 90000 00001');
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('the account: the number signed in with, the name and "Delete my account"', async () => {
    await render(<CentralAccountScreen />, brand, mode);
    expect(texts()).toEqual(expect.arrayContaining(['Account', 'Signed in with +91 90000 00001', 'Save name', 'Sign out on all phones', 'Delete my account']));
    expect(tree!.root.find(node => node.props.testID === 'central-name' && typeof node.props.onChangeText === 'function').props.value).toBe('Asha Fictional');
    expect(hasBackground(t.background.base)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
describe('central sign-in', () => {
  beforeEach(() => setCentralState({ status: 'signedOut', user: null }));
  const type = async (digits: string) => {
    const field = tree!.root.find(node => node.props.accessibilityLabel === 'Mobile number' && typeof node.props.onChangeText === 'function');
    await act(async () => { field.props.onChangeText(digits); });
  };
  const tick = () => press(tree!.root.find(node => node.props.testID === 'accept-terms' && typeof node.props.onPress === 'function'));
  const checked = () => tree!.root.find(node => node.props.testID === 'accept-terms' && typeof node.props.onPress === 'function').props.accessibilityState.checked;

  const termsError = () => tree!.root.findAll(node => node.props.testID === 'accept-terms-error');

  it('on a first sign-in "Send code" stays pressable; unticked, a tap sends nothing and says to tick the box', async () => {
    jest.mocked(requestCentralCode).mockResolvedValue({ ok: true, resendAfterSeconds: 60, expiresAt: null });
    await render(<CentralLoginScreen />);
    await type('9000000001');
    expect(checked()).toBe(false);
    expect(button('Send code').props.disabled).toBe(false);
    expect(termsError()).toHaveLength(0);
    const setFocus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await press(button('Send code'));
    expect(requestCentralCode).not.toHaveBeenCalled();
    expect(JSON.stringify(termsError()[0].props.children)).toContain('Tick the box above to continue');
    // The focus goes to the box.
    expect(setFocus).toHaveBeenCalledWith(7);

    await tick();
    expect(checked()).toBe(true);
    expect(termsError()).toHaveLength(0);
    expect(button('Send code').props.disabled).toBe(false);
    await press(button('Send code'));
    expect(requestCentralCode).toHaveBeenCalledTimes(1);
    expect(requestCentralCode).toHaveBeenCalledWith('+919000000001');
    expect(getCentralState().signInPhone).toBe('+919000000001');
    expect(router.push).toHaveBeenCalledWith('/central-otp');

    // Unticking makes a tap say so again, without sending.
    await tick();
    jest.mocked(requestCentralCode).mockClear();
    await press(button('Send code'));
    expect(requestCentralCode).not.toHaveBeenCalled();
    expect(termsError().length).toBeGreaterThan(0);
  });

  const tickShown = () => tree!.root.findAll(node => node.props.testID === 'accept-terms').length > 0;

  it('asks the tick of every NUMBER once: a second person on the same phone sees it, the first does not', async () => {
    // Asha has signed in on this phone before.
    await AsyncStorage.setItem('central_terms_accepted_v1:919000000001', '2025-12');
    await render(<CentralLoginScreen />);
    expect(tickShown()).toBe(true);
    await type('9000000001');
    expect(tickShown()).toBe(false);
    expect(button('Send code').props.disabled).toBe(false);
    // Bhavin types his number on the same phone: the terms are asked of him.
    await type('9000000002');
    expect(tickShown()).toBe(true);
    jest.mocked(requestCentralCode).mockResolvedValue({ ok: true, resendAfterSeconds: 60, expiresAt: null });
    await press(button('Send code'));
    expect(requestCentralCode).not.toHaveBeenCalled();
    await tick();
    await press(button('Send code'));
    expect(requestCentralCode).toHaveBeenCalledWith('+919000000002');
    // Back to Asha's number, written with the country code this time: still no tick.
    await type('919000000001');
    expect(tickShown()).toBe(false);
  });

  it('a change from an accepted number to a new one shows the tick before the store has answered', async () => {
    await AsyncStorage.setItem('central_terms_accepted_v1:919000000001', '2025-12');
    await render(<CentralLoginScreen />);
    await type('9000000001');
    expect(tickShown()).toBe(false);
    expect(button('Send code').props.disabled).toBe(false);
    // The read for the new number never answers in this test (one call; the module
    // mock's own implementation stays in place for every later read).
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise(() => undefined));
    await type('9000000002');
    expect(tickShown()).toBe(true);
    jest.mocked(requestCentralCode).mockResolvedValue({ ok: true, resendAfterSeconds: 60, expiresAt: null });
    await press(button('Send code'));
    expect(requestCentralCode).not.toHaveBeenCalled();
  });

  it('asks again when the terms version has changed', async () => {
    await AsyncStorage.setItem('central_terms_accepted_v1:919000000001', '2024-01');
    await render(<CentralLoginScreen />);
    await type('9000000001');
    expect(tickShown()).toBe(true);
  });

  it('refuses a number that is not ten digits without calling the service', async () => {
    await render(<CentralLoginScreen />);
    await tick();
    await type('90000');
    await press(button('Send code'));
    expect(requestCentralCode).not.toHaveBeenCalled();
    expect(alerts()[0]).toEqual(['Check your mobile number', 'Enter a 10-digit mobile number.']);
  });

  it('counts down a wait the service named, and shows any other refusal as a message', async () => {
    jest.mocked(requestCentralCode).mockResolvedValueOnce({
      ok: false, code: 'resend_wait', message: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42,
    });
    await render(<CentralLoginScreen />);
    await tick();
    await type('9000000001');
    await press(button('Send code'));
    expect(alerts()).toHaveLength(0);
    expect(texts()).toContain('Please wait 42 seconds before requesting another code.');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a refusal without a wait in the app\'s words', async () => {
    jest.mocked(requestCentralCode).mockResolvedValue({
      ok: false, code: 'sms_unavailable', message: "The code couldn't be sent just now. Try again in a few minutes.",
    });
    await render(<CentralLoginScreen />);
    await tick();
    await type('9000000001');
    await press(button('Send code'));
    expect(alerts()[0]).toEqual(["Couldn't send the code", "The code couldn't be sent just now. Try again in a few minutes."]);
  });

  it('explains once why the person was signed out', async () => {
    setCentralState({ endedMessage: 'Your association sign-in has ended. Sign in again. If you did not expect this, open your account after signing in and choose Sign out on all phones.' });
    await render(<CentralLoginScreen />);
    expect(alerts()).toEqual([['Signed out', 'Your association sign-in has ended. Sign in again. If you did not expect this, open your account after signing in and choose Sign out on all phones.']]);
    expect(getCentralState().endedMessage).toBeNull();
  });
});

describe('central code step', () => {
  beforeEach(() => setCentralState({ status: 'signedOut', user: null, signInPhone: '+919000000001', autoOpenSpent: true }));
  const enter = async (code: string) => {
    const input = tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
    await act(async () => { input.props.onChangeText(code); });
    await press(button('Verify code'));
  };

  it('a correct code goes to My facilities and remembers that the terms were accepted', async () => {
    jest.mocked(verifyCentralCode).mockResolvedValue({ ok: true, user: USER });
    await render(<CentralOtpScreen />);
    await enter('482913');
    expect(verifyCentralCode).toHaveBeenCalledWith('+919000000001', '482913', '2025-12');
    expect(router.replace).toHaveBeenCalledWith('/facilities');
    // Recorded for this number only.
    expect(await AsyncStorage.getItem('central_terms_accepted_v1:919000000001')).toBe('2025-12');
    expect((await AsyncStorage.getAllKeys()).filter(key => key.startsWith('central_terms_accepted_v1'))).toEqual(['central_terms_accepted_v1:919000000001']);
    // A new sign-in is a start: one approved facility may be opened without the list.
    expect(getCentralState().autoOpenSpent).toBe(false);
  });

  it('a wrong code stays on the screen with the message', async () => {
    jest.mocked(verifyCentralCode).mockResolvedValue({
      ok: false, code: 'invalid_code', message: 'That code is wrong or has expired. Check it, or ask for a new code.',
    });
    await render(<CentralOtpScreen />);
    await enter('000000');
    expect(alerts()[0]).toEqual(["Couldn't verify the code", 'That code is wrong or has expired. Check it, or ask for a new code.']);
    expect(router.replace).not.toHaveBeenCalled();
    expect((await AsyncStorage.getAllKeys()).filter(key => key.startsWith('central_terms_accepted_v1'))).toEqual([]);
  });

  it('without a number it returns to central sign-in', async () => {
    setCentralState({ signInPhone: null });
    await render(<CentralOtpScreen />);
    expect(router.replace).toHaveBeenCalledWith('/central-login');
  });
});

describe('My facilities', () => {
  it('says what to do when the list is empty', async () => {
    await render(<FacilitiesScreen />);
    expect(texts()).toContain('No facilities yet');
    expect(texts()).toContain('Add the cold storage you work with. Each one decides what you can see.');
    expect(openFacility).not.toHaveBeenCalled();
  });

  it('shows the facilities in the order of the list: newest-opened first', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('South Cold Store', 'requested'), facility('North Cold Store', 'approved')]);
    await render(<FacilitiesScreen />);
    const names = texts().filter(text => text.endsWith('Cold Store'));
    expect(names).toEqual(['South Cold Store', 'North Cold Store']);
  });

  it('opens the facility that is tapped, and "Add facility" opens the catalogue', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('South Cold Store', 'approved')]);
    await render(<FacilitiesScreen />);
    await press(byTestID('facility-https://south-cold-store.example.test'));
    expect(openFacility).toHaveBeenCalledTimes(1);
    expect(openFacility).toHaveBeenCalledWith('https://south-cold-store.example.test', 'South Cold Store');
    await press(button('Add facility'));
    expect(router.push).toHaveBeenCalledWith('/facility-catalogue');
  });

  describe('skipping the list at start', () => {
    it('opens the one approved facility without a tap', async () => {
      setCentralState({ autoOpenSpent: false });
      jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('East Cold Store', 'revoked')]);
      await render(<FacilitiesScreen />);
      expect(openFacility).toHaveBeenCalledTimes(1);
      expect(openFacility).toHaveBeenCalledWith('https://north-cold-store.example.test', 'North Cold Store');
      expect(getCentralState().autoOpenSpent).toBe(true);
    });

    it.each([
      ['two approved facilities', [facility('North Cold Store', 'approved'), facility('South Cold Store', 'approved')]],
      ['an access request still waiting', [facility('North Cold Store', 'approved'), facility('South Cold Store', 'requested')]],
      ['another facility asking for its own code', [facility('North Cold Store', 'approved'), facility('South Cold Store', 'link_needed')]],
      ['no approved facility', [facility('South Cold Store', 'requested')]],
    ])('shows the list with %s', async (_name, list) => {
      setCentralState({ autoOpenSpent: false });
      jest.mocked(loadMyFacilities).mockResolvedValue(list);
      await render(<FacilitiesScreen />);
      expect(openFacility).not.toHaveBeenCalled();
      // The one chance is spent either way.
      expect(getCentralState().autoOpenSpent).toBe(true);
    });

    it('does not skip after "Switch facility": the person asked for the list', async () => {
      setCentralState({ autoOpenSpent: true });
      jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved')]);
      await render(<FacilitiesScreen />);
      expect(openFacility).not.toHaveBeenCalled();
      expect(texts()).toContain('North Cold Store');
    });
  });

  describe('the answer of an open', () => {
    beforeEach(async () => {
      jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'requested')]);
      await render(<FacilitiesScreen />);
    });

    it('a waiting request opens the waiting screen', async () => {
      await publish({ kind: 'pending' });
      expect(router.push).toHaveBeenCalledWith('/pending-enrollment');
      expect(alerts()).toHaveLength(0);
    });

    it('a profile to link opens the code step', async () => {
      await publish({ kind: 'link_required', codeSent: true });
      expect(router.push).toHaveBeenCalledWith('/facility-link');
      expect(alerts()).toHaveLength(0);
    });

    it('a code that could not be sent is said before the code step', async () => {
      await publish({ kind: 'link_required', codeSent: false, message: 'Please wait 42 seconds before requesting another code.' });
      expect(alerts()[0]).toEqual(["Couldn't send the code", 'Please wait 42 seconds before requesting another code.']);
      expect(router.push).toHaveBeenCalledWith('/facility-link');
    });

    it('a refusal is a message that names the facility, and the person stays on the list', async () => {
      await publish({ kind: 'failed', reason: 'account_unavailable', message: 'North Cold Store has withdrawn your access.' });
      expect(alerts()[0]).toEqual(["Couldn't open North Cold Store", 'North Cold Store has withdrawn your access.']);
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("a facility without association sign-in: its own SMS sign-in is offered, and started only on Continue", async () => {
      await publish({ kind: 'sms_offer' });
      expect(alerts()[0][0]).toBe('Sign in with a facility code?');
      expect(alerts()[0][1]).toBe(
        'North Cold Store does not use association sign-in. You can sign in there with a code that the facility sends to your mobile number.'
      );
      expect(beginFacilitySmsSignIn).not.toHaveBeenCalled();
      await act(async () => { lastAlertButton('Continue').onPress?.(); });
      expect(beginFacilitySmsSignIn).toHaveBeenCalledWith(NORTH, 'North Cold Store');
    });

    it('a session needs nothing from the screen: the route guard enters the facility', async () => {
      await publish({ kind: 'login' });
      expect(router.push).not.toHaveBeenCalled();
      expect(alerts()).toHaveLength(0);
    });
  });

  it('shows which facility is being opened and answers a tap meanwhile with a dialog, not a second screen', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('South Cold Store', 'approved')]);
    await render(<FacilitiesScreen />);
    await act(async () => { setCentralState({ opening: 'https://north-cold-store.example.test' }); });
    expect(texts()).toContain('Opening North Cold Store…');
    expect(alerts()).toHaveLength(0);
    await press(button('Add facility'));
    expect(router.push).not.toHaveBeenCalled();
    expect(alerts()).toEqual([['Operation in progress', 'Still opening North Cold Store. Wait for it to finish.']]);
  });

  it('while one facility opens, the other rows are busy too; an opening facility outside the list gives the general busy text', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('South Cold Store', 'approved')]);
    await render(<FacilitiesScreen />);
    const rows = () => tree!.root.findAll(node => typeof node.props.testID === 'string' && /^facility-https/.test(node.props.testID) && typeof node.props.onPress === 'function');
    const busyOf = (id: string) => rows().find(node => node.props.testID === id)?.props.accessibilityState?.busy;
    const north = rows()[0].props.testID as string;
    const south = rows()[1].props.testID as string;
    expect([busyOf(north), busyOf(south)]).toEqual([false, false]);
    await act(async () => { setCentralState({ opening: north.replace('facility-', '') }); });
    expect([busyOf(north), busyOf(south)]).toEqual([true, true]);
    await act(async () => { setCentralState({ opening: 'https://not-in-the-list.example.test' }); });
    await press(button('Add facility'));
    expect(alerts()).toEqual([['Operation in progress', 'Finish the current operation before switching facilities.']]);
  });

  it('pull to refresh reads the list and asks the association, and contacts no facility', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('South Cold Store', 'requested')]);
    await render(<FacilitiesScreen />);
    jest.mocked(loadMyFacilities).mockClear();
    const refreshControl = tree!.root.find(node => typeof node.props.onRefresh === 'function' && node.props.refreshing !== undefined);
    await act(async () => { await refreshControl.props.onRefresh(); });
    expect(loadMyFacilities).toHaveBeenCalledWith('asha');
    expect(fetchCentralProfile).toHaveBeenCalledTimes(1);
    expect(openFacility).not.toHaveBeenCalled();
    expect(texts()).toContain('A status is checked again when you open the facility.');
  });

  it('"Sign out" asks first and then signs out of the association and the current facility', async () => {
    await render(<FacilitiesScreen />);
    await press(button('Sign out'));
    expect(alerts()[0][0]).toBe('Sign out?');
    expect(alerts()[0][1]).toBe(
      "You'll be signed out of the association and of the cold storage you have open. You'll need your mobile number and a one-time code to sign in again."
    );
    expect(signOutEverywhere).not.toHaveBeenCalled();
    await act(async () => { lastAlertButton('Sign out').onPress?.(); });
    expect(signOutEverywhere).toHaveBeenCalledWith(mockDispatch);
  });

  it.each([
    ['busy', 'A save is still being sent. Wait a few seconds, then try again.'],
    [
      'local_clear_failed',
      "This phone couldn't remove your association sign-in from its secure storage. Restart the app and check that you're signed out before anyone else uses this phone.",
    ],
  ])('"Couldn\'t sign out" names the reason (%s)', async (reason, message) => {
    jest.mocked(signOutEverywhere).mockResolvedValueOnce({ ok: false, reason } as never);
    await render(<FacilitiesScreen />);
    await press(button('Sign out'));
    await act(async () => { lastAlertButton('Sign out').onPress?.(); });
    const shown = alerts()[alerts().length - 1];
    expect(shown[0]).toBe("Couldn't sign out");
    expect(shown[1]).toBe(message);
  });

  it('the account entry opens the account screen', async () => {
    await render(<FacilitiesScreen />);
    await press(byTestID('central-account-row'));
    expect(router.push).toHaveBeenCalledWith('/central-account');
  });
});

describe('Add facility', () => {
  // An older catalogue: nothing reported about availability, so no tags and alphabetical order.
  const CATALOGUE = [
    entry('north-cold', 'North Cold Store', 'Rajkot', { district: 'Rajkot', origin: NORTH }),
    entry('gondal-agro', 'Gondal Agro Cold Storage', 'Gondal', { district: 'Rajkot' }),
    entry('morbi-ice', 'Fictional Ice Works', 'Wankaner', { district: 'Morbi' }),
  ];
  const NAMES = [...CATALOGUE.map(item => item.name), 'Fictional Sabar Cold', 'Review North Cold Storage', 'Review South Cold Storage', 'Riverbank Cold'];
  const names = () => texts().filter(text => NAMES.includes(text));
  const search = async (value: string) => {
    const field = tree!.root.find(node => node.props.testID === 'catalogue-search' && typeof node.props.onChangeText === 'function');
    await act(async () => { field.props.onChangeText(value); });
  };
  const tagOf = (id: string) => {
    const found = tree!.root.findAllByType(StatusTag).filter(node => node.props.testID === `catalogue-status-${id}`);
    return found.length ? found[0].props.label : null;
  };
  const list = () => tree!.root.findAll(node => typeof node.props.refreshControl?.props?.onRefresh === 'function')[0];
  const pull = () => list().props.refreshControl.props.onRefresh() as void;
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  /**
   * As central 0.8.0 publishes it: two online, two offline (one never reached), one member with
   * no app server. Built in each test, so the last-seen times are minutes before that test runs.
   */
  const live = () => [
    entry('review-south', 'Review South Cold Storage', 'Dehgam', { district: 'Gandhinagar', online: true }),
    entry('gcsa-024', 'Fictional Sabar Cold', 'Himmatnagar', { district: 'Sabarkantha', origin: null }),
    entry('riverbank', 'Riverbank Cold', 'Jamnagar', { district: 'Jamnagar', online: false }),
    entry('review-north', 'Review North Cold Storage', 'Deesa', { district: 'Banaskantha', online: false, lastSeenAt: minutesAgo(5) }),
    entry('north-cold', 'North Cold Store', 'Rajkot', { origin: NORTH, online: true }),
  ];

  it('shows a spinner while the list loads', async () => {
    jest.mocked(fetchFacilityCatalogue).mockReturnValue(new Promise(() => undefined));
    await render(<FacilityCatalogueScreen />);
    expect(tree!.root.findAll(node => node.props.accessibilityLabel === 'Loading facilities').length).toBeGreaterThan(0);
    expect(names()).toEqual([]);
  });

  it('searches by name, town or district, whatever the letter case', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: CATALOGUE });
    await render(<FacilityCatalogueScreen />);
    expect(names()).toEqual(['Fictional Ice Works', 'Gondal Agro Cold Storage', 'North Cold Store']);
    await search('cold');
    expect(names()).toEqual(['Gondal Agro Cold Storage', 'North Cold Store']);
    // A town.
    await search('WANKANER');
    expect(names()).toEqual(['Fictional Ice Works']);
    // A district that is in no name and no town.
    await search('  morbi ');
    expect(names()).toEqual(['Fictional Ice Works']);
    // The town of one and the district of another.
    await search('rajkot');
    expect(names()).toEqual(['Gondal Agro Cold Storage', 'North Cold Store']);
    await search('');
    expect(names()).toHaveLength(3);
  });

  it('says when nothing matches the search', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: CATALOGUE });
    await render(<FacilityCatalogueScreen />);
    await search('Surat');
    expect(names()).toEqual([]);
    expect(texts()).toContain('No facility matches "Surat"');
    expect(texts()).toContain('Check the spelling, or search by town or district.');
  });

  it('says when the association has listed nothing, and still offers the address entry', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: [] });
    await render(<FacilityCatalogueScreen />);
    expect(texts()).toContain('No facilities listed yet');
    expect(tree!.root.findAll(node => node.props.testID === 'catalogue-search')).toHaveLength(0);
    await press(button('Enter address'));
    expect(router.push).toHaveBeenCalledWith('/facility-address');
  });

  it('shows why the list could not be loaded, and "Try again" asks the service again', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValueOnce({
      ok: false, code: 'network', message: "Couldn't reach the association's sign-in service. Check your connection and try again.",
    });
    await render(<FacilityCatalogueScreen />);
    expect(texts()).toContain("Couldn't load the facilities");
    expect(texts()).toContain("Couldn't reach the association's sign-in service. Check your connection and try again.");
    expect(names()).toEqual([]);
    expect(fetchFacilityCatalogue).toHaveBeenCalledTimes(1);

    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: CATALOGUE });
    await press(button('Try again'));
    expect(fetchFacilityCatalogue).toHaveBeenCalledTimes(2);
    // The retry does not reuse a cached copy.
    expect(fetchFacilityCatalogue).toHaveBeenLastCalledWith({ force: true });
    expect(names()).toHaveLength(3);
    expect(texts()).not.toContain("Couldn't load the facilities");
  });

  it('picking a facility adds it to the list with its town, returns to My facilities and opens it', async () => {
    // The town is what My facilities shows; `city` is only the older name of the same place.
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({
      ok: true,
      facilities: [entry('gondal-agro', 'Gondal Agro Cold Storage', 'Gondal', { city: 'Gondal (old name)', online: true })],
    });
    await render(<FacilityCatalogueScreen />);
    await press(byTestID('catalogue-gondal-agro'));
    expect(addMyFacility).toHaveBeenCalledWith('asha', { origin: 'https://gondal-agro.example.test', name: 'Gondal Agro Cold Storage', city: 'Gondal', source: 'catalogue' });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(openFacility).toHaveBeenCalledWith('https://gondal-agro.example.test', 'Gondal Agro Cold Storage');
  });

  it('shows one availability tag per row, none when nothing is reported, in the order online, offline, no app server', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: [...live(), entry('gondal-agro', 'Gondal Agro Cold Storage', 'Gondal')] });
    await render(<FacilityCatalogueScreen />);
    // Online and not reported by name, then offline by name, then the members with no app server.
    expect(texts().filter(text => [...NAMES, 'Gondal Agro Cold Storage'].includes(text))).toEqual([
      'Gondal Agro Cold Storage',
      'North Cold Store',
      'Review South Cold Storage',
      'Review North Cold Storage',
      'Riverbank Cold',
      'Fictional Sabar Cold',
    ]);
    expect(tagOf('north-cold')).toBe('Online');
    expect(tagOf('review-south')).toBe('Online');
    expect(tagOf('review-north')).toBe('Offline');
    expect(tagOf('riverbank')).toBe('Offline');
    expect(tagOf('gcsa-024')).toBe('No app server yet');
    expect(tagOf('gondal-agro')).toBeNull();
    // One StatusTag per row that reports something, and no other tag.
    expect(tree!.root.findAllByType(StatusTag)).toHaveLength(5);
  });

  it('adds "Town, District" under the name, and when an offline facility was last reached', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await render(<FacilityCatalogueScreen />);
    expect(texts()).toEqual(expect.arrayContaining(['Dehgam, Gandhinagar', 'Deesa, Banaskantha', 'Himmatnagar, Sabarkantha', 'Rajkot']));
    // The district is not repeated when it is the town.
    expect(texts()).toContain('Jamnagar');
    expect(texts()).not.toContain('Jamnagar, Jamnagar');
    expect(tree!.root.find(node => node.props.testID === 'catalogue-last-seen-review-north').props.children).toBe('Last seen 5 min ago');
    expect(tree!.root.find(node => node.props.testID === 'catalogue-last-seen-riverbank').props.children).toBe('Not reached yet');
    // Online rows and a member with no app server have no such line.
    const lastSeenLines = tree!.root.findAll(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('catalogue-last-seen-'), { deep: false });
    expect(lastSeenLines.map(node => node.props.testID).sort()).toEqual(['catalogue-last-seen-review-north', 'catalogue-last-seen-riverbank']);
    expect(byTestID('catalogue-review-north').props.accessibilityLabel).toBe('Review North Cold Storage, Deesa, Banaskantha, Offline, Last seen 5 min ago');
  });

  it('a member with no app server yet only explains why it cannot be added', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await render(<FacilityCatalogueScreen />);
    const row = byTestID('catalogue-gcsa-024');
    expect(row.props.accessibilityLabel).toBe('Fictional Sabar Cold, Himmatnagar, Sabarkantha, No app server yet');
    expect(row.props.accessibilityHint).toBe("Explains why this cold storage can't be added yet");
    // An information icon in place of the chevron.
    expect(row.findAll(node => node.props.name === 'information-outline')).toHaveLength(1);
    expect(row.findAll(node => node.props.name === 'chevron-right')).toHaveLength(0);
    expect(byTestID('catalogue-north-cold').findAll(node => node.props.name === 'chevron-right')).toHaveLength(1);

    await press(row);
    expect(alerts()).toEqual([
      [
        'Fictional Sabar Cold is not on the app yet',
        "This cold storage hasn't set up its app server yet, so it can't be added. When it has, it shows here as Online.",
      ],
    ]);
    expect(addMyFacility).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(openFacility).not.toHaveBeenCalled();
  });

  it('an offline facility can still be picked: the check may be a minute old', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await render(<FacilityCatalogueScreen />);
    await press(byTestID('catalogue-review-north'));
    expect(openFacility).toHaveBeenCalledWith('https://review-north.example.test', 'Review North Cold Storage');
  });

  it('pull to refresh asks the service again, keeps the rows while it waits, and shows the new availability', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await render(<FacilityCatalogueScreen />);
    expect(tagOf('review-south')).toBe('Online');

    let answer: (value: Awaited<ReturnType<typeof fetchFacilityCatalogue>>) => void = () => undefined;
    jest.mocked(fetchFacilityCatalogue).mockReturnValue(new Promise(resolve => { answer = resolve; }));
    await act(async () => { pull(); });
    expect(fetchFacilityCatalogue).toHaveBeenLastCalledWith({ force: true });
    expect(list().props.refreshControl.props.refreshing).toBe(true);
    // Not blanked: the rows stay while the answer is awaited.
    expect(names()).toHaveLength(5);
    expect(tree!.root.findAll(node => node.props.accessibilityLabel === 'Loading facilities')).toHaveLength(0);

    const southOffline = live().map(item => (item.id === 'review-south' ? { ...item, online: false, lastSeenAt: minutesAgo(2) } : item));
    await act(async () => { answer({ ok: true, facilities: southOffline }); });
    expect(tagOf('review-south')).toBe('Offline');
    expect(tree!.root.find(node => node.props.testID === 'catalogue-last-seen-review-south').props.children).toBe('Last seen 2 min ago');
    expect(list().props.refreshControl.props.refreshing).toBe(false);
  });

  it('a failed refresh keeps the rows and says why under the search field, until a refresh succeeds', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await render(<FacilityCatalogueScreen />);
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({
      ok: false, code: 'network', message: "Couldn't reach the association's sign-in service. Check your connection and try again.",
    });
    await act(async () => { pull(); });
    expect(names()).toHaveLength(5);
    expect(tagOf('review-south')).toBe('Online');
    const errorLine = () => tree!.root.findAll(node => node.props.testID === 'catalogue-refresh-error' && (node.type as unknown) === 'Text');
    expect(errorLine()).toHaveLength(1);
    expect([].concat(errorLine()[0].props.children).join('')).toBe(
      "Couldn't refresh the list. Couldn't reach the association's sign-in service. Check your connection and try again."
    );
    expect(texts()).not.toContain("Couldn't load the facilities");

    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    await act(async () => { pull(); });
    expect(errorLine()).toHaveLength(0);
  });

  it('marks a facility that is already on the list with a footnote, not a second tag', async () => {
    jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: live() });
    jest.mocked(loadMyFacilities).mockResolvedValue([{ ...facility('North Cold Store', 'approved'), origin: NORTH }]);
    await render(<FacilityCatalogueScreen />);
    expect(texts().filter(text => text === 'On your list')).toHaveLength(1);
    const row = byTestID('catalogue-north-cold');
    expect(row.findAll(node => node.props.name === 'check')).toHaveLength(1);
    expect(row.findAllByType(StatusTag).map(node => node.props.label)).toEqual(['Online']);
    expect(row.props.accessibilityLabel).toBe('North Cold Store, Rajkot, Online, On your list');
  });

  it('matches Gujarati names and digits typed in either script', () => {
    expect(matchesFacilitySearch({ name: 'ગોંડલ કોલ્ડ સ્ટોરેજ', city: 'ગોંડલ' }, 'ગોંડલ')).toBe(true);
    expect(matchesFacilitySearch({ name: 'Cold Store 2', city: 'Rajkot' }, '૨')).toBe(true);
    expect(matchesFacilitySearch({ name: 'Cold Store 2', city: 'Rajkot' }, 'Morbi')).toBe(false);
    expect(matchesFacilitySearch({ name: 'Cold Store 2', city: '', town: 'Deesa', district: 'બનાસકાંઠા' }, 'બનાસ')).toBe(true);
  });
});

describe('the linking step', () => {
  beforeEach(() => setCentralState({ pendingLink: { origin: NORTH, name: 'North Cold Store', phoneNumber: '919000000001' } }));
  const enter = async (code: string) => {
    const input = tree!.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
    await act(async () => { input.props.onChangeText(code); });
    await press(button('Verify code'));
  };

  it('sends the code the person typed; a session needs no navigation from this screen', async () => {
    jest.mocked(completeFacilityLink).mockResolvedValue({ kind: 'login' });
    await render(<FacilityLinkScreen />);
    await enter('482913');
    expect(completeFacilityLink).toHaveBeenCalledWith('482913');
    expect(alerts()).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a wrong code stays on the step with the message', async () => {
    jest.mocked(completeFacilityLink).mockResolvedValue({
      kind: 'failed', reason: 'invalid_otp', message: 'That code is wrong or has expired. Check it, or ask for a new code.',
    });
    await render(<FacilityLinkScreen />);
    await enter('000000');
    expect(alerts()[0]).toEqual(["Couldn't verify the code", 'That code is wrong or has expired. Check it, or ask for a new code.']);
    expect(router.replace).not.toHaveBeenCalled();
    expect(texts()).toContain('Enter the code from North Cold Store');
  });

  it('a request that still waits goes to the waiting screen', async () => {
    jest.mocked(completeFacilityLink).mockResolvedValue({ kind: 'pending' });
    await render(<FacilityLinkScreen />);
    await enter('482913');
    expect(router.replace).toHaveBeenCalledWith('/pending-enrollment');
  });

  it('does not send a short code', async () => {
    await render(<FacilityLinkScreen />);
    await enter('4829');
    expect(completeFacilityLink).not.toHaveBeenCalled();
    expect(alerts()[0]).toEqual(['Enter the full code', 'Enter all 6 digits of the code we sent you.']);
  });

  it('offers "My facilities" as the way out in place of "Wrong number?"', async () => {
    await render(<FacilityLinkScreen />);
    expect(texts()).not.toContain('Wrong number?');
    await press(button('Back to My facilities'));
    // Back to the My facilities under this step, not a second one in its place.
    expect(router.dismissTo).toHaveBeenCalledWith('/facilities');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('with nothing to confirm it returns to My facilities', async () => {
    setCentralState({ pendingLink: null });
    await render(<FacilityLinkScreen />);
    expect(router.dismissTo).toHaveBeenCalledWith('/facilities');
    expect(router.replace).not.toHaveBeenCalled();
    expect(resendFacilityLinkCode).not.toHaveBeenCalled();
  });
});

describe('the account', () => {
  const typeName = async (value: string) => {
    const field = tree!.root.find(node => node.props.testID === 'central-name' && typeof node.props.onChangeText === 'function');
    await act(async () => { field.props.onChangeText(value); });
  };

  it('saves the name at the association', async () => {
    jest.mocked(updateCentralName).mockResolvedValue({ ok: true, user: { ...USER, name: 'Asha F. Fictional' } });
    await render(<CentralAccountScreen />);
    await typeName('Asha F. Fictional');
    await press(button('Save name'));
    expect(updateCentralName).toHaveBeenCalledWith('Asha F. Fictional');
    // Saved is a toast now, not a dialog.
    expect(showToast).toHaveBeenCalledWith('Name saved.');
    expect(alerts()).toHaveLength(0);
  });

  it('refuses an empty name without calling the service', async () => {
    await render(<CentralAccountScreen />);
    await typeName('   ');
    await press(button('Save name'));
    expect(updateCentralName).not.toHaveBeenCalled();
    expect(texts()).toContain('Enter a name of up to 80 characters.');
    expect(isValidCentralName('a'.repeat(81))).toBe(false);
    expect(isValidCentralName('Asha\nFictional')).toBe(false);
    expect(isValidCentralName('આશા')).toBe(true);
  });

  it('"Delete my account" says that facility records are kept by each facility, and deletes only after confirming', async () => {
    await render(<CentralAccountScreen />);
    await press(button('Delete my account'));
    expect(alerts()[0][0]).toBe('Delete your association account?');
    expect(alerts()[0][1]).toContain('Records at a cold storage are kept by that cold storage.');
    expect(alerts()[0][1]).toContain('This cannot be undone.');
    expect(deleteAccountEverywhere).not.toHaveBeenCalled();
    await act(async () => { lastAlertButton('Delete my account').onPress?.(); });
    expect(deleteAccountEverywhere).toHaveBeenCalledWith(mockDispatch);
  });

  it('says why the account could not be deleted', async () => {
    jest.mocked(deleteAccountEverywhere).mockResolvedValue({
      ok: false,
      reason: 'central',
      failure: { ok: false, code: 'network', message: "Couldn't reach the association's sign-in service. Check your connection and try again." },
    });
    await render(<CentralAccountScreen />);
    await press(button('Delete my account'));
    await act(async () => { lastAlertButton('Delete my account').onPress?.(); });
    expect(alerts()[1]).toEqual(["Couldn't delete the account", "Couldn't reach the association's sign-in service. Check your connection and try again."]);
  });

  describe('"Sign out on all phones"', () => {
    it('is a button above the delete area, and nothing happens until it is confirmed', async () => {
      await render(<CentralAccountScreen />);
      const labels = tree!.root.findAllByType(Button).map(node => node.props.children);
      expect(labels).toEqual(['Save name', 'Sign out on all phones', 'Delete my account']);
      expect(texts()).toContain('Ends your association sign-in on every phone, this one included');
      await press(button('Sign out on all phones'));
      expect(alerts()).toHaveLength(1);
      expect(alerts()[0][0]).toBe('Sign out on all phones?');
      // It says that every phone is signed out of the association account, and that an open facility stays open.
      expect(alerts()[0][1]).toContain('signed out of your association account on every phone, this one included');
      expect(alerts()[0][1]).toContain('A cold storage you already have open on another phone stays open there until you sign out on that phone.');
      expect(signOutAllDevices).not.toHaveBeenCalled();
      expect((alerts()[0][2] as Array<{ text: string; style?: string }>).map(entry => [entry.text, entry.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Sign out on all phones', undefined],
      ]);
    });

    it('signs out on all phones after the confirmation, and not after Cancel', async () => {
      await render(<CentralAccountScreen />);
      await press(button('Sign out on all phones'));
      await act(async () => { lastAlertButton('Cancel').onPress?.(); });
      expect(signOutAllDevices).not.toHaveBeenCalled();
      await act(async () => { lastAlertButton('Sign out on all phones').onPress?.(); });
      expect(signOutAllDevices).toHaveBeenCalledTimes(1);
      expect(signOutAllDevices).toHaveBeenCalledWith(mockDispatch);
      expect(deleteAccountEverywhere).not.toHaveBeenCalled();
      expect(signOutEverywhere).not.toHaveBeenCalled();
      // Nothing else is said: the route guard shows central sign-in.
      expect(alerts()).toHaveLength(1);
    });

    it('is disabled, and the other buttons with it, while the sign-out runs; and the other way round', async () => {
      let finish!: (value: { ok: true }) => void;
      jest.mocked(signOutAllDevices).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      await render(<CentralAccountScreen />);
      expect(button('Sign out on all phones').props.disabled).toBe(false);
      await press(button('Sign out on all phones'));
      await act(async () => { lastAlertButton('Sign out on all phones').onPress?.(); });
      expect(button('Sign out on all phones').props.disabled).toBe(true);
      expect(button('Sign out on all phones').props.loading).toBe(true);
      expect(button('Save name').props.disabled).toBe(true);
      expect(button('Delete my account').props.disabled).toBe(true);
      await act(async () => { finish({ ok: true }); });
      expect(button('Sign out on all phones').props.disabled).toBe(false);
      expect(button('Delete my account').props.disabled).toBe(false);
    });

    it('is disabled while the name is being saved', async () => {
      let finish!: (value: unknown) => void;
      jest.mocked(updateCentralName).mockImplementationOnce(() => new Promise(resolve => { finish = resolve as (value: unknown) => void; }));
      await render(<CentralAccountScreen />);
      await act(async () => { void button('Save name').props.onPress?.(); });
      expect(button('Sign out on all phones').props.disabled).toBe(true);
      await act(async () => { finish({ ok: true, user: USER }); });
      expect(button('Sign out on all phones').props.disabled).toBe(false);
    });

    it.each([
      [
        'the service cannot be reached',
        { ok: false, reason: 'central', failure: { ok: false, code: 'network', message: "Couldn't reach the association's sign-in service. Check your connection and try again." } },
        ["Couldn't sign out on all phones", "Couldn't reach the association's sign-in service. Check your connection and try again."],
      ],
      [
        'the association service does not have the call',
        { ok: false, reason: 'central', failure: { ok: false, code: 'not_supported', message: "This association service doesn't support signing out on all phones yet." } },
        ["Couldn't sign out on all phones", "This association service doesn't support signing out on all phones yet."],
      ],
      [
        'a write is in flight',
        { ok: false, reason: 'busy' },
        ["Couldn't sign out on all phones", 'A save is still being sent. Wait a few seconds, then try again.'],
      ],
      [
        'this phone could not remove its copy',
        { ok: false, reason: 'local_clear_failed' },
        [
          "Couldn't sign out",
          "This phone couldn't remove your association sign-in from its secure storage. Restart the app and check that you're signed out before anyone else uses this phone.",
        ],
      ],
    ])('says why it did not happen when %s', async (_name, outcome, expected) => {
      jest.mocked(signOutAllDevices).mockResolvedValueOnce(outcome as never);
      await render(<CentralAccountScreen />);
      await press(button('Sign out on all phones'));
      await act(async () => { lastAlertButton('Sign out on all phones').onPress?.(); });
      expect(alerts()[1]).toEqual(expected);
      // The screen is usable again.
      expect(button('Sign out on all phones').props.disabled).toBe(false);
    });

    it('says when the facility\'s own cleanup did not finish, although the association sign-in ended', async () => {
      jest.mocked(signOutAllDevices).mockResolvedValueOnce({ ok: true, facilityCleanup: 'failed' });
      await render(<CentralAccountScreen />);
      await press(button('Sign out on all phones'));
      await act(async () => { lastAlertButton('Sign out on all phones').onPress?.(); });
      expect(alerts()[1]).toEqual(['Signed out', "Some of this facility's data couldn't be removed from this phone. Restart the app before someone else uses it."]);
    });

    it('is shown in Gujarati, with the dialog saying every phone and that an open facility stays open', async () => {
      setLanguage('gu');
      await render(<CentralAccountScreen />);
      expect(texts()).toEqual(expect.arrayContaining(['બધા ફોનમાંથી લૉગઆઉટ કરો']));
      await press(button('બધા ફોનમાંથી લૉગઆઉટ કરો'));
      expect(alerts()[0][0]).toBe('બધા ફોનમાંથી લૉગઆઉટ કરવું છે?');
      expect(alerts()[0][1]).toContain('આ ફોન સહિત બધા ફોનમાં');
      expect(alerts()[0][1]).toContain('ત્યાં ખુલ્લું રહેશે');
    });
  });
});

describe('in Gujarati', () => {
  it('My facilities shows its own words and the status words in Gujarati', async () => {
    setLanguage('gu');
    jest.mocked(loadMyFacilities).mockResolvedValue([facility('North Cold Store', 'approved'), facility('South Cold Store', 'link_needed')]);
    await render(<FacilitiesScreen />);
    expect(texts()).toEqual(expect.arrayContaining(['મારાં કોલ્ડ સ્ટોરેજ', 'મંજૂર', 'OTP જોઈએ', 'કોલ્ડ સ્ટોરેજ ઉમેરો', 'લૉગઆઉટ કરો']));
    // A typed name is never translated, and a phone number keeps 0-9.
    expect(texts()).toContain('North Cold Store');
    expect(texts()).toContain('+91 90000 00001');
  });
});
