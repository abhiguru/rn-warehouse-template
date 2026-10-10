/**
 * Sign-in flow (style guide §14.8) renders in all four themes with token colours.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    Stack: { Screen: () => null },
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
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
jest.mock('@/services/enrollmentReviewService', () => ({
  listPendingEnrollments: jest.fn(() => new Promise(() => undefined)),
  listEnrollmentCustomers: jest.fn(() => new Promise(() => undefined)),
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
jest.mock('@/components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
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

function renderIn(element: React.ReactElement, brand: Brand, mode: Mode, auth: Record<string, unknown> = {}) {
  mockState = { theme: { preference: mode, brand }, auth };
  let tree!: ReactTestRenderer;
  act(() => { tree = create(element); });
  return tree;
}

function allText(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

function hasBackground(tree: ReactTestRenderer, colour: string) {
  return tree.root.findAll(node => {
    const style = [].concat(node.props.style ?? []).flat(3).filter(Boolean) as Array<{ backgroundColor?: string }>;
    return style.some(s => s.backgroundColor === colour);
  }).length > 0;
}

describe.each(THEMES)('sign-in flow in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('login shows the §14.8 wording on the themed background', () => {
    const tree = renderIn(<LoginScreen />, brand, mode, { isAuthenticating: false });
    const text = allText(tree);
    for (const words of ['Sign in', 'Enter your mobile number to get a one-time code.', 'MOBILE NUMBER', '+91', 'Change']) {
      expect(text).toContain(words);
    }
    expect(hasBackground(tree, t.background.base)).toBe(true);
    act(() => tree.unmount());
  });

  it('code entry uses one-time-code autofill and offers "Wrong number?"', () => {
    const tree = renderIn(<OTPScreen />, brand, mode, { phoneNumber: '+919876543210', isVerifyingOTP: false, isAuthenticating: false });
    const input = tree.root.find(node => node.props.textContentType === 'oneTimeCode' && typeof node.props.onChangeText === 'function');
    expect(input.props.autoComplete).toBe('sms-otp');
    expect(allText(tree)).toContain('+91 98765 43210');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Wrong number? Change mobile number').length).toBeGreaterThan(0);
    expect(hasBackground(tree, t.background.base)).toBe(true);
    act(() => tree.unmount());
  });

  it('waiting for approval names the facility and the requested status', () => {
    const tree = renderIn(<PendingEnrollmentScreen />, brand, mode);
    const text = allText(tree);
    expect(text).toContain('Waiting for approval');
    expect(text).toContain('Fictional Cold Store');
    expect(text).toContain('Requested');
    expect(hasBackground(tree, t.status.critical.background)).toBe(true);
    act(() => tree.unmount());
  });

  it('enrollment review renders for administrators', () => {
    const tree = renderIn(<EnrollmentReviewScreen />, brand, mode, { userProfile: { role: 'admin' } });
    expect(allText(tree)).toContain('Pending enrollments');
    expect(hasBackground(tree, t.background.base)).toBe(true);
    act(() => tree.unmount());
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
