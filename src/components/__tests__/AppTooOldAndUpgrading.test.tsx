/**
 * The "Update the app" screen and the upgrading banner (docs/STYLE_GUIDE.md §13.9): the words, the versions named, the
 * update link opened when the facility publishes one, and the banner shown only while the server is being updated.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

afterEach(() => {
  mockState = {};
  resetUpgradeNotice();
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('AppTooOldScreen', () => {
  const info = { minimum: '0.7.0', current: '0.6.0' };

  it('says "Update the app" and names both versions', async () => {
    await render(<AppTooOldScreen {...info} onClose={jest.fn()} />);
    expect(screen.getByText('Update the app')).toBeOnTheScreen();
    expect(screen.getByText('This facility needs app version 0.7.0 or newer. You have 0.6.0.')).toBeOnTheScreen();
  });

  it('with the facility\'s link, offers "Get the update" and opens that link', async () => {
    const user = userEvent.setup({ delay: 0 });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<AppTooOldScreen {...info} updateUrl="https://updates.example.test/app.apk" onClose={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Get the update' }));
    expect(open).toHaveBeenCalledWith('https://updates.example.test/app.apk');
    expect(screen.queryByText(t('components.appTooOld.noLink'))).not.toBeOnTheScreen();
  });

  it('without a link, shows the text only and says to ask the facility', async () => {
    await render(<AppTooOldScreen {...info} onClose={jest.fn()} />);
    expect(screen.getByText('Ask the facility where to get the new version.')).toBeOnTheScreen();
    expect(screen.queryByText('Get the update')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Get the update' })).not.toBeOnTheScreen();
  });

  it('Back leaves the screen', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onClose = jest.fn();
    await render(<AppTooOldScreen {...info} onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is worded in Gujarati', async () => {
    setLanguage('gu');
    await render(<AppTooOldScreen {...info} onClose={jest.fn()} />);
    expect(screen.getByText('ઍપ અપડેટ કરો')).toBeOnTheScreen();
  });
});

describe('UpgradingBanner', () => {
  const upgradingAnswer = () =>
    noteUpgradeAnswer({
      status: 503,
      headers: { get: () => '120' },
      clone() { return { json: async () => ({ code: 'upgrading' }) }; },
    } as unknown as Response);

  it('shows nothing while the server answers', async () => {
    await render(<UpgradingBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the message after the gateway\'s upgrading answer', async () => {
    await render(<UpgradingBanner />);
    await act(async () => { await upgradingAnswer(); });
    expect(screen.getByText("The facility's server is being updated. Try again in a few minutes.")).toBeOnTheScreen();
  });

  it('ignores a maintenanceMode flag in the facility\'s configuration: only the gateway\'s upgrading answer shows it (WH-28)', async () => {
    mockState = { config: { publicConfig: { maintenanceMode: true } } };
    await render(<UpgradingBanner />);
    expect(screen.toJSON()).toBeNull();
  });
});
