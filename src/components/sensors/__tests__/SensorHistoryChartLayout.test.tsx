/**
 * The compact history chart is sized from its card, not from the screen: both value axes sit
 * inside the card, the points carry no value text, only three dates are drawn and the legend
 * names the units.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { SensorHistoryChart } from '../SensorHistoryChart';
import type { SensorHistoryReading } from '@/types/sensor-history.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));

const READINGS: SensorHistoryReading[] = Array.from({ length: 14 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 9, 1 + i, 4)).toISOString(),
  temperature: 3 + (i % 3) * 0.5,
  humidity: 84 + (i % 4),
}));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  jest.restoreAllMocks();
});

function render(readings = READINGS) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SensorHistoryChart readings={readings} aggregationInterval="1 hour" periodDays={14} />);
  });
  mounted.push(tree);
  return tree;
}

const lineChart = (tree: ReactTestRenderer) => tree.root.findAll(n => (n.type as unknown) === 'LineChart')[0];
const measure = (tree: ReactTestRenderer, width: number) => {
  const area = tree.root.findAll(n => n.props.testID === 'sensor-chart-area' && typeof n.props.onLayout === 'function')[0];
  act(() => area.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 140 } } }));
};
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));

const original = Dimensions.get('window');
/** The window's font scale, which the chart reads through useWindowDimensions. */
const setFontScale = (fontScale: number) => Dimensions.set({ window: { ...original, fontScale }, screen: Dimensions.get('screen') });
afterAll(() => Dimensions.set({ window: original, screen: Dimensions.get('screen') }));

describe('the compact history chart', () => {
  beforeEach(() => {
    setFontScale(1.3);
  });

  it('fits both value axes inside the width the card gives it', () => {
    const tree = render();
    measure(tree, 340);
    const chart = lineChart(tree);
    expect(chart.props.yAxisLabelWidth).toBe(Math.ceil(40 * 1.3));
    expect(chart.props.secondaryYAxis.yAxisLabelWidth).toBe(chart.props.yAxisLabelWidth);
    expect(chart.props.width + 2 * chart.props.yAxisLabelWidth).toBeLessThanOrEqual(340);
    expect(chart.props.adjustToWidth).toBeUndefined();
    // The points are spread over the chart area exactly.
    const n = READINGS.length;
    expect(chart.props.spacing * (n - 1) + chart.props.initialSpacing + chart.props.endSpacing).toBeCloseTo(chart.props.width, 5);
  });

  it('follows the card when it is narrower', () => {
    const tree = render();
    measure(tree, 260);
    const chart = lineChart(tree);
    expect(chart.props.width + 2 * chart.props.yAxisLabelWidth).toBeLessThanOrEqual(260);
  });

  it('draws no value text on the points and hides the dots of a long series', () => {
    const tree = render();
    measure(tree, 340);
    const chart = lineChart(tree);
    expect(chart.props.data.some((p: { dataPointText?: string }) => p.dataPointText !== undefined)).toBe(false);
    expect(chart.props.secondaryData.some((p: { dataPointText?: string }) => p.dataPointText !== undefined)).toBe(false);
    expect(chart.props.hideDataPoints).toBe(true);
  });

  it('draws at most three dates, each in a box wide enough for it', () => {
    const tree = render();
    measure(tree, 340);
    const chart = lineChart(tree);
    const labels = chart.props.data.map((p: { label: string }) => p.label).filter((l: string) => l !== '');
    expect(labels).toEqual(['01/10/26', '08/10/26', '14/10/26']);
    const style = [chart.props.xAxisLabelTextStyle].flat(3).reduce((a: object, s: object) => ({ ...a, ...s }), {});
    expect((style as { width: number }).width).toBe(Math.ceil(64 * 1.3));
  });

  it('CR-66: below font scale 1 the extra label height is zero, not negative', () => {
    setFontScale(0.8);
    const tree = render();
    measure(tree, 340);
    expect(lineChart(tree).props.labelsExtraHeight).toBe(0);
    expect(lineChart(tree).props.yAxisLabelWidth).toBe(Math.ceil(40 * 0.8));
  });

  it('names the units in its legend', () => {
    const tree = render();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Temperature (°C)', 'Humidity (%, right axis)']));
  });
});
