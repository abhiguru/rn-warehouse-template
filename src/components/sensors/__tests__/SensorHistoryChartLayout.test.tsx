/**
 * The compact history chart is sized from its card, not from the screen: both value axes sit
 * inside the card, the points carry no value text, only three dates are drawn and the legend
 * names the units.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

afterEach(() => {
  jest.restoreAllMocks();
});

async function draw(readings = READINGS) {
  await render(<SensorHistoryChart readings={readings} aggregationInterval="1 hour" periodDays={14} />);
}

type Json = ReturnType<typeof screen.toJSON>;
/** The props of the stand-in chart host (react-native-gifted-charts is mocked as a host named LineChart). */
function lineChart(): Record<string, any> {
  const walk = (node: Json | string | null): Record<string, any> | undefined => {
    if (!node || typeof node === 'string') return undefined;
    if (Array.isArray(node)) return node.map(walk).find(Boolean);
    if ((node.type as string) === 'LineChart') return node.props;
    return node.children?.map(walk).find(Boolean);
  };
  return walk(screen.toJSON())!;
}
const measure = (width: number) =>
  fireEvent(screen.getByTestId('sensor-chart-area', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 140 } } });

const original = Dimensions.get('window');
/** The window's font scale, which the chart reads through useWindowDimensions. */
const setFontScale = (fontScale: number) => Dimensions.set({ window: { ...original, fontScale }, screen: Dimensions.get('screen') });
afterAll(() => Dimensions.set({ window: original, screen: Dimensions.get('screen') }));

describe('the compact history chart', () => {
  beforeEach(() => {
    setFontScale(1.3);
  });

  it('fits both value axes inside the width the card gives it', async () => {
    await draw();
    await measure(340);
    const chart = lineChart();
    expect(chart.yAxisLabelWidth).toBe(Math.ceil(40 * 1.3));
    expect(chart.secondaryYAxis.yAxisLabelWidth).toBe(chart.yAxisLabelWidth);
    expect(chart.width + 2 * chart.yAxisLabelWidth).toBeLessThanOrEqual(340);
    expect(chart.adjustToWidth).toBeUndefined();
    // The points are spread over the chart area exactly.
    const n = READINGS.length;
    expect(chart.spacing * (n - 1) + chart.initialSpacing + chart.endSpacing).toBeCloseTo(chart.width, 5);
  });

  it('follows the card when it is narrower', async () => {
    await draw();
    await measure(260);
    const chart = lineChart();
    expect(chart.width + 2 * chart.yAxisLabelWidth).toBeLessThanOrEqual(260);
  });

  it('draws no value text on the points and hides the dots of a long series', async () => {
    await draw();
    await measure(340);
    const chart = lineChart();
    expect(chart.data.some((p: { dataPointText?: string }) => p.dataPointText !== undefined)).toBe(false);
    expect(chart.secondaryData.some((p: { dataPointText?: string }) => p.dataPointText !== undefined)).toBe(false);
    expect(chart.hideDataPoints).toBe(true);
  });

  it('draws at most three dates, each in a box wide enough for it', async () => {
    await draw();
    await measure(340);
    const chart = lineChart();
    const labels = chart.data.map((p: { label: string }) => p.label).filter((l: string) => l !== '');
    expect(labels).toEqual(['01/10/26', '08/10/26', '14/10/26']);
    const style = [chart.xAxisLabelTextStyle].flat(3).reduce((a: object, s: object) => ({ ...a, ...s }), {});
    expect((style as { width: number }).width).toBe(Math.ceil(64 * 1.3));
  });

  it('CR-66: below font scale 1 the extra label height is zero, not negative', async () => {
    setFontScale(0.8);
    await draw();
    await measure(340);
    expect(lineChart().labelsExtraHeight).toBe(0);
    expect(lineChart().yAxisLabelWidth).toBe(Math.ceil(40 * 0.8));
  });

  it('names the units in its legend', async () => {
    await draw();
    expect(screen.getByText('Temperature (°C)')).toBeOnTheScreen();
    expect(screen.getByText('Humidity (%, right axis)')).toBeOnTheScreen();
  });
});
