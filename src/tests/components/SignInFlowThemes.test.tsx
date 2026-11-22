/**
 * Sign-in flow (style guide §14.8) renders in all four themes with token colours.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import LoginScreen from '../../../app/login';
import OTPScreen from '../../../app/otp';
import PendingEnrollmentScreen from '../../../app/pending-enrollment';
import EnrollmentReviewScreen from '../../../app/enrollment-review';
import { createNavigationTheme, createPaperTheme } from '../../../app/_layout';

type MockState = {
  theme: { preference: Mode; brand: Brand };
  auth: Record<string, unknown>;
};
let mockState: MockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: {},
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    Stack: { Screen: () => null },
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useIsFocused: () => true,
    DarkTheme: actual.DarkTheme,
    DefaultTheme: actual.DefaultTheme,
    ThemeProvider: actual.ThemeProvider,
  };
});
jest.mock('@/config/supabaseConfig', () => ({
  getPendingEnrollmentToken: jest.fn(() => new Promise(() => undefined)),
  signInWithPhone: jest.fn(),
  verifyOTP: jest.fn(),
  getEnrollmentStatus: jest.fn(() => new Promise(() => undefined)),
  signOutPendingEnrollment: jest.fn(),
}));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({
    origin: 'https://fictional-facility.example.test',
    instanceId: 'fictional-instance',
    displayName: 'Fictional Facility',
    companyName: 'Fictional Cold Store',
  }),
}));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/services/enrollmentReviewService', () => ({
  listPendingEnrollments: jest.fn(() => new Promise(() => undefined)),
  hasEnrollmentCustomers: jest.fn(() => new Promise(() => undefined)),
  reviewEnrollment: jest.fn(),
}));
// The root layout imports the whole app shell; only its theme builders are under test.
jest.mock('@/store', () => ({ store: {}, persistor: {} }));
jest.mock('react-redux', () => ({ Provider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('redux-persist/integration/react', () => ({ PersistGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/queryClient', () => ({ queryClient: {} }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), Sentry: { wrap: (c: unknown) => c },
}));
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setButtonStyleAsync: jest.fn() }));
jest.mock('@/components/OperatorServerSelection', () => ({ OperatorServerSelection: () => null }));
jest.mock('@/components/ConfigErrorScreen', () => () => null);
jest.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/AppStateManager', () => ({ AppStateManager: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ForceUpdateModal', () => ({ ForceUpdateModal: () => null }));
jest.mock('@/hooks/useColdStartDeepLink', () => ({ useColdStartDeepLink: jest.fn() }));
jest.mock('@/config/operatorBootstrap', () => ({ verifySelectedOperator: jest.fn(), verifyForegroundOperator: jest.fn() }));
jest.mock('@/config/operatorResume', () => ({ operatorResumeGate: {} }));
jest.mock('@/config/resumeLifecycle', () => ({ createResumeLifecycle: jest.fn() }));
jest.mock('@/config/nativeHandoff', () => ({ isNativeHandoffActive: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ sweepSharedDocuments: jest.fn() }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({
  initializeAuth: jest.fn(), logout: jest.fn(), setAuthenticating: jest.fn(), setPhoneNumber: jest.fn(),
  setOtpSent: jest.fn(), setVerifyingOTP: jest.fn(), setSession: jest.fn(), setUser: jest.fn(), setUserProfile: jest.fn(),
}));

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

async function renderIn(element: React.ReactElement, brand: Brand, mode: Mode, auth: Record<string, unknown> = {}) {
  mockState = { theme: { preference: mode, brand }, auth };
  await render(element);
}

const shows = (text: string) => expect(screen.getAllByText(text)[0]).toBeOnTheScreen();

// A node of the screen (a view or a composite) drawn with this background colour. Nothing but its style says it,
// so the rendered tree is walked.
function hasBackground(colour: string) {
  const matches = (node: NonNullable<typeof screen.root>) => {
    const style = [].concat(node.props.style ?? []).flat(3).filter(Boolean) as Array<{ backgroundColor?: string }>;
    return style.some(s => s.backgroundColor === colour);
  };
  // The root itself is not part of its own query.
  return matches(screen.root!) || screen.root!.queryAll(matches).length > 0;
}

describe.each(THEMES)('sign-in flow in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('login shows the §14.8 wording on the themed background', async () => {
    await renderIn(<LoginScreen />, brand, mode, { isAuthenticating: false });
    for (const words of ['Sign in', 'Enter your mobile number to get a one-time code.', 'MOBILE NUMBER', '+91', 'Change']) {
      shows(words);
    }
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('code entry uses one-time-code autofill and offers "Wrong number?"', async () => {
    await renderIn(<OTPScreen />, brand, mode, { phoneNumber: '+919876543210', isVerifyingOTP: false, isAuthenticating: false });
    const input = screen.getByLabelText('Verification code');
    expect(input).toHaveProp('textContentType', 'oneTimeCode');
    expect(input).toHaveProp('autoComplete', 'sms-otp');
    shows('+91 98765 43210');
    expect(screen.getAllByLabelText('Wrong number? Change mobile number')[0]).toBeOnTheScreen();
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('waiting for approval names the facility and the requested status', async () => {
    await renderIn(<PendingEnrollmentScreen />, brand, mode);
    shows('Waiting for approval');
    shows('Fictional Cold Store');
    shows('Requested');
    expect(hasBackground(t.status.critical.background)).toBe(true);
  });

  it('enrollment review renders for administrators', async () => {
    await renderIn(<EnrollmentReviewScreen />, brand, mode, { userProfile: { role: 'admin' } });
    shows('Choose how each person can use this facility, then approve.');
    expect(hasBackground(t.background.base)).toBe(true);
  });

  it('Paper and navigation themes come from the tokens', () => {
    const paper = createPaperTheme(t);
    expect(paper.dark).toBe(mode === 'dark');
    expect(paper.colors.primary).toBe(t.brand.fill);
    expect(paper.colors.onPrimary).toBe(t.brand.onFill);
    expect(paper.colors.background).toBe(t.background.base);
    expect(paper.colors.surface).toBe(t.surface.card);
    expect(paper.colors.onSurface).toBe(t.text.primary);
    expect(paper.colors.error).toBe(t.status.negative.text);
    expect(paper.colors.inverseSurface).toBe(t.surface.inverse);
    expect(paper.colors.backdrop).toBe(t.overlay.scrim);
    const nav = createNavigationTheme(t);
    expect(nav.colors).toMatchObject({
      background: t.background.base,
      card: t.surface.header,
      primary: t.brand.tint,
      text: t.text.primary,
      border: t.border.divider,
    });
  });
});
