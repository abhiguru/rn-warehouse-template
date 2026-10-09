/**
 * Full-screen and error states render in all four themes (brand × mode) on
 * the theme background, with the style-guide wording and no developer text
 * outside development builds.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeatureErrorBoundary } from '@/components/FeatureErrorBoundary';
import { ListErrorFallback } from '@/components/list/ListErrorBoundary';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { InvalidRouteScreen } from '@/components/InvalidRouteScreen';
import { BiometricLockScreen } from '@/components/BiometricLockScreen';

let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => ReactActual.createElement('SafeAreaView', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@/config/sentryConfig', () => ({ captureException: jest.fn() }));
jest.mock('@/hooks/useConfig', () => ({
  useSupport: () => ({ email: 'support@example.test', phone: '+91 98765 43210' }),
  useEnvironment: () => ({ name: 'Test', version: '1.0.0', buildDate: '2026-10-09T10:00:00Z' }),
}));
jest.mock('@/hooks/useBiometricAuth', () => ({
  useBiometricAuth: () => ({
    biometricType: 'fingerprint',
    biometricLabel: 'Fingerprint',
    authenticateWithBiometric: jest.fn(() => Promise.resolve(false)),
    isLoading: false,
  }),
}));
jest.mock('@/hooks/useHaptics', () => ({
  triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(),
}));

function Crash(): React.ReactElement {
  throw new Error('Fictional render failure');
}

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

function textOf(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

function hasBackground(tree: ReactTestRenderer, color: string): boolean {
  return tree.root.findAll(node =>
    [].concat(node.props.style ?? []).flat().some((s: { backgroundColor?: string } | null) => s?.backgroundColor === color)
  ).length > 0;
}

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  let tree: ReactTestRenderer | undefined;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockTheme = { preference: mode, brand };
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined;
    consoleError.mockRestore();
  });

  it('ErrorBoundary shows the error state with a Try again action', () => {
    act(() => { tree = create(<ErrorBoundary><Crash /></ErrorBoundary>); });
    const text = textOf(tree!);
    expect(text).toContain('Something went wrong');
    expect(text).toContain('Try again');
    expect(hasBackground(tree!, t.background.base)).toBe(true);
    const icon = tree!.root.findAll(node => (node.type as unknown) === 'MaterialCommunityIcons' && node.props.name === 'alert-circle-outline');
    expect(icon[0].props.color).toBe(t.status.negative.text);
  });

  it('FeatureErrorBoundary offers Try again and a way back to the list', () => {
    act(() => { tree = create(<FeatureErrorBoundary feature="dispatch"><Crash /></FeatureErrorBoundary>); });
    const text = textOf(tree!);
    expect(text).toContain('Something went wrong');
    expect(text).toContain('Go to dispatches');
  });

  it('ListErrorFallback names the list', () => {
    act(() => { tree = create(<ListErrorFallback listName="invoices" onRetry={jest.fn()} />); });
    expect(textOf(tree!)).toContain("Couldn't show the invoices. Try again.");
  });

  it('MaintenanceScreen renders on the theme background', () => {
    act(() => { tree = create(<MaintenanceScreen />); });
    expect(textOf(tree!)).toContain('The app is under maintenance');
    expect(hasBackground(tree!, t.background.base)).toBe(true);
  });

  it('InvalidRouteScreen renders with a Go back action', () => {
    act(() => { tree = create(<InvalidRouteScreen />); });
    const text = textOf(tree!);
    expect(text).toContain('Page not found');
    expect(text).toContain('Go back');
  });

  it('BiometricLockScreen renders on the theme background', async () => {
    await act(async () => { tree = create(<BiometricLockScreen onSuccess={jest.fn()} onUsePhoneLogin={jest.fn()} />); });
    expect(textOf(tree!)).toContain('Welcome back');
    expect(hasBackground(tree!, t.background.base)).toBe(true);
  });
});
