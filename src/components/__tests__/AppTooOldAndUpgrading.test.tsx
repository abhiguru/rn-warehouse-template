/**
 * The "Update the app" screen and the upgrading banner (docs/STYLE_GUIDE.md §13.9): the words, the versions named, the
 * update link opened when the facility publishes one, and the banner shown only while the server is being updated.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AppTooOldScreen from '@/components/AppTooOldScreen';
import UpgradingBanner from '@/components/UpgradingBanner';
import { setLanguage, t } from '@/i18n';
import { resetUpgradeNotice } from '@/config/upgradeNotice';
import { noteUpgradeAnswer } from '@/config/upgradeNotice';

let mockState: { config?: { publicConfig?: { maintenanceMode: boolean } } } = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, ...mockState }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => ReactActual.createElement('SafeAreaView', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const textOf = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label || (node.props.onPress && textInside(node) === label));
const textInside = (node: { findAll: ReactTestRenderer['root']['findAll'] }) =>
  node.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join('')).join('');

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  mockState = {};
  resetUpgradeNotice();
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('AppTooOldScreen', () => {
  const info = { minimum: '0.7.0', current: '0.6.0' };

  it('says "Update the app" and names both versions', () => {
    act(() => { tree = create(<AppTooOldScreen {...info} onClose={jest.fn()} />); });
    const text = textOf(tree!);
    expect(text).toContain('Update the app');
    expect(text).toContain('This facility needs app version 0.7.0 or newer. You have 0.6.0.');
  });

  it('with the facility\'s link, offers "Get the update" and opens that link', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    act(() => { tree = create(<AppTooOldScreen {...info} updateUrl="https://updates.example.test/app.apk" onClose={jest.fn()} />); });
    act(() => { button(tree!, 'Get the update').props.onPress(); });
    expect(open).toHaveBeenCalledWith('https://updates.example.test/app.apk');
    expect(textOf(tree!)).not.toContain(t('components.appTooOld.noLink'));
  });

  it('without a link, shows the text only and says to ask the facility', () => {
    act(() => { tree = create(<AppTooOldScreen {...info} onClose={jest.fn()} />); });
    expect(textOf(tree!)).toContain('Ask the facility where to get the new version.');
    expect(textOf(tree!).join('|')).not.toContain('Get the update');
  });

  it('Back leaves the screen', () => {
    const onClose = jest.fn();
    act(() => { tree = create(<AppTooOldScreen {...info} onClose={onClose} />); });
    act(() => { button(tree!, 'Back').props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is worded in Gujarati', () => {
    setLanguage('gu');
    act(() => { tree = create(<AppTooOldScreen {...info} onClose={jest.fn()} />); });
    expect(textOf(tree!)).toContain('ઍપ અપડેટ કરો');
  });
});

describe('UpgradingBanner', () => {
  const upgradingAnswer = () =>
    noteUpgradeAnswer({
      status: 503,
      headers: { get: () => '120' },
      clone() { return { json: async () => ({ code: 'upgrading' }) }; },
    } as unknown as Response);

  it('shows nothing while the server answers', () => {
    act(() => { tree = create(<UpgradingBanner />); });
    expect(tree!.toJSON()).toBeNull();
  });

  it('shows the message after the gateway\'s upgrading answer', async () => {
    act(() => { tree = create(<UpgradingBanner />); });
    await act(async () => { await upgradingAnswer(); });
    expect(textOf(tree!)).toContain("The facility's server is being updated. Try again in a few minutes.");
  });

  it('shows the same message when the facility\'s configuration says maintenance mode (the one screen for both)', () => {
    mockState = { config: { publicConfig: { maintenanceMode: true } } };
    act(() => { tree = create(<UpgradingBanner />); });
    expect(textOf(tree!)).toContain(t('components.upgrading.message'));
  });
});
