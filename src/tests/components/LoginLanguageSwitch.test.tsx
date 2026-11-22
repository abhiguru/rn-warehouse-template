/**
 * Changing the language on the sign-in screen rebuilds the navigation tree
 * (`key={language}` in app/_layout.tsx). The half-typed mobile number must
 * survive that rebuild, and must not survive leaving the screen.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
async function mount(language: 'en' | 'gu') {
  mockState = { ...mockState, theme: { ...mockState.theme, language } };
  await render(<Root />);
}
/** The rebuild: the saved choice changes, the root renders again and replaces the screen. */
async function rebuildIn(language: 'en' | 'gu') {
  mockState = { ...mockState, theme: { ...mockState.theme, language } };
  await screen.rerender(<Root />);
}
const phoneField = () => screen.getByPlaceholderText('98765 43210');
const enter = async (text: string) => {
  await user.clear(phoneField());
  await user.paste(phoneField(), text);
};

beforeEach(() => {
  clearSignInDraft();
  mockOrigin = 'https://fictional-facility.example.test';
});
afterEach(() => setLanguage('en'));

describe('sign-in screen and the language switch', () => {
  it('starts with an empty mobile number', async () => {
    await mount('en');
    expect(phoneField()).toHaveDisplayValue('');
    expect(phoneField().props.value).toBe('');
  });

  it('keeps ten digits at most, and a pasted +91 number loses its country code', async () => {
    await mount('en');
    await enter('98765 432101');
    // A broken field would show an eleventh digit: '98765 432101'.
    expect(phoneField()).toHaveDisplayValue('98765 43210');
    await enter('+91 98765 43210');
    expect(phoneField()).toHaveDisplayValue('98765 43210');
  });

  it('keeps a half-typed number when the screen is rebuilt in Gujarati', async () => {
    await mount('en');
    await enter('98765 43');
    expect(phoneField()).toHaveDisplayValue('98765 43');
    expect(screen.getByText('Sign in')).toBeOnTheScreen();

    await rebuildIn('gu');

    expect(getLanguage()).toBe('gu');
    expect(screen.queryByText('Sign in', hidden)).not.toBeOnTheScreen();
    expect(screen.getByText('લૉગિન કરો')).toBeOnTheScreen();
    // A broken screen would show '' here: the new instance starts from its own empty state.
    expect(phoneField()).toHaveDisplayValue('98765 43');
  });

  it('keeps it through a switch there and back, and keeps later typing', async () => {
    await mount('en');
    await enter('987');
    await rebuildIn('gu');
    await enter('98765');
    await rebuildIn('en');
    expect(phoneField()).toHaveDisplayValue('98765');
  });

  it('forgets the number when the screen is left without a language change', async () => {
    await mount('en');
    await enter('9876543210');
    await screen.unmount();
    expect(readSignInDraft(mockOrigin)).toBe('');
    await mount('en');
    expect(phoneField()).toHaveDisplayValue('');
  });

  it('does not offer a number typed for another facility', async () => {
    saveSignInDraft('9876543210', 'https://other-facility.example.test');
    await mount('en');
    expect(phoneField()).toHaveDisplayValue('');
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
