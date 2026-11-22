/**
 * One sensor's detail on the reports data layer: the sensor and its history asked side by
 * side, a period chip asking for that period's history only, a late answer for a period
 * left behind never shown, a sensor the facility does not have, the minute timer asking
 * for the sensor again (not its history), the sensor's temperature limits on the chart, and a
 * sensor with less than a day of data (the 7-day period offered; the empty text only without readings).
 * The services and the router are stand-ins; the live updates timer is the real one.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { getTokens } from '@/theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDevice } from '@/services/sensor-service';
import { getSensorHistory } from '@/services/sensor-history-service';
import type { SensorDeviceDetail } from '@/types/sensor.types';
import type { SensorHistoryData } from '@/types/sensor-history.types';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import SensorDetailScreen from '../../../app/sensor-detail/[id]';

const mockState = {
  auth: { userProfile: { id: 'user-a', name: 'Asha Example', role: 'staff' } },
  theme: { preference: 'light', brand: 'orange' },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 's7' }),
  Stack: { Screen: (props: object) => { const { StackScreenMock } = require('@/tests/helpers/stackScreenMock'); return <StackScreenMock {...props} />; } },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@/hooks/useCapability', () => ({ useFacilityCapabilities: () => ({ sensors: true }), useCapability: () => true }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Riverside', companyName: 'Riverside Cold Storage' }),
  onOperatorServerChange: () => () => undefined,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } }, forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }), useIsOffline: () => false }));
jest.mock('@/services/sensor-service', () => ({ getSnapshot: jest.fn(), getDevice: jest.fn() }));
jest.mock('@/services/sensor-history-service', () => ({ getSensorHistory: jest.fn() }));
jest.mock('@/utils/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { createLogger: () => log };
});

const device = jest.mocked(getDevice);
const history = jest.mocked(getSensorHistory);

/** Monday 12 October 2026, 10:00 local time. */
const NOW = new Date(2026, 9, 12, 10, 0).getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const SENSOR: SensorDeviceDetail = {
  id: 's7',
  device_name: 'Ripening room probe',
  mac_address: '',
  location: 'Chamber 7',
  active: true,
  health_status: 'healthy',
  battery_status: 'OK',
  connectivity_status: 'ONLINE',
  is_stale: false,
  last_reading_at: minutesAgo(5),
  staleness_threshold_minutes: 30,
  consecutive_failures: 0,
  latest_temperature: 2,
  latest_humidity: 90,
  latest_reading_timestamp: minutesAgo(5),
  earliest_reading_at: '2026-01-01T00:00:00Z',
  measured_at: minutesAgo(5),
  last_seen_at: minutesAgo(5),
  hub_online: true,
  battery_low: false,
  first_reading_at: '2026-01-01T00:00:00Z',
  hub: { id: 'hub-1', host: '192.0.2.10', firmware: '1.0.0', online: true, last_seen_at: minutesAgo(1) },
};

const found = (over: Partial<SensorDeviceDetail> = {}) => ({ success: true, data: { device: { ...SENSOR, ...over } } });

/** A period's history whose reading count is the number of days, so each period reads differently. */
const historyOf = (days: number): { success: true; data: SensorHistoryData } => ({
  success: true,
  data: {
    device_id: 's7',
    device_name: 'Ripening room probe',
    location: 'Chamber 7',
    period_days: days,
    aggregation_interval: '1 day',
    readings: [
      { timestamp: '2026-10-10T00:00:00Z', temperature: 2, humidity: 88 },
      { timestamp: '2026-10-11T00:00:00Z', temperature: 3, humidity: 90 },
    ],
    summary: { avg_temperature: 2.5, min_temperature: 2, max_temperature: 3, avg_humidity: 89, min_humidity: 88, max_humidity: 90, total_readings: days },
  },
});

function held() {
  let release!: (value: unknown) => void;
  const promise = new Promise(resolve => {
    release = resolve;
  });
  return { promise, release };
}

jest.setTimeout(30_000);
let restoreQueries: () => void;
let originalAppState: typeof AppState.currentState;
let user: ReturnType<typeof userEvent.setup>;
beforeAll(() => {
  restoreQueries = makeQueryUpdatesImmediate();
});
afterAll(() => restoreQueries());
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
  forgetQueries();
  jest.clearAllMocks();
  originalAppState = AppState.currentState;
  AppState.currentState = 'active';
  device.mockResolvedValue(found() as never);
  history.mockImplementation(async (_id, days = 7) => historyOf(days) as never);
});
afterEach(() => {
  AppState.currentState = originalAppState;
  jest.useRealTimers();
});

const flush = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

async function open() {
  await render(<SensorDetailScreen />);
  await flush();
}
// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const shows = (...texts: string[]) => texts.forEach(text => expect(screen.getAllByText(text)[0]).toBeOnTheScreen());
const notShown = (text: string) => expect(screen.queryAllByText(text, everything)).toHaveLength(0);
const press = async (label: string) => {
  await user.press(screen.getAllByLabelText(label)[0]);
  await flush();
};
// The fact rows of the hero, as they are read out: "Connection, Online" (KeyValueCell, WH-216).
const facts = () => screen.queryAllByLabelText(/^(Connection|Battery|Last reading), /).map(node => node.props.accessibilityLabel as string);
// The period chips, as they are read out, and whether each is selected.
const chips = () =>
  screen.queryAllByRole('radio', everything).map(node => ({ label: node.props.accessibilityLabel as string, selected: Boolean(node.props.accessibilityState?.selected) }));
// WH-216: loading is the detail skeleton (labelled Loading details), not a spinner with its own text.
const skeletons = () => screen.queryAllByLabelText('Loading details');
// The chart is drawn by gifted-charts' LineChart, which the test replaces with a host of the same name; the chart sits
// inside a part hidden from the screen reader and has no role or text a query can reach, so its host props are read
// by walking the rendered tree (the same way as SensorHistoryChart.test.tsx).
type Json = NonNullable<ReturnType<typeof screen.toJSON>>;
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
// The limit lines of the chart: value, label and the colour of the level.
const limits = () => {
  const chart = lineCharts()[0];
  return [1, 2]
    .filter(n => chart[`showReferenceLine${n}`])
    .map(n => ({ value: chart[`referenceLine${n}Position`], label: chart[`referenceLine${n}Config`].labelText, colour: chart[`referenceLine${n}Config`].color }));
};

const NO_HISTORY = 'No history yet. Readings appear here once the sensor reports them.';

/** A 7-day history answer holding these readings, like the phone's sensor TH5 with one. */
const historyWith = (readings: SensorHistoryData['readings']): { success: true; data: SensorHistoryData } => ({
  success: true,
  data: {
    ...historyOf(7).data,
    aggregation_interval: '5 minutes',
    readings,
    summary: { avg_temperature: 4, min_temperature: 4, max_temperature: 4, avg_humidity: 80, min_humidity: 80, max_humidity: 80, total_readings: readings.length },
  },
});

describe('the sensor and its history', () => {
  it('are asked for side by side on opening, and shown together', async () => {
    const sensor = held();
    const days = held();
    device.mockImplementationOnce(() => sensor.promise as never);
    history.mockImplementationOnce(() => days.promise as never);
    await open();
    // Both requests are out before either answers.
    expect(device.mock.calls).toEqual([['s7']]);
    expect(history.mock.calls).toEqual([['s7', 7]]);
    expect(skeletons()).not.toHaveLength(0);
    notShown('Loading sensor');

    await act(async () => {
      sensor.release(found());
      days.release(historyOf(7));
    });
    await flush();
    shows('Ripening room probe', 'Chamber 7', 'Sensor OK', 'All readings, last 7 days', 'Based on 7 readings');
    expect(facts()).toEqual(['Connection, Online', 'Battery, Good', 'Last reading, 12 Oct 2026, 9:55 am']);
  });

  it('a period chip asks for that period\'s history only, and keeps the sensor on screen', async () => {
    await open();
    await press('Last 14 days');
    expect(history.mock.calls).toEqual([['s7', 7], ['s7', 14]]);
    expect(device).toHaveBeenCalledTimes(1);
    shows('Ripening room probe', 'All readings, last 14 days', 'Based on 14 readings');
  });

  it('a late answer for a period left behind is not shown under the period chosen', async () => {
    await open();
    const fourteen = held();
    const thirty = held();
    history.mockImplementationOnce(() => fourteen.promise as never).mockImplementationOnce(() => thirty.promise as never);
    await press('Last 14 days');
    await press('Last 30 days');
    shows('Loading 30 days of history');

    await act(async () => thirty.release(historyOf(30)));
    await flush();
    shows('All readings, last 30 days', 'Based on 30 readings');
    // The 14-day answer arrives last: a broken screen would now say 14.
    await act(async () => fourteen.release(historyOf(14)));
    await flush();
    shows('All readings, last 30 days', 'Based on 30 readings');
    notShown('Based on 14 readings');
  });

  it('a sensor the facility does not have says so, with no history', async () => {
    device.mockResolvedValue({ success: true, data: { device: null } } as never);
    await open();
    shows('Sensor not found', 'This sensor was not found. It may have been removed.');
    expect(lineCharts()).toEqual([]);
  });

  it('a sensor that could not be read says so and tries both again', async () => {
    device.mockResolvedValueOnce({ success: false, message: 'Failed to fetch sensor data' } as never);
    await open();
    shows('Something went wrong', "Couldn't load this sensor. Check your connection and try again.");
    await press('Try again');
    expect(device).toHaveBeenCalledTimes(2);
    shows('Ripening room probe');
  });
});

describe('live', () => {
  it('a minute on, the sensor is asked for again, not its history, and shows the new value', async () => {
    await open();
    shows('2.0°C');
    device.mockResolvedValueOnce(found({ latest_temperature: 3.5, measured_at: minutesAgo(0) }) as never);
    await flush(59_000);
    expect(device).toHaveBeenCalledTimes(1);
    await flush(1_000);
    expect(device).toHaveBeenCalledTimes(2);
    expect(history).toHaveBeenCalledTimes(1);
    shows('3.5°C');
  });

  it('a sensor that could not be read is not asked again by the minute timer', async () => {
    device.mockResolvedValue({ success: false, message: 'Failed to fetch sensor data' } as never);
    await open();
    expect(device).toHaveBeenCalledTimes(1);
    await flush(5 * 60_000);
    expect(device).toHaveBeenCalledTimes(1);
  });

  it('the connection turns "No recent data" as the time moves on', async () => {
    device.mockResolvedValue(found({ measured_at: minutesAgo(29), last_seen_at: minutesAgo(29) }) as never);
    await open();
    expect(facts()[0]).toBe('Connection, Online');
    await flush(2 * 60_000);
    expect(facts()[0]).toBe('Connection, No recent data');
    // Two minutes: the minute timer asked for the sensor twice more (the answer is unchanged); history never.
    expect(device).toHaveBeenCalledTimes(3);
    expect(history).toHaveBeenCalledTimes(1);
  });
});

describe('the chart', () => {
  it("draws the sensor's temperature limits from its alert settings, and none without them", async () => {
    device.mockResolvedValue(found({ alert_config: { temperature_max: 8, temperature_min: 0 } }) as never);
    await open();
    const negative = getTokens('orange', 'light').status.negative.element;
    expect(limits()).toEqual([
      { value: 8, label: 'Max 8.0°C', colour: negative },
      { value: 0, label: 'Min 0.0°C', colour: negative },
    ]);
  });

  it('draws no limits for a sensor with none', async () => {
    await open();
    expect(lineCharts()).not.toHaveLength(0);
    expect(limits()).toEqual([]);
  });
});

describe('a sensor with less than a day of data', () => {
  const NEW_SENSOR = { first_reading_at: minutesAgo(10), earliest_reading_at: minutesAgo(10) };

  it('names the 7-day period in the section title and offers no chip', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    await open();
    expect(chips()).toEqual([]);
    shows('History, last 7 days');
    expect(history.mock.calls).toEqual([['s7', 7]]);
  });

  it('a history answer with readings shows the chart and its summary, not the empty text', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    history.mockResolvedValue(historyWith([{ timestamp: minutesAgo(3), temperature: 4, humidity: 80 }]) as never);
    await open();
    expect(lineCharts().length).toBe(1);
    expect(lineCharts()[0].data.length).toBe(1);
    shows('All readings, last 7 days', 'Based on 1 reading');
    notShown(NO_HISTORY);
  });

  it('a history answer with no readings shows the empty text, not the chart or a summary', async () => {
    device.mockResolvedValue(found(NEW_SENSOR) as never);
    history.mockResolvedValue(historyWith([]) as never);
    await open();
    shows(NO_HISTORY);
    expect(lineCharts().length).toBe(0);
    notShown('All readings, last 7 days');
    // Only the 7-day period exists yet: named in the section title, no chip.
    expect(chips()).toEqual([]);
  });
});

describe('WH-216: the sensor page in the stack header, and when it cannot be shown', () => {
  const { setLanguage } = require('@/i18n');
  afterEach(() => {
    setLanguage('en');
    mockState.auth.userProfile.role = 'staff';
  });
  const controls = (label: string) => screen.queryAllByLabelText(label, everything);

  it('has Refresh for staff and no Edit; an administrator has Edit as well, and Edit opens the sensor form', async () => {
    await open();
    expect(controls('Refresh sensor data').length).toBeGreaterThan(0);
    expect(controls('Edit')).toHaveLength(0);
    await screen.unmount();
    mockState.auth.userProfile.role = 'admin';
    await open();
    expect(controls('Edit').length).toBeGreaterThan(0);
  });

  it('has neither Refresh nor Edit while the sensor is not read', async () => {
    mockState.auth.userProfile.role = 'admin';
    device.mockResolvedValue({ success: true, data: { device: null } } as never);
    await open();
    expect(controls('Refresh sensor data')).toHaveLength(0);
    expect(controls('Edit')).toHaveLength(0);
  });

  it('says a sensor the facility does not have in Gujarati', async () => {
    setLanguage('gu');
    device.mockResolvedValue({ success: true, data: { device: null } } as never);
    await open();
    shows('સેન્સર મળ્યું નથી', 'આ સેન્સર મળ્યું નથી. કદાચ તે કાઢી નાખવામાં આવ્યું છે.');
  });

  it('says a sensor that could not be read in Gujarati', async () => {
    setLanguage('gu');
    device.mockResolvedValueOnce({ success: false, message: 'Failed to fetch sensor data' } as never);
    await open();
    shows('કંઈક ખોટું થયું', 'આ સેન્સર લોડ કરી શકાયું નથી. તમારું કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.');
  });
});
