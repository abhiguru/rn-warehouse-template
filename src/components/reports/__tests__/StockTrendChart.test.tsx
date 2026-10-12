/**
 * The stock trend card opens its chart full screen: sliding in normally, and
 * fading in when the phone asks for reduced motion (docs/STYLE_GUIDE.md §9).
 * Its figures: the highest point, and the month in progress drawn at the stock
 * now (the Stock tile's figure) instead of the server's second reckoning of it.
 */
import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { MonthlyTrendPoint } from '@/types/report.types';
import { StockTrendChart, trendStockLevels } from '../StockTrendChart';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

const point = (month: string, stock: number): MonthlyTrendPoint => ({
  month,
  grn_count: 0,
  grn_quantity: 0,
  dispatch_count: 0,
  dispatch_quantity: 0,
  invoice_amount: 0,
  stock_level_end: stock,
});
const TRENDS = [point('2026-08', 120), point('2026-09', 180), point('2026-10', 150)];

function openFullScreen() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<StockTrendChart trends={TRENDS} />);
  });
  const modal = () => tree.root.findByType(Modal);
  expect(modal().props.visible).toBe(false);
  const card = tree.root.find(
    node => typeof node.type !== 'string' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Stock level trend. ') && typeof node.props.onPress === 'function'
  );
  act(() => card.props.onPress());
  const opened = modal().props;
  act(() => tree.unmount());
  return opened;
}

afterEach(() => {
  mockReduceMotion = false;
});

describe('stock trend, full screen', () => {
  it('slides in when motion is not reduced', () => {
    mockReduceMotion = false;
    const modal = openFullScreen();
    expect(modal.visible).toBe(true);
    expect(modal.animationType).toBe('slide');
  });

  it('fades in when Reduce Motion is on', () => {
    mockReduceMotion = true;
    const modal = openFullScreen();
    expect(modal.visible).toBe(true);
    expect(modal.animationType).toBe('fade');
  });
});

describe('stock trend, figures', () => {
  function render(trends: MonthlyTrendPoint[]) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<StockTrendChart trends={trends} />);
    });
    const texts = tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
    const chart = { props: { ...tree.root.findAll(node => (node.type as unknown) === 'LineChart')[0].props } };
    // The latest and highest figures are on the full screen.
    const card = tree.root.find(node => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Stock level trend. '));
    act(() => card.props.onPress());
    const labels = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
    act(() => tree.unmount());
    return { texts, labels, chart };
  }

  it('says "Highest 0" when every month was 0, and keeps the axis its own scale', () => {
    const { texts, labels, chart } = render([point('2026-08', 0), point('2026-09', 0), point('2026-10', 0)]);
    expect(texts).toContain('Stock went from 0 in Aug 2026 to 0 in Oct 2026. Highest 0.');
    expect(labels).toContain('Highest 0');
    expect(labels).not.toContain('Highest 1');
    // The axis still has a scale to draw a flat line on.
    expect(chart.props.maxValue).toBe(100);
  });

  it('gives the highest month as it was, and names the axis in bags', () => {
    const { texts, labels, chart } = render(TRENDS);
    expect(texts).toContain('bags');
    expect(texts).not.toContain('units');
    expect(labels).toContain('Highest 180');
    expect(chart.props.maxValue).toBe(200);
  });
});

describe('stock trend, the month in progress', () => {
  // Only the calendar is set; timers run as usual.
  const NOT_THE_CALENDAR = ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const;
  const onThe = (now: Date) => jest.useFakeTimers({ now, doNotFake: [...NOT_THE_CALENDAR] });
  afterEach(() => jest.useRealTimers());

  /** The card, then the full screen as a table: every figure the trend shows or says. */
  function draw(trends: MonthlyTrendPoint[], currentStock?: number) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<StockTrendChart trends={trends} currentStock={currentStock} />);
    });
    const texts = tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
    const chart = tree.root.findAll(node => (node.type as unknown) === 'LineChart')[0].props;
    const line = (chart.data as { value: number }[]).map(dot => dot.value);
    const maxValue = chart.maxValue as number;
    const card = tree.root.find(node => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Stock level trend. '));
    const cardLabel = card.props.accessibilityLabel as string;
    act(() => card.props.onPress());
    const asTable = tree.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Table of values' && typeof node.props.onPress === 'function')[0];
    act(() => asTable.props.onPress());
    const labels = tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
    act(() => tree.unmount());
    return { texts, labels, line, maxValue, cardLabel };
  }

  // As a phone showed it on 12 Oct 2026: the Stock tile said 4,460, the server's figure for October
  // was 4,360, and the highest month end was 4,444, so "Highest" stood below the tile.
  const TO_OCTOBER = [point('2026-08', 949), point('2026-09', 4444), point('2026-10', 4360)];
  const STOCK_NOW = 4460;

  it('draws the month in progress at the stock now: the line, the summary, Latest, Highest and the table all end at the tile\'s figure', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line, maxValue, cardLabel } = draw(TO_OCTOBER, STOCK_NOW);
    expect(line).toEqual([949, 4444, 4460]);
    expect(maxValue).toBe(4500);
    expect(texts).toContain('Stock went from 949 in Aug 2026 to 4,460 in Oct 2026. Highest 4,460.');
    expect(cardLabel).toBe('Stock level trend. Stock went from 949 in Aug 2026 to 4,460 in Oct 2026. Highest 4,460.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,460', 'Highest 4,460', 'Aug 2026, 949', 'Sep 2026, 4,444', 'Oct 2026, 4,460']));
    // The server's other figure for the stock now is nowhere: not on the card, not in the table.
    expect([...texts, ...labels].filter(words => words.includes('4,360'))).toEqual([]);
    expect(labels).not.toContain('Highest 4,444');
  });

  it('keeps the months that are over as the server sent them: a stock now below them leaves Highest a month end', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw(TO_OCTOBER, 4300);
    expect(line).toEqual([949, 4444, 4300]);
    expect(texts).toContain('Stock went from 949 in Aug 2026 to 4,300 in Oct 2026. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,300', 'Highest 4,444', 'Sep 2026, 4,444', 'Oct 2026, 4,300']));
  });

  it('changes nothing in a period that ended before this month: its last month has a month end', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw([point('2026-07', 949), point('2026-08', 4444), point('2026-09', 4360)], STOCK_NOW);
    expect(line).toEqual([949, 4444, 4360]);
    expect(texts).toContain('Stock went from 949 in Jul 2026 to 4,360 in Sep 2026. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,360', 'Highest 4,444', 'Sep 2026, 4,360']));
  });

  it('changes nothing when the screen gives no stock now', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw(TO_OCTOBER);
    expect(line).toEqual([949, 4444, 4360]);
    expect(texts).toContain('Stock went from 949 in Aug 2026 to 4,360 in Oct 2026. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,360', 'Highest 4,444', 'Oct 2026, 4,360']));
  });

  it('a period inside this month has one point, the stock now', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw([point('2026-10', 4360)], STOCK_NOW);
    expect(line).toEqual([4460]);
    expect(texts).toContain('Stock at the end of Oct 2026: 4,460.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,460', 'Highest 4,460', 'Oct 2026, 4,460']));
  });

  it('takes the month from the calendar in India, whatever the zone of the phone', () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India: September is over, October is in progress.
    onThe(new Date('2026-09-30T20:00:00Z'));
    expect(draw(TO_OCTOBER, STOCK_NOW).line).toEqual([949, 4444, 4460]);
    jest.useRealTimers();
    // 18:00 UTC on 30 Sep is 23:30 that day in India: September is still in progress, and a period
    // that runs past today has no month end after it either.
    onThe(new Date('2026-09-30T18:00:00Z'));
    expect(draw(TO_OCTOBER, STOCK_NOW).line).toEqual([949, 4460, 4460]);
  });

  it('trendStockLevels: a stock of 0 is a figure, no figure leaves the server\'s, and a month it cannot read is left alone', () => {
    expect(trendStockLevels(TO_OCTOBER, STOCK_NOW, '2026-10')).toEqual([949, 4444, 4460]);
    expect(trendStockLevels(TO_OCTOBER, STOCK_NOW, '2026-11')).toEqual([949, 4444, 4360]);
    expect(trendStockLevels(TO_OCTOBER, 0, '2026-10')).toEqual([949, 4444, 0]);
    expect(trendStockLevels(TO_OCTOBER, undefined, '2026-10')).toEqual([949, 4444, 4360]);
    expect(trendStockLevels(TO_OCTOBER, Number.NaN, '2026-10')).toEqual([949, 4444, 4360]);
    // Not a month the calendar can place: the server's figure, and 0 for one it did not send.
    expect(trendStockLevels([point('undated', 70), { ...point('2026-09', 0), stock_level_end: undefined as never }], STOCK_NOW, '2026-10')).toEqual([70, 0]);
    // A year boundary: December of last year is over in January.
    expect(trendStockLevels([point('2026-12', 10), point('2027-01', 20)], 30, '2027-01')).toEqual([10, 30]);
  });
});
