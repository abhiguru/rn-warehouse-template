/**
 * The Reports tab: its sections (pinned, recent, then the categories), the role gate on
 * every report it lists, what pressing a row and its star does, and the four themes.
 * The store is a plain object; actions go through the real report-prefs reducer.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import ReportsScreen from '../../../../app/(tabs)/reports';
import { ReportHubRow } from '../ReportHubRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { setLanguage } from '@/i18n';
import reportPrefs, { type ReportPrefsState } from '@/store/slices/reportPrefsSlice';
import { BRANDS, getTokens, space, touchTarget, type Brand, type Mode } from '@/theme/tokens';

type Action = { type: string; payload: Record<string, unknown> };
let mockState: { theme: { preference: Mode; brand: Brand }; auth: unknown; reportPrefs: ReportPrefsState };
const mockPush = jest.fn();
const mockDispatch = jest.fn((action: Action) => {
  mockState = { ...mockState, reportPrefs: reportPrefs(mockState.reportPrefs, action) };
});
let mockServer: { origin: string; instanceId: string } | null = null;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const SCOPE = JSON.stringify([SERVER.origin, SERVER.instanceId, 'user-a']);

function signIn(role: string, prefs: { pinned?: string[]; recent?: string[] } = {}, brand: Brand = 'orange', mode: Mode = 'light') {
  mockState = {
    theme: { preference: mode, brand },
    auth: { userProfile: { id: 'user-a', name: 'Asha Fictional', role, assignedCustomerIds: [] } },
    reportPrefs: { byScope: { [SCOPE]: { sort: {}, pinned: prefs.pinned ?? [], recent: prefs.recent ?? [], lastCustomer: {}, usedAt: 1 } } },
  };
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  setLanguage('en');
});
beforeEach(() => {
  mockServer = SERVER;
  mockPush.mockClear();
  mockDispatch.mockClear();
});

function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ReportsScreen />);
  });
  mounted.push(tree);
  return tree;
}
/** Draw the tab again from the store as it is now. */
function rerender(tree: TestRenderer.ReactTestRenderer) {
  act(() => tree.update(<ReportsScreen />));
}

/** Each section's title and the titles of its rows, in screen order. */
function sections(tree: TestRenderer.ReactTestRenderer): [string, string[]][] {
  return tree.root
    .findAll((node) => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('reports-hub-section-'))
    .map((section) => [
      section.findByType(SectionHeader).props.title as string,
      section.findAllByType(ReportHubRow).map((row) => row.props.report.title as string),
    ]);
}
function section(tree: TestRenderer.ReactTestRenderer, id: string): ReactTestInstance {
  return tree.root.find((node) => typeof node.type === 'string' && node.props.testID === `reports-hub-section-${id}`);
}
/** The outermost pressable with this label, inside `within`. */
function target(within: ReactTestInstance, label: string): ReactTestInstance {
  return within.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
}
const press = (node: ReactTestInstance) => act(() => node.props.onPress());
const actions = () => mockDispatch.mock.calls.map(([action]) => action);

const STOCK = ['Stock', ['Stock summary', 'Item stock summary', 'Stock aging']] as [string, string[]];
const MOVEMENT = ['Movement', ['Dispatch activity', 'GRN activity']] as [string, string[]];
const FINANCIAL = ['Financial', ['Invoice history']] as [string, string[]];

describe('sections', () => {
  it('a staff account with nothing pinned or opened sees the plain category list', () => {
    signIn('staff');
    const tree = render();
    expect(sections(tree)).toEqual([STOCK, MOVEMENT, FINANCIAL, ['Operations', ['Customer activity']]]);
    // The headers are the shared SectionHeader: capitals on screen, the title for screen readers.
    const headers = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.props.accessible);
    expect(headers.map((node) => node.props.accessibilityLabel)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    // The tab header stays: large title, subtitle and the profile button.
    const text = tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [].concat(node.props.children).join(''));
    expect(text).toEqual(expect.arrayContaining(['Reports', 'View operations and customer reports', 'STOCK', 'MOVEMENT']));
    expect(target(tree.root, 'Profile and settings')).toBeDefined();
  });

  it('shows the pinned reports first, in the order they were pinned, and keeps each in its category', () => {
    signIn('staff', { pinned: ['invoice-history', 'stock-summary', 'grn-activity'] });
    const tree = render();
    expect(sections(tree)).toEqual([
      ['Pinned', ['Invoice history', 'Stock summary', 'GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity']],
    ]);
    // The star is filled for a pinned report wherever it is listed.
    for (const id of ['pinned', 'financial']) {
      const star = target(section(tree, id), 'Unpin Invoice history');
      expect(star.props.accessibilityState).toEqual({ selected: true });
    }
  });

  it('shows up to three reports opened last, most recent first, none of them pinned', () => {
    signIn('staff', { pinned: ['grn-activity'], recent: ['grn-activity', 'stock-aging', 'invoice-history', 'stock-summary', 'dispatch-activity'] });
    const tree = render();
    expect(sections(tree).slice(0, 2)).toEqual([
      ['Pinned', ['GRN activity']],
      ['Recent', ['Stock aging', 'Invoice history', 'Stock summary']],
    ]);
  });

  it('skips a stored report the registry does not know or this role may not open, and fills up to three from the rest', () => {
    signIn('staff', { pinned: ['old-report'], recent: ['old-report', 'operations-dashboard', 'stock-aging', 'invoice-history', 'stock-summary'] });
    const tree = render();
    expect(sections(tree).slice(0, 2)).toEqual([
      ['Recent', ['Stock aging', 'Invoice history', 'Stock summary']],
      STOCK,
    ]);
  });

  it('a customer account sees customer activity under Operations, and never the dashboard it once pinned or opened', () => {
    signIn('customer', { pinned: ['operations-dashboard', 'stock-summary'], recent: ['operations-dashboard', 'grn-activity'] });
    const tree = render();
    expect(sections(tree)).toEqual([
      ['Pinned', ['Stock summary']],
      ['Recent', ['GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity']],
    ]);
  });

  it('staff are not offered the dashboard either: its gate is for administrators and supervisors', () => {
    signIn('staff', { pinned: ['operations-dashboard'], recent: ['operations-dashboard'] });
    const tree = render();
    expect(sections(tree).map(([title]) => title)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    expect(sections(tree)[3]).toEqual(['Operations', ['Customer activity']]);
  });

  it.each(['admin', 'supervisor'])('%s sees the dashboard, also pinned', (role) => {
    signIn(role, { pinned: ['operations-dashboard', 'stock-summary'], recent: ['operations-dashboard', 'grn-activity'] });
    const tree = render();
    expect(sections(tree)).toEqual([
      ['Pinned', ['Operations dashboard', 'Stock summary']],
      ['Recent', ['GRN activity']],
      STOCK,
      MOVEMENT,
      FINANCIAL,
      ['Operations', ['Customer activity', 'Operations dashboard']],
    ]);
  });

  it('follows the language', () => {
    setLanguage('gu');
    signIn('staff', { pinned: ['grn-activity'] });
    const tree = render();
    expect(sections(tree).map(([title]) => title)).toEqual(['પિન કરેલા', 'સ્ટોક', 'આવક-જાવક', 'નાણાકીય', 'કામગીરી']);
    expect(target(section(tree, 'movement'), 'આવકની કામગીરી અનપિન કરો')).toBeDefined();
    expect(target(section(tree, 'stock'), 'સ્ટોકનો સારાંશ ઉપર પિન કરો')).toBeDefined();
  });
});

describe('pressing', () => {
  const OPEN_GRN = 'GRN activity. Recent goods received with invoice status';

  it('a row opens its report and notes it as opened, for this facility and account', () => {
    signIn('staff');
    const tree = render();
    press(target(section(tree, 'movement'), OPEN_GRN));
    expect(mockPush).toHaveBeenCalledWith('/reports/grn-activity');
    expect(actions()).toEqual([
      { type: 'reportPrefs/noteReportOpened', payload: { scope: SCOPE, reportId: 'grn-activity', at: expect.any(Number) } },
    ]);
    // Next time the tab is drawn, the report is under Recent.
    rerender(tree);
    expect(sections(tree)[0]).toEqual(['Recent', ['GRN activity']]);
  });

  it('the star pins and unpins without opening the report, and says which it will do', () => {
    signIn('staff');
    const tree = render();
    const movement = () => section(tree, 'movement');
    const star = target(movement(), 'Pin GRN activity to the top');
    expect(star.props.accessibilityRole).toBe('button');
    expect(star.props.accessibilityState).toEqual({ selected: false });
    expect(star.findByType('Icon' as never).props.name).toBe('star-outline');

    press(star);
    expect(actions()).toEqual([{ type: 'reportPrefs/toggleReportPin', payload: { scope: SCOPE, reportId: 'grn-activity', at: expect.any(Number) } }]);
    expect(mockPush).not.toHaveBeenCalled();

    rerender(tree);
    expect(sections(tree)[0]).toEqual(['Pinned', ['GRN activity']]);
    const pinned = target(movement(), 'Unpin GRN activity');
    expect(pinned.props.accessibilityState).toEqual({ selected: true });
    expect(pinned.findByType('Icon' as never).props.name).toBe('star');
    expect(target(movement(), 'Pin GRN activity to the top')).toBeUndefined();

    press(target(section(tree, 'pinned'), 'Unpin GRN activity'));
    rerender(tree);
    expect(sections(tree).map(([title]) => title)).toEqual(['Stock', 'Movement', 'Financial', 'Operations']);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('the star is its own target beside the row, not inside it, each at least the touch size', () => {
    signIn('staff');
    const tree = render();
    const row = target(section(tree, 'movement'), OPEN_GRN);
    const star = target(section(tree, 'movement'), 'Pin GRN activity to the top');
    let ancestor: ReactTestInstance | null = star.parent;
    while (ancestor) {
      expect(ancestor).not.toBe(row);
      ancestor = ancestor.parent;
    }
    expect(row.findAll((node) => node === star)).toEqual([]);
    expect(StyleSheet.flatten(star.props.style)).toEqual(expect.objectContaining({ width: touchTarget, minHeight: touchTarget }));
    expect(StyleSheet.flatten(row.props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(touchTarget);
    // 8 between the two targets.
    const card = tree.root.findAllByType(ReportHubRow)[0].findAll((node) => typeof node.type === 'string')[0];
    expect(StyleSheet.flatten(card.props.style).gap).toBe(space.sm);
  });

  it('with no facility chosen, shows the categories, opens reports and remembers nothing', () => {
    mockServer = null;
    signIn('staff', { pinned: ['grn-activity'], recent: ['stock-aging'] });
    const tree = render();
    expect(sections(tree)).toEqual([STOCK, MOVEMENT, FINANCIAL, ['Operations', ['Customer activity']]]);
    press(target(section(tree, 'movement'), 'Pin GRN activity to the top'));
    press(target(section(tree, 'movement'), OPEN_GRN));
    expect(mockPush).toHaveBeenCalledWith('/reports/grn-activity');
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('draws the tab and its rows in the theme', () => {
    const t = getTokens(brand, mode);
    signIn('admin', { pinned: ['grn-activity'] }, brand, mode);
    const tree = render();
    const background = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style)?.backgroundColor;
    expect(background(tree.root.findAllByType('View' as never)[0])).toBe(t.background.base);
    const row = tree.root.findAllByType(ReportHubRow).find((node) => node.props.report.id === 'stock-summary')!;
    const hostViews = row.findAll((node) => typeof node.type === 'string' && node.props.style !== undefined);
    expect(hostViews.map(background)).toEqual(expect.arrayContaining([t.surface.card, t.brand.subtle]));
    expect(row.findAllByType('Icon' as never).map((icon) => [icon.props.name, icon.props.color])).toEqual([
      ['warehouse', t.brand.tint],
      ['star-outline', t.icon.primary],
    ]);
    const pinnedRow = tree.root.findAllByType(ReportHubRow).find((node) => node.props.report.id === 'grn-activity')!;
    expect(pinnedRow.findAllByType('Icon' as never)[1].props).toEqual(expect.objectContaining({ name: 'star', color: t.brand.tint }));
  });
});
