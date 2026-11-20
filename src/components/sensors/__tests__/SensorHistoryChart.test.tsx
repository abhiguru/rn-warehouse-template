import React from 'react';
import { render as rtlRender, screen, userEvent } from '@testing-library/react-native';
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

async function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  await rtlRender(element);
}

type Json = ReturnType<typeof screen.toJSON>;
/** The props of every stand-in chart host (react-native-gifted-charts is mocked as a host named LineChart). */
function lineCharts(): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const walk = (node: Json | string | null): void => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if ((node.type as string) === 'LineChart') found.push(node.props);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON());
  return found;
}

const openCard = () => screen.getByRole('button', { name: /^Historical trend/ });
async function openTable(user: ReturnType<typeof userEvent.setup>) {
  await user.press(openCard());
  await user.press(screen.getByRole('radio', { name: 'Table of values' }));
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
      'Temperature −18.5°C to 2.3°C. Humidity 80% to 90%. 3 daily averages.'
    );
  });
});

describe.each(THEMES)('SensorHistoryChart in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws series from the chart palette with divider axes, and shows a summary', async () => {
    await render(brand, mode, (
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
    const chart = lineCharts()[0];
    expect(chart.color).toBe(t.chart[0]);
    // Humidity has its own right-hand axis in percent (guide §13.11).
    expect(chart.secondaryLineConfig.color).toBe(t.chart[1]);
    expect(chart.secondaryYAxis.yAxisLabelSuffix).toBe('%');
    expect(chart.xAxisColor).toBe(t.border.divider);
    expect(chart.yAxisColor).toBe(t.border.divider);
    expect(chart.rulesColor).toBe(t.border.divider);
    expect(chart.showReferenceLine1).toBe(true);
    expect(chart.referenceLine1Config.color).toBe(t.status.negative.element);
    expect(chart.referenceLine1Config.labelText).toBe('Alarm 8°C');
    expect(chart.referenceLine2Config.color).toBe(t.status.critical.element);

    expect(screen.getByText('Historical trend')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Temperature −18\.5°C to 2\.3°C/).length).toBeGreaterThan(0);
  });

  it('opens a full-screen view with a values table', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(brand, mode, <SensorHistoryChart readings={READINGS} aggregationInterval="1 hour" periodDays={7} />);
    expect(screen.getByHintText('Opens the full-screen chart and a table of values')).toBe(openCard());
    await openTable(user);
    for (const text of ['Date and time', 'Temperature', 'Humidity', '−18.5°C', '80%']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it('draws the values table with the shared DataTable: a spoken label for each reading, 30 rows drawn first, no heading that sorts', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(brand, mode, <SensorHistoryChart readings={READINGS} aggregationInterval="1 hour" periodDays={7} />);
    await openTable(user);
    expect(screen.getByTestId('sensor-history-table').props.initialNumToRender).toBe(30);
    const rows = screen.getAllByTestId(/^sensor-history-row-/);
    expect(rows).toHaveLength(READINGS.length);
    // The last reading has no values: the row says so as the cells do, with the dash.
    expect(rows.map(row => String(row.props.accessibilityLabel).includes('−18.5°C'))).toEqual([true, false, false]);
    // Each row is read with its date in words, never as 01/10/26.
    expect(rows[0]).toHaveAccessibleName(/1 Oct 2026/);
    for (const row of rows) expect(row).not.toHaveAccessibleName(/\d\d\/\d\d\/\d\d/);
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryAllByTestId(/^sensor-history-table-sort-/)).toHaveLength(0);
  });

  it('shows an empty state without readings', async () => {
    await render(brand, mode, <SensorHistoryChart readings={[]} aggregationInterval="1 day" periodDays={7} />);
    expect(screen.getByText('No history for this period')).toBeOnTheScreen();
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

  it('draws negative readings below the axis start and leaves a gap for a missing reading', async () => {
    await render('orange', 'light', (
      <SensorHistoryChart readings={COLD_ROOM} aggregationInterval="1 day" periodDays={7} />
    ));
    const chart = lineCharts()[0];
    expect(chart.yAxisOffset).toBeLessThanOrEqual(-21.4);
    expect(chart.yAxisOffset + chart.maxValue).toBeLessThan(0);
    expect(chart.interpolateMissingValues).toBe(false);
    expect(chart.data.map((p: { value?: number }) => p.value)).toEqual([-21.4, -18.2, undefined, -19.6]);
    expect(chart.secondaryData[2].value).toBeUndefined();
    // Humidity values are plotted in percent on the secondary axis, unscaled.
    expect(chart.secondaryData[0].value).toBe(70);
    expect(chart.secondaryYAxis.maxValue).toBeGreaterThanOrEqual(75);
    expect(chart.formatYLabel('-20')).toBe('\u221220');
    expect(chart.data[0].label).toBe('01/10/26');
  });
});

describe('a long period with the lowest and highest of each point', () => {
  const RANGED: SensorHistoryReading[] = [
    { timestamp: '2026-10-01T00:00:00Z', temperature: 2, humidity: 80, temperature_min: -3, temperature_max: 9, humidity_min: 70, humidity_max: 90 },
    { timestamp: '2026-10-02T00:00:00Z', temperature: 3, humidity: 82, temperature_min: 0, temperature_max: 12, humidity_min: 71, humidity_max: 91 },
  ];

  it('puts the extremes on the temperature axis, not only the averages', () => {
    const domain = temperatureDomain(RANGED);
    expect(domain.min).toBeLessThanOrEqual(-3);
    expect(domain.max).toBeGreaterThanOrEqual(12);
  });

  it('draws two thin dashed lines for them, and the legend says so', async () => {
    await render('orange', 'light', <SensorHistoryChart readings={RANGED} aggregationInterval="1 day" periodDays={183} />);
    const props = lineCharts()[0];
    expect(props.data2.map((p: { value?: number }) => p.value)).toEqual([-3, 0]);
    expect(props.data3.map((p: { value?: number }) => p.value)).toEqual([9, 12]);
    expect(props.strokeDashArray2).toBeDefined();
    expect(screen.getByText('Lowest and highest temperature (dashed)')).toBeOnTheScreen();
  });

  it('draws none for an ordinary period', async () => {
    await render('orange', 'light', <SensorHistoryChart readings={READINGS} aggregationInterval="1 day" periodDays={7} />);
    expect(lineCharts()[0].data2).toBeUndefined();
    expect(screen.queryByText('Lowest and highest temperature (dashed)')).not.toBeOnTheScreen();
  });
});
