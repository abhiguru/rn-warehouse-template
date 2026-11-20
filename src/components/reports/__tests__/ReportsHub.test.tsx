/**
 * The Reports tab: its sections (pinned, recent, then the categories), the role gate on
 * every report it lists, what pressing a row and its star does, and the four themes.
 * The store is a plain object; actions go through the real report-prefs reducer.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import ReportsScreen from '../../../../app/(tabs)/reports';
import { setLanguage } from '@/i18n';
import reportPrefs, { type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, getTokens, space, touchTarget, type Brand, type Mode } from '@/theme/tokens';

type Action = { type: string; payload: Record<string, unknown> };
let mockState: { theme: { preference: Mode; brand: Brand }; auth: unknown; reportPrefs: ReportPrefsState };
const mockPush = jest.fn();
const mockDispatch = jest.fn((action: Action) => {
  mockState = { ...mockState, reportPrefs: reportPrefs(mockState.reportPrefs, action) };
});
let mockServer: { origin: string; instanceId: string; displayName: string; companyName: string } | null = null;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer, onOperatorServerChange: () => () => undefined }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' };
const SCOPE = JSON.stringify([SERVER.origin, SERVER.instanceId, 'user-a']);

function signIn(role: string, prefs: { pinned?: string[]; recent?: string[] } = {}, brand: Brand = 'orange', mode: Mode = 'light') {
  mockState = {
    theme: { preference: mode, brand },
    auth: { userProfile: { id: 'user-a', name: 'Asha Fictional', role, assignedCustomerIds: [] } },
    reportPrefs: { byScope: { [SCOPE]: { sort: {}, pinned: prefs.pinned ?? [], recent: prefs.recent ?? [], lastCustomer: {}, usedAt: 1 } } },
  };
}

afterEach(() => {
  setLanguage('en');
});
beforeEach(() => {
  mockServer = SERVER;
  mockPush.mockClear();
  mockDispatch.mockClear();
  mockScrollTo.mockClear();
});

// The scroll view's ref is the jest mock's instance, whose scrollTo is one shared jest.fn (react-native's jest preset).
const mockScrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;
type Host = ReturnType<typeof screen.getByTestId>;

/** Draw the tab again from the store as it is now. */
const rerender = () => screen.rerender(<ReportsScreen />);

/** The element and every host element below it (the style-only cards and the mocked icons have no query). */
function hostTree(root: Host): Host[] {
  const found: Host[] = [];
  const walk = (node: Host | string) => {
    if (typeof node === 'string') return;
    found.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return found;
}
const textOf = (node: Host) => node.children.filter((child): child is string => typeof child === 'string').join('');
const allTexts = () => screen.getAllByText(/./).map(textOf);

/** Each section's title and the titles of its rows, in screen order. */
function sections(): [string, string[]][] {
  return screen.queryAllByTestId(/^reports-hub-section-/).map((section) => [
    within(section).getByRole('header').props.accessibilityLabel as string,
    within(section)
      .getAllByTestId(/^reports-hub-row-/)
      .map((row) => textOf(within(row).getAllByText(/./)[0])),
  ]);
}
const section = (id: string) => screen.getByTestId(`reports-hub-section-${id}`);
/** The pressable with this label, inside `within`. */
const target = (inside: Host, label: string | RegExp) => within(inside).getByRole('button', { name: label });
const actions = () => mockDispatch.mock.calls.map(([action]) => action);

const STOCK = ['Stock', ['Stock summary', 'Item stock summary', 'Stock aging']] as [string, string[]];
const MOVEMENT = ['Movement', ['Dispatch activity', 'GRN activity']] as [string, string[]];
const FINANCIAL = ['Financial', ['Invoice history']] as [string, string[]];

describe('sections', () => {
  it('a staff account with nothing pinned or opened sees the plain category list', async () => {
    signIn('staff');
    await render(<ReportsScreen />);
    expect(sections()).toEqual([STOCK, MOVEMENT, FINANCIAL, ['Operations', ['Customer activity']]]);
    // The headers are the shared SectionHeader: capitals on screen, the title for screen readers.
    expect(screen.getAllByRole('header').map((node) => node.props.accessibilityLabel).filter(Boolean)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    // The tab header stays: large title, subtitle and the profile button.
    expect(allTexts()).toEqual(expect.arrayContaining(['Reports', 'View operations and customer reports', 'STOCK', 'MOVEMENT']));
    expect(screen.getByRole('button', { name: 'Profile and settings' })).toBeOnTheScreen();
  });

  it('names the facility the reports are of under the title, its company name first and its short name otherwise', async () => {
    signIn('staff');
    await render(<ReportsScreen />);
    const line = screen.getByLabelText(/^Facility: /);
    expect(line).toHaveAccessibleName('Facility: Riverside Cold Storage');
    expect(textOf(line)).toBe('Riverside Cold Storage');
    const text = allTexts();
    expect(text.indexOf('Reports')).toBeLessThan(text.indexOf('Riverside Cold Storage'));

    await screen.unmount();
    mockServer = { ...SERVER, companyName: '' };
    await render(<ReportsScreen />);
    expect(screen.getAllByLabelText(/^Facility: /).map((node) => node.props.accessibilityLabel)).toEqual(['Facility: Riverside']);
  });

  it('tells the stock reports apart: stock by customer, stock by item across customers, and stock age', async () => {
    signIn('staff');
    await render(<ReportsScreen />);
    const stock = section('stock');
    expect(target(stock, 'Stock summary. Stock by customer')).toBeOnTheScreen();
    expect(target(stock, 'Item stock summary. Stock by item, across customers')).toBeOnTheScreen();
    expect(target(stock, 'Stock aging. Analyse how long stock has been stored')).toBeOnTheScreen();
  });

  it('shows the pinned reports first, in the order they were pinned, and keeps each in its category', async () => {
    signIn('staff', { pinned: ['invoice-history', 'stock-summary', 'grn-activity'] });
    await render(<ReportsScreen />);
    expect(sections()).toEqual([
      ['Pinned', ['Invoice history', 'Stock summary', 'GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity']],
    ]);
    // The star is filled for a pinned report wherever it is listed.
    for (const id of ['pinned', 'financial']) {
      expect(target(section(id), 'Unpin Invoice history')).toBeSelected();
    }
  });

  it('shows up to three reports opened last, most recent first, none of them pinned', async () => {
    signIn('staff', { pinned: ['grn-activity'], recent: ['grn-activity', 'stock-aging', 'invoice-history', 'stock-summary', 'dispatch-activity'] });
    await render(<ReportsScreen />);
    expect(sections().slice(0, 2)).toEqual([
      ['Pinned', ['GRN activity']],
      ['Recent', ['Stock aging', 'Invoice history', 'Stock summary']],
    ]);
  });

  it('skips a stored report the registry does not know or this role may not open, and fills up to three from the rest', async () => {
    signIn('staff', { pinned: ['old-report'], recent: ['old-report', 'operations-dashboard', 'stock-aging', 'invoice-history', 'stock-summary'] });
    await render(<ReportsScreen />);
    expect(sections().slice(0, 2)).toEqual([
      ['Recent', ['Stock aging', 'Invoice history', 'Stock summary']],
      STOCK,
    ]);
  });

  it('a customer account sees customer activity under Operations, and never the dashboard it once pinned or opened', async () => {
    signIn('customer', { pinned: ['operations-dashboard', 'stock-summary'], recent: ['operations-dashboard', 'grn-activity'] });
    await render(<ReportsScreen />);
    expect(sections()).toEqual([
      ['Pinned', ['Stock summary']],
      ['Recent', ['GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity']],
    ]);
  });

  it('staff are not offered the dashboard either: its gate is for administrators and supervisors', async () => {
    signIn('staff', { pinned: ['operations-dashboard'], recent: ['operations-dashboard'] });
    await render(<ReportsScreen />);
    expect(sections().map(([title]) => title)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    expect(sections()[3]).toEqual(['Operations', ['Customer activity']]);
  });

  it.each(['admin', 'supervisor'])('%s sees the dashboard, also pinned', async (role) => {
    signIn(role, { pinned: ['operations-dashboard', 'stock-summary'], recent: ['operations-dashboard', 'grn-activity'] });
    await render(<ReportsScreen />);
    expect(sections()).toEqual([
      ['Pinned', ['Operations dashboard', 'Stock summary']],
      ['Recent', ['GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity', 'Operations dashboard']],
    ]);
  });

  it('follows the language', async () => {
    setLanguage('gu');
    signIn('staff', { pinned: ['grn-activity'] });
    await render(<ReportsScreen />);
    expect(sections().map(([title]) => title)).toEqual(['પિન કરેલા', 'સ્ટોક', 'આવક-જાવક', 'નાણાકીય', 'કામગીરી']);
    expect(target(section('movement'), 'આવકની કામગીરી અનપિન કરો')).toBeOnTheScreen();
    expect(target(section('stock'), 'સ્ટોકનો સારાંશ સૌથી ઉપર પિન કરો')).toBeOnTheScreen();
  });
});

describe('pressing', () => {
  const OPEN_GRN = 'GRN activity. Recent goods received with invoice status';

  it('a row opens its report and notes it as opened, for this facility and account', async () => {
    const user = userEvent.setup({ delay: 0 });
    signIn('staff');
    await render(<ReportsScreen />);
    await user.press(target(section('movement'), OPEN_GRN));
    expect(mockPush).toHaveBeenCalledWith('/reports/grn-activity');
    expect(actions()).toEqual([
      { type: 'reportPrefs/noteReportOpened', payload: { scope: SCOPE, reportId: 'grn-activity', at: expect.any(Number) } },
    ]);
    // Next time the tab is drawn, the report is under Recent.
    await rerender();
    expect(sections()[0]).toEqual(['Recent', ['GRN activity']]);
  });

  it('the star pins and unpins without opening the report, and says which it will do', async () => {
    const user = userEvent.setup({ delay: 0 });
    signIn('staff');
    await render(<ReportsScreen />);
    const star = target(section('movement'), 'Pin GRN activity to the top');
    expect(star).not.toBeSelected();
    expect(hostTree(star).find((node) => node.type === 'Icon')?.props.name).toBe('star-outline');

    await user.press(star);
    expect(actions()).toEqual([{ type: 'reportPrefs/toggleReportPin', payload: { scope: SCOPE, reportId: 'grn-activity', at: expect.any(Number) } }]);
    expect(mockPush).not.toHaveBeenCalled();

    await rerender();
    expect(sections()[0]).toEqual(['Pinned', ['GRN activity']]);
    const pinned = target(section('movement'), 'Unpin GRN activity');
    expect(pinned).toBeSelected();
    expect(hostTree(pinned).find((node) => node.type === 'Icon')?.props.name).toBe('star');
    expect(within(section('movement')).queryByRole('button', { name: 'Pin GRN activity to the top' })).not.toBeOnTheScreen();

    await user.press(target(section('pinned'), 'Unpin GRN activity'));
    await rerender();
    expect(sections().map(([title]) => title)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('the star is its own target beside the row, not inside it, each at least the touch size', async () => {
    signIn('staff');
    await render(<ReportsScreen />);
    const row = target(section('movement'), OPEN_GRN);
    const star = target(section('movement'), 'Pin GRN activity to the top');
    // Neither target holds the other, so each has its own touch area.
    expect(within(row).queryByRole('button', { name: 'Pin GRN activity to the top' })).not.toBeOnTheScreen();
    expect(within(star).queryByRole('button', { name: OPEN_GRN })).not.toBeOnTheScreen();
    expect(StyleSheet.flatten(star.props.style)).toEqual(expect.objectContaining({ width: touchTarget, minHeight: touchTarget }));
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(touchTarget);
    // 8 between the two targets.
    expect(screen.getByTestId('reports-hub-row-grn-activity')).toHaveStyle({ gap: space.sm });
  });

  it('with no facility chosen, shows the categories, opens reports and remembers nothing', async () => {
    const user = userEvent.setup({ delay: 0 });
    mockServer = null;
    signIn('staff', { pinned: ['grn-activity'], recent: ['stock-aging'] });
    await render(<ReportsScreen />);
    // No facility to name: no facility line.
    expect(screen.queryByLabelText(/^Facility/)).not.toBeOnTheScreen();
    expect(sections()).toEqual([STOCK, MOVEMENT, FINANCIAL, ['Operations', ['Customer activity']]]);
    await user.press(target(section('movement'), 'Pin GRN activity to the top'));
    await user.press(target(section('movement'), OPEN_GRN));
    expect(mockPush).toHaveBeenCalledWith('/reports/grn-activity');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('opens a report once for a double tap, and again for a tap after the first has gone through', async () => {
    const user = userEvent.setup({ delay: 0 });
    const now = jest.spyOn(Date, 'now');
    try {
      signIn('staff');
      await render(<ReportsScreen />);
      now.mockReturnValue(1_000_000);
      await user.press(target(section('movement'), OPEN_GRN));
      now.mockReturnValue(1_000_250);
      await user.press(target(section('movement'), OPEN_GRN));
      // A second row hit by the same double tap opens nothing either.
      await user.press(target(section('financial'), /^Invoice history\. /));
      expect(mockPush.mock.calls).toEqual([['/reports/grn-activity']]);
      // Back on the tab later: the next tap opens its report.
      now.mockReturnValue(1_000_700);
      await user.press(target(section('movement'), OPEN_GRN));
      expect(mockPush.mock.calls).toEqual([['/reports/grn-activity'], ['/reports/grn-activity']]);
    } finally {
      now.mockRestore();
    }
  });
});

describe('scrolling to a new section', () => {
  it('goes to the top once when Recent appears on a tab that is already drawn, not on a draw with the same sections', async () => {
    const user = userEvent.setup({ delay: 0 });
    signIn('staff');
    await render(<ReportsScreen />);
    expect(sections().map(([title]) => title)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    // Mounting is not a change.
    expect(mockScrollTo).not.toHaveBeenCalled();

    // A report is opened: Recent becomes the first section.
    await user.press(target(section('movement'), 'GRN activity. Recent goods received with invoice status'));
    await rerender();
    expect(sections()[0]).toEqual(['Recent', ['GRN activity']]);
    expect(mockScrollTo.mock.calls).toEqual([[{ y: 0 }]]);

    // Drawn again with the same sections (a re-focus, a theme change): no scroll.
    await rerender();
    await rerender();
    expect(mockScrollTo).toHaveBeenCalledTimes(1);

    // The first pin adds a Pinned section above Recent: a change, so one more scroll.
    await user.press(target(section('stock'), 'Pin Stock aging to the top'));
    await rerender();
    expect(sections()[0]).toEqual(['Pinned', ['Stock aging']]);
    expect(mockScrollTo).toHaveBeenCalledTimes(2);

    // A second pin changes neither the number of sections nor the first one: no scroll.
    await user.press(target(section('stock'), 'Pin Stock summary to the top'));
    await rerender();
    expect(sections()[0]).toEqual(['Pinned', ['Stock aging', 'Stock summary']]);
    expect(mockScrollTo).toHaveBeenCalledTimes(2);
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('draws the tab and its rows in the theme', async () => {
    const t = getTokens(brand, mode);
    signIn('admin', { pinned: ['grn-activity'] }, brand, mode);
    await render(<ReportsScreen />);
    const background = (node: Host) => StyleSheet.flatten(node.props.style)?.backgroundColor;
    expect(screen.root).toHaveStyle({ backgroundColor: t.background.base });
    const row = hostTree(screen.getByTestId('reports-hub-row-stock-summary'));
    expect(row.filter((node) => node.props.style !== undefined).map(background)).toEqual(expect.arrayContaining([t.surface.card, t.brand.subtle]));
    expect(row.filter((node) => node.type === 'Icon').map((icon) => [icon.props.name, icon.props.color])).toEqual([
      ['warehouse', t.brand.tint],
      ['star-outline', t.icon.primary],
    ]);
    const pinnedIcons = hostTree(screen.getAllByTestId('reports-hub-row-grn-activity')[0]).filter((node) => node.type === 'Icon');
    expect(pinnedIcons[1].props).toEqual(expect.objectContaining({ name: 'star', color: t.brand.tint }));
  });
});
