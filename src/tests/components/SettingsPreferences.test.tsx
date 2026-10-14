/**
 * SR-O02, SR-O04: Settings in its new order, with compact preference rows.
 *
 * Order: profile card, Warehouse tools (by role), Preferences, Account, Help
 * and about. Appearance, Language on this phone and Brand are rows with their
 * current value; each opens a sheet whose choice applies at once and keeps the
 * sheet open; Done closes it. A language change rebuilds the screen, and the
 * language sheet is open again on the rebuilt screen.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import SettingsScreen from '../../../app/settings';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';
import { SectionHeader } from '@/components/ui/SectionHeader';

type MockState = {
  theme: { preference: 'system' | 'light' | 'dark'; brand: 'orange' | 'gcsa'; language: 'system' | 'en' | 'gu' };
  auth: { userProfile: { id: string; name: string; role: string; mobile: string } };
};
let mockState: MockState;
const mockDispatch = jest.fn((action: { type: string }) => {
  if (action.type.startsWith('theme/')) mockState = { ...mockState, theme: themeReducer(mockState.theme as never, action as never) as MockState['theme'] };
  return { unwrap: async () => action };
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
// A facility whose public config turns sensors on: the Settings row of every role is shown.
jest.mock('@/hooks/useCapability', () => ({
  useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));

let tree: ReactTestRenderer | undefined;
async function render() {
  await act(async () => {
    tree = create(<SettingsScreen />);
  });
}
/** The store mock does not notify: draw again after an action, as a store update would. */
async function redraw() {
  await act(async () => {
    tree!.update(<SettingsScreen />);
  });
}
const byTestId = (id: string) => tree!.root.findAll(node => node.props.testID === id && typeof node.type !== 'string');
const press = async (node: ReactTestInstance) => {
  await act(async () => {
    node.props.onPress();
  });
  await redraw();
};
/** The outermost pressable with this test id. */
const row = (id: string) => byTestId(id).filter(node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel)[0];
/** One pressable per radio (the outermost of each). */
const radios = (sheet: string) => {
  const found = tree!.root.findAll(
    node =>
      node.props.accessibilityRole === 'radio' &&
      String(node.props.testID ?? '').startsWith(`${sheet}-`) &&
      typeof node.props.onPress === 'function'
  );
  return found.filter((node, index) => found.findIndex(other => other.props.testID === node.props.testID) === index);
};
const checked = (sheet: string) => radios(sheet).filter(node => node.props.accessibilityState?.checked).map(node => node.props.accessibilityLabel);
const signedInAs = (role: string) => {
  mockState = {
    theme: { preference: 'dark', brand: 'gcsa', language: 'en' },
    auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role, mobile: '919000000001' } },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  signedInAs('admin');
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  setLanguage('en');
});

describe('Delete account', () => {
  it('is offered for a profile with a mobile number', async () => {
    await render();
    expect(row('account-delete')).toBeDefined();
  });

  it('is not offered for a profile without one; Sign out becomes the last row', async () => {
    mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, mobile: '' } } };
    await render();
    expect(byTestId('account-delete')).toHaveLength(0);
    expect(byTestId('account-sign-out')[0].props.last).toBe(true);
  });
});

describe('Settings order', () => {
  it('is profile card, Warehouse tools, Preferences, Account, Help and about', async () => {
    await render();
    const sections = tree!.root
      .findAll(node => typeof node.type !== 'string' && String(node.props.testID ?? '').startsWith('settings-section-'))
      .map(node => node.props.testID);
    expect([...new Set(sections)].filter(id => id !== 'settings-section-development')).toEqual([
      'settings-section-tools',
      'settings-section-preferences',
      'settings-section-account',
      'settings-section-help',
    ]);
    // The section titles are shared SectionHeaders (G-43); they print in capitals.
    const headers = tree!.root.findAllByType(SectionHeader).map(node => node.props.title);
    expect(headers).toEqual(expect.arrayContaining(['Warehouse tools', 'Preferences', 'Account', 'Help and about']));
    expect(headers).not.toContain('App features');
    expect(headers).not.toContain('About');
  });

  it('offers Help in Help and about, which opens the Help screen', async () => {
    await render();
    expect(row('settings-help').props.accessibilityLabel).toBe('Help, Who to ask, roles and app details');
    await press(row('settings-help'));
    expect(router.push).toHaveBeenCalledWith('/help');
  });

  it.each([
    ['admin', 6],
    ['supervisor', 5],
    ['staff', 2],
    ['customer', 0],
  ])('keeps the tool rows of the role (%s: %d)', async (role, count) => {
    signedInAs(role);
    await render();
    const shown = new Set(
      tree!.root
        .findAll(node => typeof node.type !== 'string' && String(node.props.testID ?? '').startsWith('settings-feature-'))
        .map(node => node.props.testID)
    );
    expect(shown.size).toBe(count);
    expect(byTestId('settings-section-tools').length > 0).toBe(count > 0);
  });
});

describe('Preferences rows', () => {
  it('show the current values and are read with them', async () => {
    await render();
    expect(row('settings-pref-appearance').props.accessibilityLabel).toBe('Appearance, Dark');
    expect(row('settings-pref-language').props.accessibilityLabel).toBe('Language on this phone, English');
    expect(row('settings-pref-brand').props.accessibilityLabel).toBe('App colours, GCSA navy');
    // No sheet is open, and the old cards are gone.
    expect(tree!.root.findAll(node => node.props.accessibilityRole === 'radio')).toHaveLength(0);
  });

  it('Appearance: a choice applies at once and the sheet stays open; Done closes it', async () => {
    await render();
    await press(row('settings-pref-appearance'));
    expect(checked('settings-sheet-appearance')).toEqual(['Dark']);
    expect(radios('settings-sheet-appearance').map(node => node.props.accessibilityLabel)).toEqual(['System', 'Light', 'Dark']);
    await press(radios('settings-sheet-appearance')[1]);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setThemePreference', payload: 'light' });
    expect(checked('settings-sheet-appearance')).toEqual(['Light']);
    expect(row('settings-pref-appearance').props.accessibilityLabel).toBe('Appearance, Light');
    const done = tree!.root.find(node => node.props.accessibilityLabel === 'Done' && typeof node.props.onPress === 'function');
    await press(done);
    expect(radios('settings-sheet-appearance')).toHaveLength(0);
  });

  it('Brand: the swatches lead the row, and a choice applies at once', async () => {
    await render();
    await press(row('settings-pref-brand'));
    expect(checked('settings-sheet-brand')).toEqual(['GCSA navy colours']);
    await press(radios('settings-sheet-brand')[0]);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setBrand', payload: 'orange' });
    expect(checked('settings-sheet-brand')).toEqual(['Orange colours']);
    expect(row('settings-pref-brand').props.accessibilityLabel).toBe('App colours, Orange');
  });

  it('Language: a new language opens the sheet again on the rebuilt screen', async () => {
    await render();
    await press(row('settings-pref-language'));
    expect(checked('settings-sheet-language')).toEqual(['English language']);
    // The sheet says the language belongs to the phone (SR-O05).
    const shown = tree!.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children);
    expect(shown).toContain(
      'The language stays on this phone for everyone who signs in here. Your choice also goes with your account to a phone where no language is chosen.'
    );
    await press(radios('settings-sheet-language').find(node => node.props.accessibilityLabel === 'ગુજરાતી language')!);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setLanguagePreference', payload: 'gu' });
    // The navigation tree is keyed by the language: Settings is drawn from the start.
    await act(async () => { tree!.unmount(); });
    await render();
    expect(checked('settings-sheet-language')).toEqual(['ગુજરાતી ભાષા']);
    // Only once: the next Settings opens with no sheet.
    await act(async () => { tree!.unmount(); });
    await render();
    expect(radios('settings-sheet-language')).toHaveLength(0);
  });

  it('Language: choosing the language already in effect does not reopen anything later', async () => {
    await render();
    await press(row('settings-pref-language'));
    await press(radios('settings-sheet-language').find(node => node.props.accessibilityLabel === 'English language')!);
    await act(async () => { tree!.unmount(); });
    await render();
    expect(radios('settings-sheet-language')).toHaveLength(0);
  });
});
