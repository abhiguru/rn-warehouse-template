/**
 * The stock trend card opens its chart full screen: sliding in normally, and
 * fading in when the phone asks for reduced motion (docs/STYLE_GUIDE.md §9).
 * Its figures: the highest point, the axis with room above it, and the month in
 * progress drawn at the stock now (the Stock tile's figure) instead of the
 * server's second reckoning of it, and named "as of" today, never a month end.
 * Months after this one are not drawn at all (SR-11).
 */
import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { MonthlyTrendPoint } from '@/types/report.types';
import { StockTrendChart, chartAxis, trendStockLevels, visibleTrend } from '../StockTrendChart';

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

// Only the calendar is set; timers run as usual.
const NOT_THE_CALENDAR = ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const;
const onThe = (now: Date) => jest.useFakeTimers({ now, doNotFake: [...NOT_THE_CALENDAR] });

describe('stock trend, figures', () => {
  // Every month of these periods is over: 15 November 2026.
  beforeEach(() => onThe(new Date(2026, 10, 15, 10, 0)));
  afterEach(() => jest.useRealTimers());

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
    // The axis still has a scale to draw a flat line on: its smallest step, 100, three times.
    expect(chart.props.maxValue).toBe(300);
    expect(chart.props.stepValue).toBe(100);
    expect(chart.props.noOfSections).toBe(3);
  });

  it('gives the highest month as it was, and names the axis in bags', () => {
    const { texts, labels, chart } = render(TRENDS);
    expect(texts).toContain('bags');
    expect(texts).not.toContain('units');
    expect(labels).toContain('Highest 180');
    // At least a fifth above the highest point (216), so its label is not cut at the top.
    expect(chart.props.maxValue).toBe(300);
  });

  it('gives the full-screen chart its own axis of five steps, and both charts room for the larger axis number', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<StockTrendChart trends={[point('2026-08', 949), point('2026-09', 4460)]} />);
    });
    const card = tree.root.find(node => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith('Stock level trend. '));
    act(() => card.props.onPress());
    const [compact, full] = tree.root.findAll(node => (node.type as unknown) === 'LineChart').map(node => node.props);
    expect([compact.maxValue, compact.stepValue, compact.noOfSections]).toEqual([6000, 2000, 3]);
    expect([full.maxValue, full.stepValue, full.noOfSections]).toEqual([10000, 2000, 5]);
    // "10,000" is the longer axis number: both charts are as wide for it.
    expect(compact.yAxisLabelWidth).toBe(full.yAxisLabelWidth);
    expect(compact.yAxisLabelWidth).toBeGreaterThanOrEqual('10,000'.length * 8);
    act(() => tree.unmount());
  });
});

describe('chartAxis', () => {
  it('rounds the step up to 1, 2, 2.5 or 5 of a power of ten, at least 100, with a fifth of room above the highest point', () => {
    expect(chartAxis(0, 3)).toEqual({ maxValue: 300, stepValue: 100 });
    expect(chartAxis(180, 3)).toEqual({ maxValue: 300, stepValue: 100 });
    expect(chartAxis(4460, 3)).toEqual({ maxValue: 6000, stepValue: 2000 });
    // 1,440 over five steps is 288 a step: 500.
    expect(chartAxis(1200, 5)).toEqual({ maxValue: 2500, stepValue: 500 });
    // 7,200 over three steps is 2,400 a step: 2,500.
    expect(chartAxis(6000, 3)).toEqual({ maxValue: 7500, stepValue: 2500 });
  });

  it('always leaves at least a fifth above the highest point, in whole nice steps', () => {
    const nice = (step: number) => {
      const scale = 10 ** Math.floor(Math.log10(step));
      return [1, 2, 2.5, 5].some(mantissa => Math.abs(step / scale - mantissa) < 1e-9);
    };
    for (const sections of [3, 5]) {
      for (let highest = 0; highest <= 250_000; highest = Math.floor(highest * 1.37) + 7) {
        const { maxValue, stepValue } = chartAxis(highest, sections);
        expect({ highest, sections, roomy: maxValue >= highest * 1.2 }).toEqual({ highest, sections, roomy: true });
        expect(maxValue).toBe(stepValue * sections);
        expect(stepValue).toBeGreaterThanOrEqual(100);
        expect({ stepValue, nice: nice(stepValue) }).toEqual({ stepValue, nice: true });
      }
    }
  });
});

describe('stock trend, the month in progress', () => {
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
    // The table and the figures under it, as they are written.
    const tableTexts = tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
    act(() => tree.unmount());
    return { texts, labels, line, maxValue, cardLabel, tableTexts };
  }

  // As a phone showed it on 12 Oct 2026: the Stock tile said 4,460, the server's figure for October
  // was 4,360, and the highest month end was 4,444, so "Highest" stood below the tile.
  const TO_OCTOBER = [point('2026-08', 949), point('2026-09', 4444), point('2026-10', 4360)];
  const STOCK_NOW = 4460;

  it('draws the month in progress at the stock now: the line, the summary, Latest, Highest and the table all end at the tile\'s figure', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line, maxValue, cardLabel, tableTexts } = draw(TO_OCTOBER, STOCK_NOW);
    expect(line).toEqual([949, 4444, 4460]);
    expect(maxValue).toBe(6000);
    // September is over and has a month end; October has none yet: its figure is the stock as of today.
    const summary = 'Stock went from 949 in Aug 2026 to 4,444 at the end of Sep 2026, and 4,460 as of 12 Oct. Highest 4,460.';
    expect(texts).toContain(summary);
    expect(cardLabel).toBe(`Stock level trend. ${summary}`);
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,460', 'Highest 4,460', 'Aug 2026, 949', 'Sep 2026, 4,444', 'Oct 2026, as of 12 Oct, 4,460']));
    // The column says "Stock at month end": October's row says it is not one, and the note under the table too.
    expect(tableTexts).toEqual(expect.arrayContaining(['Stock at month end', 'as of 12 Oct', 'Oct 2026: as of 12 Oct']));
    expect(labels).not.toContain('Oct 2026, 4,460');
    // The server's other figure for the stock now is nowhere: not on the card, not in the table.
    expect([...texts, ...labels].filter(words => words.includes('4,360'))).toEqual([]);
    expect(labels).not.toContain('Highest 4,444');
  });

  it('keeps the months that are over as the server sent them: a stock now below them leaves Highest a month end', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw(TO_OCTOBER, 4300);
    expect(line).toEqual([949, 4444, 4300]);
    expect(texts).toContain('Stock went from 949 in Aug 2026 to 4,444 at the end of Sep 2026, and 4,300 as of 12 Oct. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,300', 'Highest 4,444', 'Sep 2026, 4,444', 'Oct 2026, as of 12 Oct, 4,300']));
  });

  it('changes nothing in a period that ended before this month: its last month has a month end', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line, tableTexts } = draw([point('2026-07', 949), point('2026-08', 4444), point('2026-09', 4360)], STOCK_NOW);
    expect(line).toEqual([949, 4444, 4360]);
    expect(texts).toContain('Stock went from 949 in Jul 2026 to 4,360 in Sep 2026. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,360', 'Highest 4,444', 'Sep 2026, 4,360']));
    // Every month has a month end: nothing says "as of".
    expect([...texts, ...labels, ...tableTexts].filter(words => words.includes('as of'))).toEqual([]);
  });

  it('keeps the server\'s figure when the screen gives no stock now, still named as of today', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line } = draw(TO_OCTOBER);
    expect(line).toEqual([949, 4444, 4360]);
    expect(texts).toContain('Stock went from 949 in Aug 2026 to 4,444 at the end of Sep 2026, and 4,360 as of 12 Oct. Highest 4,444.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,360', 'Highest 4,444', 'Oct 2026, as of 12 Oct, 4,360']));
  });

  it('a period inside this month has one point, the stock now', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const { texts, labels, line, cardLabel } = draw([point('2026-10', 4360)], STOCK_NOW);
    expect(line).toEqual([4460]);
    // Not "Stock at the end of Oct 2026": October has not ended.
    expect(texts).toContain('Stock as of 12 Oct: 4,460.');
    expect(texts).not.toContain('Stock at the end of Oct 2026: 4,460.');
    expect(cardLabel).toBe('Stock level trend. Stock as of 12 Oct: 4,460.');
    expect(labels).toEqual(expect.arrayContaining(['Latest 4,460', 'Highest 4,460', 'Oct 2026, as of 12 Oct, 4,460']));
  });

  it('draws no month after this one: a financial year to March shows September and October, not today\'s stock again for the months to come', () => {
    onThe(new Date(2026, 9, 12, 10, 0));
    const year = [point('2026-09', 4444), point('2026-10', 4360), point('2026-11', 4360), point('2027-03', 4360)];
    const { texts, labels, line, tableTexts } = draw(year, STOCK_NOW);
    expect(line).toEqual([4444, 4460]);
    expect(texts).toContain('Stock was 4,444 at the end of Sep 2026, and 4,460 as of 12 Oct.');
    expect(labels).toEqual(expect.arrayContaining(['Period 2 months', 'Sep 2026, 4,444', 'Oct 2026, as of 12 Oct, 4,460']));
    expect([...texts, ...labels, ...tableTexts].filter(words => /Nov 2026|Mar 2027/.test(words))).toEqual([]);
  });

  it('takes the month from the calendar in India, whatever the zone of the phone', () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India: September is over, October is in progress.
    onThe(new Date('2026-09-30T20:00:00Z'));
    expect(draw(TO_OCTOBER, STOCK_NOW).line).toEqual([949, 4444, 4460]);
    jest.useRealTimers();
    // 18:00 UTC on 30 Sep is 23:30 that day in India: September is still in progress, and October,
    // which has not begun there, is not drawn.
    onThe(new Date('2026-09-30T18:00:00Z'));
    expect(draw(TO_OCTOBER, STOCK_NOW).line).toEqual([949, 4460]);
  });

  it('visibleTrend: drops the months after this one, and points at this month when the period has it', () => {
    expect(visibleTrend(TO_OCTOBER, STOCK_NOW, '2026-10')).toEqual({ points: TO_OCTOBER, values: [949, 4444, 4460], nowIndex: 2 });
    expect(visibleTrend(TO_OCTOBER, STOCK_NOW, '2026-09')).toEqual({ points: TO_OCTOBER.slice(0, 2), values: [949, 4460], nowIndex: 1 });
    expect(visibleTrend(TO_OCTOBER, undefined, '2026-08')).toEqual({ points: TO_OCTOBER.slice(0, 1), values: [949], nowIndex: 0 });
    // A period that ended before this month: every month has its month end, and none is now.
    expect(visibleTrend(TO_OCTOBER, STOCK_NOW, '2026-11')).toEqual({ points: TO_OCTOBER, values: [949, 4444, 4360], nowIndex: -1 });
    // A month the calendar cannot place is kept, with the server's figure.
    expect(visibleTrend([point('undated', 70), point('2026-10', 5)], STOCK_NOW, '2026-10')).toEqual({ points: [point('undated', 70), point('2026-10', 5)], values: [70, 4460], nowIndex: 1 });
  });

  it('trendStockLevels: a stock of 0 is a figure, no figure leaves the server\'s, and a month it cannot read is left alone', () => {
    expect(trendStockLevels(TO_OCTOBER, STOCK_NOW, '2026-10')).toEqual([949, 4444, 4460]);
    expect(trendStockLevels(TO_OCTOBER, STOCK_NOW, '2026-11')).toEqual([949, 4444, 4360]);
    // Only this month takes the stock now: a later month is not given today's figure.
    expect(trendStockLevels(TO_OCTOBER, STOCK_NOW, '2026-09')).toEqual([949, 4460, 4360]);
    expect(trendStockLevels(TO_OCTOBER, 0, '2026-10')).toEqual([949, 4444, 0]);
    expect(trendStockLevels(TO_OCTOBER, undefined, '2026-10')).toEqual([949, 4444, 4360]);
    expect(trendStockLevels(TO_OCTOBER, Number.NaN, '2026-10')).toEqual([949, 4444, 4360]);
    // Not a month the calendar can place: the server's figure, and 0 for one it did not send.
    expect(trendStockLevels([point('undated', 70), { ...point('2026-09', 0), stock_level_end: undefined as never }], STOCK_NOW, '2026-10')).toEqual([70, 0]);
    // A year boundary: December of last year is over in January.
    expect(trendStockLevels([point('2026-12', 10), point('2027-01', 20)], 30, '2027-01')).toEqual([10, 30]);
  });
});
