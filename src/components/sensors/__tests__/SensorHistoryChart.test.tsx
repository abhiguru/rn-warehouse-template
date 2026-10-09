import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import {
  SensorHistoryChart,
  formatHumidity,
  formatTemperature,
  summariseReadings,
  temperatureDomain,
} from '../SensorHistoryChart';
import type { SensorHistoryReading } from '@/types/sensor-history.types';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

const READINGS: SensorHistoryReading[] = [
  { timestamp: '2026-10-01T04:00:00Z', temperature: -18.5, humidity: 80 },
  { timestamp: '2026-10-02T04:00:00Z', temperature: 2.25, humidity: 90.4 },
  { timestamp: '2026-10-03T04:00:00Z', temperature: null, humidity: null },
];

function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
}

describe('sensor formatting', () => {
  it('formats temperatures with one decimal, degree sign and a true minus', () => {
    expect(formatTemperature(-18.5)).toBe('−18.5°C');
    expect(formatTemperature(4)).toBe('4.0°C');
    expect(formatTemperature(null)).toBe('—');
    expect(formatHumidity(null)).toBe('—');
    expect(formatHumidity(85.6)).toBe('86%');
  });

  it('summarises the readings in words', () => {
    expect(summariseReadings(READINGS, 'Daily')).toBe(
      'Temperature −18.5°C to 2.3°C, average −8.1°C. Humidity 80% to 90%, average 85%. 3 readings, daily averages.'
    );
  });
});

describe.each(THEMES)('SensorHistoryChart in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws series from the chart palette with divider axes, and shows a summary', () => {
    const tree = render(brand, mode, (
      <SensorHistoryChart
        readings={READINGS}
        aggregationInterval="1 day"
        periodDays={7}
        thresholds={[
          { value: 8, level: 'negative', label: 'Alarm 8°C' },
          { value: 6, level: 'critical', label: 'Warning 6°C' },
        ]}
      />
    ));
    const chart = tree.root.findAll(n => (n.type as unknown) === 'LineChart')[0];
    expect(chart.props.color).toBe(t.chart[0]);
    expect(chart.props.color2).toBe(t.chart[1]);
    expect(chart.props.xAxisColor).toBe(t.border.divider);
    expect(chart.props.yAxisColor).toBe(t.border.divider);
    expect(chart.props.rulesColor).toBe(t.border.divider);
    expect(chart.props.showReferenceLine1).toBe(true);
    expect(chart.props.referenceLine1Config.color).toBe(t.status.negative.element);
    expect(chart.props.referenceLine1Config.labelText).toBe('Alarm 8°C');
    expect(chart.props.referenceLine2Config.color).toBe(t.status.critical.element);

    const all = texts(tree);
    expect(all).toContain('Historical trend');
    expect(all.some(s => s.startsWith('Temperature −18.5°C to 2.3°C'))).toBe(true);
    act(() => tree.unmount());
  });

  it('opens a full-screen view with a values table', () => {
    const tree = render(brand, mode, <SensorHistoryChart readings={READINGS} aggregationInterval="1 hour" periodDays={7} />);
    const card = tree.root.findAll(n => n.props.accessibilityHint === 'Opens the full-screen chart and a table of values' && n.props.onPress)[0];
    act(() => card.props.onPress());
    const tableRadio = tree.root.findAll(n => n.props.accessibilityLabel === 'Table of values' && n.props.onPress)[0];
    act(() => tableRadio.props.onPress());
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Date and time', 'Temperature', 'Humidity', '−18.5°C', '80%']));
    act(() => tree.unmount());
  });

  it('shows an empty state without readings', () => {
    const tree = render(brand, mode, <SensorHistoryChart readings={[]} aggregationInterval="1 day" periodDays={7} />);
    expect(texts(tree)).toContain('No history for this period');
    act(() => tree.unmount());
  });
});

describe('temperature axis and missing readings', () => {
  const COLD_ROOM: SensorHistoryReading[] = [
    { timestamp: '2026-10-01T04:00:00Z', temperature: -21.4, humidity: 70 },
    { timestamp: '2026-10-02T04:00:00Z', temperature: -18.2, humidity: 75 },
    { timestamp: '2026-10-03T04:00:00Z', temperature: null, humidity: null },
    { timestamp: '2026-10-04T04:00:00Z', temperature: -19.6, humidity: 72 },
  ];

  it('takes the axis from the data and keeps zero off it when all readings are below zero', () => {
    const domain = temperatureDomain(COLD_ROOM);
    expect(domain.min).toBeLessThanOrEqual(-21.4);
    expect(domain.max).toBeGreaterThanOrEqual(-18.2);
    expect(domain.max).toBeLessThan(0);
    expect(domain.min).toBeGreaterThan(-30);
  });

  it('includes zero when the readings cross it', () => {
    const domain = temperatureDomain(READINGS);
    expect(domain.min).toBeLessThanOrEqual(-18.5);
    expect(domain.max).toBeGreaterThanOrEqual(2.25);
    expect(domain.min).toBeLessThan(0);
    expect(domain.max).toBeGreaterThan(0);
  });

  it('keeps thresholds on the axis', () => {
    const domain = temperatureDomain(COLD_ROOM, [-15]);
    expect(domain.max).toBeGreaterThanOrEqual(-15);
  });

  it('draws negative readings below the axis start and leaves a gap for a missing reading', () => {
    const tree = render('orange', 'light', (
      <SensorHistoryChart readings={COLD_ROOM} aggregationInterval="1 day" periodDays={7} />
    ));
    const chart = tree.root.findAll(n => (n.type as unknown) === 'LineChart')[0];
    expect(chart.props.yAxisOffset).toBeLessThanOrEqual(-21.4);
    expect(chart.props.yAxisOffset + chart.props.maxValue).toBeLessThan(0);
    expect(chart.props.interpolateMissingValues).toBe(false);
    expect(chart.props.data.map((p: { value?: number }) => p.value)).toEqual([-21.4, -18.2, undefined, -19.6]);
    expect(chart.props.data2[2].value).toBeUndefined();
    expect(chart.props.data2[0].value).toBeGreaterThanOrEqual(chart.props.yAxisOffset);
    expect(chart.props.formatYLabel('-20')).toBe('\u221220');
    expect(chart.props.data[0].label).toBe('1 Oct');
    act(() => tree.unmount());
  });
});
