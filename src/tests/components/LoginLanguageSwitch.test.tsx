/**
 * Changing the language on the sign-in screen rebuilds the navigation tree
 * (`key={language}` in app/_layout.tsx). The half-typed mobile number must
 * survive that rebuild, and must not survive leaving the screen.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import LoginScreen from '../../../app/login';
import { getLanguage, setLanguage } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { clearSignInDraft, readSignInDraft, saveSignInDraft } from '@/utils/signInDraft';

let mockState = {
  theme: { preference: 'light', brand: 'orange', language: 'en' as 'en' | 'gu' },
  auth: { isAuthenticating: false },
};
let mockOrigin = 'https://fictional-facility.example.test';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/config/supabaseConfig', () => ({
  getPendingEnrollmentToken: jest.fn(() => new Promise(() => undefined)),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({
    origin: mockOrigin,
    instanceId: 'fictional-instance',
    displayName: 'Fictional Facility',
    companyName: 'Fictional Cold Store',
  }),
}));
jest.mock('@/store/slices/authSlice', () => ({
  setAuthenticating: jest.fn(), setPhoneNumber: jest.fn(), setOtpSent: jest.fn(),
}));

/** The root of the app: it sets the language while rendering, then keys the screens by it (app/_layout.tsx). */
function Root() {
  const { language } = useAppLanguage();
  return <LoginScreen key={language} />;
}
function mount(language: 'en' | 'gu'): ReactTestRenderer {
  mockState = { ...mockState, theme: { ...mockState.theme, language } };
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<Root />); });
  return tree;
}
/** The rebuild: the saved choice changes, the root renders again and replaces the screen. */
function rebuildIn(tree: ReactTestRenderer, language: 'en' | 'gu'): ReactTestRenderer {
  mockState = { ...mockState, theme: { ...mockState.theme, language } };
  act(() => { tree.update(<Root />); });
  return tree;
}
const phoneField = (tree: ReactTestRenderer) =>
  tree.root.find(node => node.props.maxLength === 12 && typeof node.props.onChangeText === 'function' && typeof node.type !== 'string');
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));

beforeEach(() => {
  clearSignInDraft();
  mockOrigin = 'https://fictional-facility.example.test';
});
afterEach(() => setLanguage('en'));

describe('sign-in screen and the language switch', () => {
  it('starts with an empty mobile number', () => {
    const tree = mount('en');
    expect(phoneField(tree).props.value).toBe('');
    act(() => tree.unmount());
  });

  it('keeps a half-typed number when the screen is rebuilt in Gujarati', () => {
    const tree = mount('en');
    act(() => phoneField(tree).props.onChangeText('98765 43'));
    expect(phoneField(tree).props.value).toBe('98765 43');
    expect(texts(tree)).toContain('Sign in');

    rebuildIn(tree, 'gu');

    expect(getLanguage()).toBe('gu');
    expect(texts(tree)).not.toContain('Sign in');
    expect(texts(tree)).toContain('લૉગિન કરો');
    // A broken screen would show '' here: the new instance starts from its own empty state.
    expect(phoneField(tree).props.value).toBe('98765 43');
    act(() => tree.unmount());
  });

  it('keeps it through a switch there and back, and keeps later typing', () => {
    const tree = mount('en');
    act(() => phoneField(tree).props.onChangeText('987'));
    rebuildIn(tree, 'gu');
    act(() => phoneField(tree).props.onChangeText('98765'));
    rebuildIn(tree, 'en');
    expect(phoneField(tree).props.value).toBe('98765');
    act(() => tree.unmount());
  });

  it('forgets the number when the screen is left without a language change', () => {
    const first = mount('en');
    act(() => phoneField(first).props.onChangeText('9876543210'));
    act(() => first.unmount());
    expect(readSignInDraft(mockOrigin)).toBe('');
    const second = mount('en');
    expect(phoneField(second).props.value).toBe('');
    act(() => second.unmount());
  });

  it('does not offer a number typed for another facility', () => {
    saveSignInDraft('9876543210', 'https://other-facility.example.test');
    const tree = mount('en');
    expect(phoneField(tree).props.value).toBe('');
    act(() => tree.unmount());
  });
});

describe('signInDraft', () => {
  it('returns what was saved for the same facility, and nothing after clearing', () => {
    saveSignInDraft('98765', 'https://a.example.test');
    expect(readSignInDraft('https://a.example.test')).toBe('98765');
    expect(readSignInDraft('https://b.example.test')).toBe('');
    clearSignInDraft();
    expect(readSignInDraft('https://a.example.test')).toBe('');
  });
});
