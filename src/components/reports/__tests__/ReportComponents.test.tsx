import React from 'react';
import { render as renderScreen, screen, userEvent, within } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { Dimensions, StyleSheet } from 'react-native';
import { setLanguage } from '@/i18n';
import { BRANDS, fontWeight, getTokens, space, type Brand, type Mode } from '@/theme/tokens';
import { KPIGrid } from '../KPIGrid';
import { KPICard } from '../KPICard';
import { ReportHeader } from '../ReportHeader';
import { ReportStatusLine } from '../ReportStatusLine';
import { ReportEmptyState } from '../ReportEmptyState';
import { ReportCustomerCard } from '../ReportCustomerCard';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }), router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

async function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  await renderScreen(element);
}

/** Every drawn element (view, text, icon) of what is on screen. */
const hosts = () => screen.container.queryAll(() => true);
const ofType = (type: string) => screen.container.queryAll(node => node.type === type);

function flat(node: TestInstance) {
  const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
  return (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
}

const hasStyle = (key: string, value: unknown) => hosts().some(node => flat(node)[key] === value);

const texts = (): string[] => ofType('Text').map(node => [].concat(node.props.children).join(''));

describe.each(THEMES)('report components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('KPI tiles are cards with token colours and labels', async () => {
    await render(brand, mode, (
      <KPIGrid
        title="Summary"
        items={[
          { icon: 'warehouse', value: 1200, label: 'Stock', variant: 'primary' },
          { icon: 'alert', value: 3, label: 'Over 1 year', variant: 'warning' },
          { icon: 'check', value: 9, label: 'Done', variant: 'success' },
          { icon: 'minus', value: 1, label: 'Other', variant: 'neutral' },
        ]}
      />
    ));
    expect(hasStyle('backgroundColor', t.surface.card)).toBe(true);
    expect(hasStyle('backgroundColor', t.brand.subtle)).toBe(true);
    expect(hasStyle('backgroundColor', t.status.critical.background)).toBe(true);
    expect(hasStyle('backgroundColor', t.status.positive.background)).toBe(true);
    expect(hasStyle('backgroundColor', t.status.neutral.background)).toBe(true);
    expect(texts()).toEqual(expect.arrayContaining(['Summary', '1,200', 'Stock', 'Over 1 year']));
    expect(screen.getByText('1,200')).toBeOnTheScreen();
    expect(screen.getByText('Over 1 year')).toBeOnTheScreen();
  });

  it('colours a trend only when the KPI says whether up is good', async () => {
    const icons = () => ofType('Icon').map(node => [node.props.name, node.props.color]);

    await render(brand, mode, <KPICard icon="cash" value="₹10" label="Paid" trend={1} trendValue="5%" upIsGood />);
    expect(icons()).toContainEqual(['arrow-up', t.status.positive.text]);
    await screen.unmount();

    await render(brand, mode, <KPICard icon="cash" value="₹10" label="Overdue" trend={1} trendValue="5%" upIsGood={false} />);
    expect(icons()).toContainEqual(['arrow-up', t.status.negative.text]);
    await screen.unmount();

    await render(brand, mode, <KPICard icon="cash" value="₹10" label="Orders" trend={-1} trendValue="5%" />);
    expect(icons()).toContainEqual(['arrow-down', t.text.secondary]);
  });

  it('header uses header surface, brand tint actions and labelled buttons', async () => {
    const user = userEvent.setup();
    const onShare = jest.fn();
    await render(brand, mode, (
      <ReportHeader title="Stock summary" subtitle="All customers" actions={[{ icon: 'file-pdf-box', label: 'Share stock PDF', onPress: onShare }]} />
    ));
    expect(hasStyle('backgroundColor', t.surface.header)).toBe(true);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0]).toHaveAccessibleName('Back');
    expect(buttons[1]).toHaveAccessibleName('Share stock PDF');
    expect(ofType('Icon').every(node => node.props.color === t.brand.tint)).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Share stock PDF' }));
    expect(onShare).toHaveBeenCalled();
  });

  it('empty and error states use the hero icon colours and offer the action', async () => {
    const onRetry = jest.fn();
    await render(brand, mode, <ReportEmptyState message="No stock yet" description="Stock appears here." />);
    expect(ofType('Icon')[0].props.color).toBe(t.icon.secondary);
    await screen.unmount();

    await render(brand, mode, (
      <ReportEmptyState tone="error" message="Something went wrong" description="Try later." actionLabel="Try again" onAction={onRetry} />
    ));
    expect(ofType('Icon')[0].props.color).toBe(t.status.negative.text);
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('customer cell uses token colours and highlights the search words', async () => {
    await render(brand, mode, (
      <ReportCustomerCard title="Patel Traders" subtitle="3 items" value={1200} onPress={jest.fn()} onShare={jest.fn()} />
    ));
    expect(hasStyle('backgroundColor', t.surface.card)).toBe(true);
    expect(screen.getByText('1,200')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share PDF for Patel Traders' })).toBeOnTheScreen();
    // Without search words the name is plain text, as on every screen that does not pass them.
    expect(ofType('Text').filter(node => flat(node).fontWeight === fontWeight.bold).length).toBe(0);
    await screen.unmount();

    await render(brand, mode, (
      <ReportCustomerCard title="Green Valley Traders" highlightWords={['valley']} subtitle="2 GRNs" value={300} onPress={jest.fn()} />
    ));
    const boldText = ofType('Text').filter(node => flat(node).fontWeight === fontWeight.bold);
    expect(boldText.map(node => node.props.children)).toEqual(['Valley']);
    // The row still reads the whole name.
    expect(screen.getByRole('button', { name: 'Green Valley Traders, 2 GRNs, 300 units' })).toBeOnTheScreen();
  });
});

describe('report status line', () => {
  // Noon on 12/10/26, local time.
  const NOW = new Date(2026, 9, 12, 12, 0);
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => {
    jest.useRealTimers();
    setLanguage('en');
  });

  const line = async (props: React.ComponentProps<typeof ReportStatusLine>) => {
    await render('orange', 'light', <ReportStatusLine {...props} />);
    const shown = texts();
    const lineLimits = ofType('Text').map(node => node.props.numberOfLines);
    const liveRegion = ofType('View')[0].props.accessibilityLiveRegion;
    await screen.unmount();
    return { shown, liveRegion, lineLimits };
  };

  it('gives the time alone for figures read today', async () => {
    expect((await line({ updatedAt: new Date(2026, 9, 12, 10, 42).getTime() })).shown).toEqual(['Last updated 10:42 am']);
  });

  it('names the day for figures kept on the phone from an earlier day', async () => {
    expect((await line({ updatedAt: new Date(2026, 9, 11, 16, 5).getTime() })).shown).toEqual(['Last updated 11/10/26, 4:05 pm']);
    expect((await line({ updatedAt: new Date(2026, 9, 9, 9, 30).getTime() })).shown).toEqual(['Last updated 09/10/26, 9:30 am']);
  });

  it('writes the day and time in Gujarati digits, each fact on its own uncut line', async () => {
    setLanguage('gu');
    expect((await line({ updatedAt: new Date(2026, 9, 12, 10, 42).getTime() })).shown).toEqual(['છેલ્લે અપડેટ થયું: ૧૦:૪૨ AM']);
    const yesterday = await line({ updatedAt: new Date(2026, 9, 11, 16, 5).getTime(), shown: 3, total: 40 });
    expect(yesterday.shown).toEqual(['૪૦માંથી ૩ દેખાય છે', 'છેલ્લે અપડેટ થયું: ૧૧/૧૦/૨૬, ૪:૦૫ PM']);
    expect(yesterday.lineLimits).toEqual([undefined, undefined]);
  });

  it('never cuts the line, and announces a new count politely', async () => {
    const { shown, liveRegion, lineLimits } = await line({ range: { from: '2026-06-15', to: '2026-10-12' }, shown: 3, total: 40, updatedAt: new Date(2026, 9, 11, 16, 5).getTime() });
    expect(shown).toEqual(['15/06/26 – 12/10/26 · Showing 3 of 40 · Last updated 11/10/26, 4:05 pm']);
    expect(lineLimits).toEqual([undefined]);
    expect(liveRegion).toBe('polite');
  });
});

describe('figure tiles and text size', () => {
  const before = Dimensions.get('window');
  afterEach(() => Dimensions.set({ window: before }));

  /** How many tiles sit in each row of the grid (a row is the view that lays its tiles out side by side). */
  const rowSizes = async (fontScale: number, count: number) => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
    const items = Array.from({ length: count }, (_, i) => ({ icon: 'warehouse' as const, value: 1200 + i, label: `Figure ${i + 1}` }));
    await render('orange', 'light', <KPIGrid items={items} compact />);
    const rows = screen.container.queryAll(node => node.type === 'View' && flat(node).flexDirection === 'row' && flat(node).gap === space.sm);
    const sizes = rows.map(row => within(row).queryAllByText(/^Figure \d+$/).length);
    await screen.unmount();
    return sizes;
  };

  it('puts three compact tiles across at ordinary text sizes', async () => {
    expect(await rowSizes(1, 3)).toEqual([3]);
    expect(await rowSizes(1.2, 6)).toEqual([3, 3]);
  });

  it('puts two across above 1.2 times the text size, so values are not cut', async () => {
    expect(await rowSizes(1.3, 3)).toEqual([2, 1]);
    expect(await rowSizes(2, 6)).toEqual([2, 2, 2]);
  });
});
