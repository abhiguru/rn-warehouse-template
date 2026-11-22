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
import { StyleSheet } from 'react-native';
import { render as rtlRender, screen, userEvent } from '@testing-library/react-native';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { router } from 'expo-router';
import SettingsScreen from '../../../app/settings';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';
import { registerBrandPack, type BrandPack } from '@/theme/brandPack';

// The fictional sample pack stands in for an organisation's own brand (WH-141): this build has two brands.
registerBrandPack(require('../../../brand-packs/sample-teal/brand.json') as BrandPack);

type MockState = {
  theme: { preference: 'system' | 'light' | 'dark'; brand: 'orange' | 'sample-teal'; language: 'system' | 'en' | 'gu' };
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
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true, useFocusEffect: require('./focusHarness').useFocusEffect }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null, onOperatorServerChange: () => () => undefined }));
// Document numbers is offered where the backend has migration 127.
jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => true }));
// A facility whose public config turns sensors on: the Settings row of every role is shown.
jest.mock('@/hooks/useCapability', () => ({
  useFacilityCapabilities: () => ({ printing: false, sensors: true, realtime: true, customerDocuments: false }),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn() }));
// The real SectionHeader, with its calls recorded: a title drawn with a local copy of its style is not one of them.
jest.mock('@/components/ui/SectionHeader', () => {
  const actual = jest.requireActual('@/components/ui/SectionHeader');
  const recorded = jest.fn(actual.SectionHeader);
  return { ...actual, SectionHeader: recorded, default: recorded };
});
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: (work: () => Promise<unknown>) => work() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(),
  isDeleteAccountRejection: () => false,
}));

let user: ReturnType<typeof userEvent.setup>;
async function render() {
  await rtlRender(<SettingsScreen />);
}
/** The store mock does not notify: draw again after an action, as a store update would. */
async function redraw() {
  await screen.rerender(<SettingsScreen />);
}
// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const byTestId = (id: string) => screen.queryAllByTestId(id, everything);
const press = async (node: ReturnType<typeof screen.getByTestId>) => {
  await user.press(node);
  await redraw();
};
const row = (id: string) => screen.getByTestId(id);
/** One pressable per radio of this sheet. */
const radios = (sheet: string) => screen.queryAllByRole('radio', everything).filter(node => String(node.props.testID ?? '').startsWith(`${sheet}-`));
const checked = (sheet: string) => radios(sheet).filter(node => node.props.accessibilityState?.checked).map(node => node.props.accessibilityLabel);
const signedInAs = (role: string) => {
  mockState = {
    theme: { preference: 'dark', brand: 'sample-teal', language: 'en' },
    auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role, mobile: '919000000001' } },
  };
};

beforeEach(() => {
  jest.mocked(SectionHeader).mockClear();
  jest.clearAllMocks();
  user = userEvent.setup({ delay: 0 });
  signedInAs('admin');
});
afterEach(() => {
  setLanguage('en');
});

describe('Delete account', () => {
  it('is offered for a profile with a mobile number', async () => {
    await render();
    expect(row('account-delete')).toBeOnTheScreen();
  });

  it('is not offered for a profile without one; Sign out becomes the last row', async () => {
    mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, mobile: '' } } };
    await render();
    expect(byTestId('account-delete')).toHaveLength(0);
    // The last row of a group has no divider line under it.
    const dividers = row('account-sign-out').queryAll(node => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.borderBottomWidth !== undefined);
    expect(dividers).toHaveLength(0);
  });
});

describe('Settings order', () => {
  it('is profile card, Warehouse tools, Preferences, Account, Help and about', async () => {
    await render();
    const sections = screen.queryAllByTestId(/^settings-section-/, everything).map(node => node.props.testID);
    expect([...new Set(sections)].filter(id => id !== 'settings-section-development')).toEqual([
      'settings-section-tools',
      'settings-section-preferences',
      'settings-section-account',
      'settings-section-help',
    ]);
    // The ones that count are on the screen, not only mounted.
    ['tools', 'preferences', 'account', 'help'].forEach(id => expect(screen.getByTestId(`settings-section-${id}`)).toBeOnTheScreen());
    // The section titles are shared SectionHeaders (G-43); they print in capitals. Each is a header named by its title.
    const drawn = [...new Set(jest.mocked(SectionHeader).mock.calls.map(([props]) => props.title))];
    const headers = screen.queryAllByRole('header', everything).map(node => node.props.accessibilityLabel as string | undefined);
    expect(drawn).toEqual(expect.arrayContaining(['Warehouse tools', 'Preferences', 'Account', 'Help and about']));
    expect(headers).toEqual(expect.arrayContaining(['Warehouse tools', 'Preferences', 'Account', 'Help and about']));
    expect(headers).not.toContain('App features');
    expect(headers).not.toContain('About');
  });

  it('offers Help in Help and about, which opens the Help screen', async () => {
    await render();
    expect(row('settings-help')).toHaveAccessibleName('Help, Who to ask, roles and app details');
    await press(row('settings-help'));
    expect(router.push).toHaveBeenCalledWith('/help');
  });

  it.each([
    ['admin', 12],
    ['supervisor', 6],
    ['staff', 1],
    ['customer', 0],
  ])('keeps the tool rows of the role (%s: %d)', async (role, count) => {
    signedInAs(role);
    await render();
    const shown = new Set(screen.queryAllByTestId(/^settings-feature-/, everything).map(node => node.props.testID));
    expect(shown.size).toBe(count);
    // The tools section is on the screen when the role has rows, and not mounted at all when it has none.
    if (count > 0) expect(screen.queryAllByTestId('settings-section-tools').length).toBeGreaterThan(0);
    else expect(byTestId('settings-section-tools')).toHaveLength(0);
  });

  it.each(['staff', 'supervisor', 'admin'])('has no Item pricing row for %s (the screen was removed from Settings)', async (role) => {
    signedInAs(role);
    await render();
    expect(byTestId('settings-feature-itemPricing')).toHaveLength(0);
  });
});

describe('Preferences rows', () => {
  it('show the current values and are read with them', async () => {
    await render();
    expect(row('settings-pref-appearance')).toHaveAccessibleName('Appearance, Dark');
    expect(row('settings-pref-language')).toHaveAccessibleName('Language on this phone, English');
    expect(row('settings-pref-brand')).toHaveAccessibleName('App colours, Sample teal');
    // No sheet is open, and the old cards are gone.
    expect(screen.queryAllByRole('radio', everything)).toHaveLength(0);
  });

  it('Appearance: a choice applies at once and the sheet stays open; the Close X closes it', async () => {
    await render();
    await press(row('settings-pref-appearance'));
    expect(checked('settings-sheet-appearance')).toEqual(['Dark']);
    expect(radios('settings-sheet-appearance').map(node => node.props.accessibilityLabel)).toEqual(['System', 'Light', 'Dark']);
    await press(radios('settings-sheet-appearance')[1]);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setThemePreference', payload: 'light' });
    expect(checked('settings-sheet-appearance')).toEqual(['Light']);
    expect(row('settings-pref-appearance')).toHaveAccessibleName('Appearance, Light');
    await press(screen.getByLabelText('Close'));
    expect(radios('settings-sheet-appearance')).toHaveLength(0);
  });

  it('Brand: the swatches lead the row, and a choice applies at once', async () => {
    await render();
    await press(row('settings-pref-brand'));
    expect(checked('settings-sheet-brand')).toEqual(['Sample teal colours']);
    await press(radios('settings-sheet-brand')[0]);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setBrand', payload: 'orange' });
    expect(checked('settings-sheet-brand')).toEqual(['Orange colours']);
    expect(row('settings-pref-brand')).toHaveAccessibleName('App colours, Orange');
  });

  it('Language: a new language opens the sheet again on the rebuilt screen', async () => {
    await render();
    await press(row('settings-pref-language'));
    expect(checked('settings-sheet-language')).toEqual(['English language']);
    // The sheet says the language belongs to the phone (SR-O05).
    expect(
      screen.getByText('The language stays on this phone for everyone who signs in here. Your choice also goes with your account to a phone where no language is chosen.')
    ).toBeOnTheScreen();
    await press(radios('settings-sheet-language').find(node => node.props.accessibilityLabel === 'ગુજરાતી language')!);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setLanguagePreference', payload: 'gu' });
    // The navigation tree is keyed by the language: Settings is drawn from the start.
    await screen.unmount();
    await render();
    expect(checked('settings-sheet-language')).toEqual(['ગુજરાતી ભાષા']);
    // Only once: the next Settings opens with no sheet.
    await screen.unmount();
    await render();
    expect(radios('settings-sheet-language')).toHaveLength(0);
  });

  it('Language: choosing the language already in effect does not reopen anything later', async () => {
    await render();
    await press(row('settings-pref-language'));
    await press(radios('settings-sheet-language').find(node => node.props.accessibilityLabel === 'English language')!);
    await screen.unmount();
    await render();
    expect(radios('settings-sheet-language')).toHaveLength(0);
  });
});
