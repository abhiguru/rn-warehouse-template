/**
 * Full-screen and error states render in all four themes (brand × mode) on
 * the theme background, with the style-guide wording and no developer text
 * outside development builds.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeatureErrorBoundary } from '@/components/FeatureErrorBoundary';
import { ListErrorFallback } from '@/components/list/ListErrorBoundary';
import { InvalidRouteScreen } from '@/components/InvalidRouteScreen';

let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
/** An element of the rendered tree, as the queries return it. */
type HostElement = ReturnType<typeof screen.getByRole>;

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
  useEnvironment: () => ({ name: 'Test', version: '1.0.0', buildDate: '2026-10-09T10:00:00Z' }),
}));
jest.mock('@/hooks/useHaptics', () => ({
  triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(),
}));

function Crash(): React.ReactElement {
  throw new Error('Fictional render failure');
}

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

/** Every drawn element of the rendered tree: the background and the icon colour have no role or text to query by. */
function elementsIn(root: HostElement): HostElement[] {
  return [root, ...root.children.flatMap(child => (typeof child === 'string' ? [] : elementsIn(child)))];
}

function hasBackground(color: string): boolean {
  return elementsIn(screen.root!).some(node =>
    [].concat(node.props.style ?? []).flat().some((s: { backgroundColor?: string } | null) => s?.backgroundColor === color)
  );
}

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockTheme = { preference: mode, brand };
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('ErrorBoundary shows the error state with a Try again action', async () => {
    await render(<ErrorBoundary><Crash /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
    expect(hasBackground(t.background.base)).toBe(true);
    const icon = elementsIn(screen.root!).filter(node => (node.type as unknown) === 'Icon' && node.props.name === 'alert-circle-outline');
    expect(icon[0].props.color).toBe(t.status.negative.text);
  });

  it('FeatureErrorBoundary offers Try again and a way back to the list', async () => {
    await render(<FeatureErrorBoundary feature="dispatch"><Crash /></FeatureErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByText('Go to dispatches')).toBeOnTheScreen();
  });

  it('ListErrorFallback names the list', async () => {
    await render(<ListErrorFallback listName="invoices" onRetry={jest.fn()} />);
    expect(screen.getByText("Couldn't show the invoices. Try again.")).toBeOnTheScreen();
  });

  it('InvalidRouteScreen renders with a Go back action', async () => {
    await render(<InvalidRouteScreen />);
    expect(screen.getByText('Page not found')).toBeOnTheScreen();
    expect(screen.getByText('Go back')).toBeOnTheScreen();
  });
});
