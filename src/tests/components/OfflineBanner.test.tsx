import React from 'react';
import { act, create } from 'react-test-renderer';
import { Animated } from 'react-native';
import { OfflineBanner } from '@/components/OfflineBanner';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockOffline = false;
const mockBannerUnmount = jest.fn();
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native', () => {
  const React = require('react');
  const element = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  const AnimatedView = ({ children, ...props }: Record<string, unknown>) => {
    React.useEffect(() => () => mockBannerUnmount(), []);
    return React.createElement('AnimatedView', props, children);
  };
  return {
    View: element('View'), Text: element('Text'),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    Animated: { View: AnimatedView, Value: class {}, spring: jest.fn(), timing: jest.fn() },
  };
});

type Completion = (result: { finished: boolean }) => void;
type Animation = { start: jest.Mock; stop: jest.Mock; finish: Completion };
let hides: Animation[];
let animations: Animation[];
let tree: ReturnType<typeof create> | undefined;

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
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});
const OFFLINE_MESSAGE = "You're offline. Actions that need the server will work again when you reconnect.";
const visible = () => tree!.root.findAllByType('Text').some(node => node.props.children === OFFLINE_MESSAGE);
async function setOffline(value: boolean) {
  mockOffline = value;
  await act(async () => { tree!.update(<OfflineBanner />); });
}
async function disconnectThenReconnect() {
  await act(async () => { tree = create(<OfflineBanner />); });
  expect(visible()).toBe(false);
  await setOffline(true);
  expect(visible()).toBe(true);
  await setOffline(false);
  expect(hides).toHaveLength(1);
}

it('hides after a completed reconnect animation', async () => {
  await disconnectThenReconnect();
  await act(async () => { hides[0].finish({ finished: true }); });
  expect(visible()).toBe(false);
});

it.each([false, true])('keeps the warning when an obsolete hide reports finished=%s after another disconnect', async finished => {
  await disconnectThenReconnect();
  await setOffline(true);
  await act(async () => { hides[0].finish({ finished }); });
  expect(visible()).toBe(true);
  expect(mockBannerUnmount).not.toHaveBeenCalled();
});

it('stops an obsolete hide and still hides normally after the next reconnect', async () => {
  await disconnectThenReconnect();
  await setOffline(true);
  expect(hides[0].stop).toHaveBeenCalledTimes(1);
  await setOffline(false);
  expect(hides).toHaveLength(2);
  await act(async () => { hides[0].finish({ finished: true }); });
  expect(visible()).toBe(true);
  await act(async () => { hides[1].finish({ finished: true }); });
  expect(visible()).toBe(false);
});

it('stops the active animation when the banner unmounts', async () => {
  await disconnectThenReconnect();
  const current = animations[animations.length - 1];
  await act(async () => { tree!.unmount(); });
  tree = undefined;
  expect(current.stop).toHaveBeenCalledTimes(1);
  await act(async () => { current.finish({ finished: true }); });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'offline banner in %s %s',
  (brand, mode) => {
    it('uses the neutral status background and the offline icon', async () => {
      mockThemeState = { theme: { preference: mode, brand } };
      mockOffline = true;
      await act(async () => { tree = create(<OfflineBanner />); });
      const t = getTokens(brand, mode);
      const banner = tree!.root.findByType('AnimatedView' as unknown as React.ElementType);
      const style = Object.assign({}, ...[].concat(banner.props.style));
      expect(style.backgroundColor).toBe(t.status.neutral.background);
      expect(style.paddingTop).toBe(24);
      expect(banner.props.accessibilityRole).toBe('alert');
      const icon = tree!.root.findByType('Icon' as unknown as React.ElementType);
      expect(icon.props.name).toBe('cloud-off-outline');
      expect(icon.props.color).toBe(t.status.neutral.text);
    });
  }
);
