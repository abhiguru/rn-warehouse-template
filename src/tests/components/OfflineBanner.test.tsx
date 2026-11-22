import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { OfflineBanner } from '@/components/OfflineBanner';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockOffline = false;
let mockLanFailure: 'old-configuration' | null = null;
const mockBannerUnmount = jest.fn();
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/hooks/useLanStatus', () => ({ useLanStatus: () => ({ path: 'public', failure: mockLanFailure, lan: null }) }));
let mockThemeState = { theme: { preference: 'light', brand: 'orange' } };
// The react-native mock below is minimal, so theme hooks resolve tokens directly.
jest.mock('@/hooks/useTheme', () => {
  const { getTokens } = jest.requireActual('@/theme/tokens');
  const current = () => getTokens(mockThemeState.theme.brand, mockThemeState.theme.preference);
  return {
    useTokens: () => current(),
    useThemedStyles: (factory: (t: unknown) => unknown) => factory(current()),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The theme reads the build's brand pack from expo-constants (WH-141); this test replaces react-native wholesale, so give it a plain config.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('react-native', () => {
  const React = require('react');
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  function flatten(style: unknown): unknown {
    return Array.isArray(style) ? Object.assign({}, ...style.map(entry => flatten(entry) as object)) : style ?? {};
  }
  const AnimatedView = ({ children, ...props }: Record<string, unknown>) => {
    React.useEffect(() => () => mockBannerUnmount(), []);
    return React.createElement('AnimatedView', props, children);
  };
  return {
    View: element('View'), Text: element('Text'),
    // flatten is for Testing Library, which reads styles to find what is hidden.
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, flatten },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    Animated: { View: AnimatedView, Value: class {}, spring: jest.fn(), timing: jest.fn() },
  };
});

type Completion = (result: { finished: boolean }) => void;
type Animation = { start: jest.Mock; stop: jest.Mock; finish: Completion };
let hides: Animation[];
let animations: Animation[];

function animation(): Animation {
  let complete: Completion | undefined;
  const result = {
    start: jest.fn((callback?: Completion) => { complete = callback; }),
    stop: jest.fn(() => { complete?.({ finished: false }); }),
    finish: (outcome: { finished: boolean }) => { complete?.(outcome); },
  };
  animations.push(result);
  return result;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockOffline = false;
  mockLanFailure = null;
  mockThemeState = { theme: { preference: 'light', brand: 'orange' } };
  hides = [];
  animations = [];
  jest.mocked(Animated.spring).mockImplementation(() => animation() as unknown as Animated.CompositeAnimation);
  jest.mocked(Animated.timing).mockImplementation(() => {
    const result = animation();
    hides.push(result);
    return result as unknown as Animated.CompositeAnimation;
  });
});
const OFFLINE_MESSAGE = "You're offline. Actions that need the server will work again when you reconnect.";
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const expectShown = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const expectNotShown = (text: string) => expect(screen.queryByText(text, hidden)).not.toBeOnTheScreen();
async function setOffline(value: boolean) {
  mockOffline = value;
  await screen.rerender(<OfflineBanner />);
}
async function disconnectThenReconnect() {
  await render(<OfflineBanner />);
  expectNotShown(OFFLINE_MESSAGE);
  await setOffline(true);
  expectShown(OFFLINE_MESSAGE);
  await setOffline(false);
  expect(hides).toHaveLength(1);
}

it('hides after a completed reconnect animation', async () => {
  await disconnectThenReconnect();
  await act(async () => { hides[0].finish({ finished: true }); });
  expectNotShown(OFFLINE_MESSAGE);
});

it.each([false, true])('keeps the warning when an obsolete hide reports finished=%s after another disconnect', async finished => {
  await disconnectThenReconnect();
  await setOffline(true);
  await act(async () => { hides[0].finish({ finished }); });
  expectShown(OFFLINE_MESSAGE);
  expect(mockBannerUnmount).not.toHaveBeenCalled();
});

it('stops an obsolete hide and still hides normally after the next reconnect', async () => {
  await disconnectThenReconnect();
  await setOffline(true);
  expect(hides[0].stop).toHaveBeenCalledTimes(1);
  await setOffline(false);
  expect(hides).toHaveLength(2);
  await act(async () => { hides[0].finish({ finished: true }); });
  expectShown(OFFLINE_MESSAGE);
  await act(async () => { hides[1].finish({ finished: true }); });
  expectNotShown(OFFLINE_MESSAGE);
});

it('stops the active animation when the banner unmounts', async () => {
  await disconnectThenReconnect();
  const current = animations[animations.length - 1];
  await screen.unmount();
  expect(current.stop).toHaveBeenCalledTimes(1);
  await act(async () => { current.finish({ finished: true }); });
});

it('says the warehouse network answered with an old configuration when it did, and the usual line otherwise', async () => {
  const OLD =
    "The warehouse network answered with an old configuration. Ask whoever runs your server to run the server's start step again, or connect to the internet.";
  mockOffline = true;
  await render(<OfflineBanner />);
  expectShown(OFFLINE_MESSAGE);
  expectNotShown(OLD);
  mockLanFailure = 'old-configuration';
  await screen.rerender(<OfflineBanner />);
  expectShown(OLD);
  expectNotShown(OFFLINE_MESSAGE);
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'offline banner in %s %s',
  (brand, mode) => {
    it('uses the neutral status background and the offline icon', async () => {
      mockThemeState = { theme: { preference: mode, brand } };
      mockOffline = true;
      await render(<OfflineBanner />);
      const t = getTokens(brand, mode);
      // This file replaces react-native, so the banner (the root) and its icon are plain host
      // elements that no role query reaches: they are read by type and props.
      const banner = screen.root!;
      expect(banner.type).toBe('AnimatedView');
      const style = Object.assign({}, ...[].concat(banner.props.style));
      expect(style.backgroundColor).toBe(t.status.neutral.background);
      expect(style.paddingTop).toBe(24);
      expect(banner.props.accessibilityRole).toBe('alert');
      const icons = screen.root!.queryAll(node => (node.type as unknown) === 'Icon');
      expect(icons).toHaveLength(1);
      expect(icons[0].props.name).toBe('cloud-off-outline');
      expect(icons[0].props.color).toBe(t.status.neutral.text);
    });
  }
);
