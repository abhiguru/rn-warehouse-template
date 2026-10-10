import { setLanguage, t } from '..';
import { formatHumidity, formatTemperature, summariseReadings } from '@/components/sensors/SensorHistoryChart';
import type { SensorHistoryReading } from '@/types/sensor-history.types';

// The chart module pulls in the theme hooks and native views; only its text helpers are used here.
jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn(), useAppSelector: () => undefined }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));

afterEach(() => setLanguage('en'));

describe('sensors in Gujarati', () => {
  it('counts sensors in an alert without changing the noun', () => {
    expect(t('sensors.list.lowBatteryCount', { count: 1 }, 'gu')).toBe('૧ સેન્સરની બૅટરી ઓછી છે');
    expect(t('sensors.list.staleCount', { count: 12 }, 'gu')).toBe('૧૨ સેન્સરનો તાજેતરનો ડેટા નથી');
  });

  it('puts the period before its noun and writes its number in Gujarati digits', () => {
    expect(t('sensors.period.summaryDays', { days: 30 }, 'gu')).toBe('છેલ્લા ૩૦ દિવસનો સારાંશ');
    expect(t('sensors.period.loadingYear', undefined, 'gu')).toBe('૧ વર્ષનો ઇતિહાસ લોડ થઈ રહ્યો છે');
    expect(t('sensors.list.nextUpdate', { seconds: 7 }, 'gu')).toBe('આગળનું અપડેટ ૭ સેકન્ડમાં');
  });

  it('shows readings in Gujarati digits and keeps the units', () => {
    setLanguage('gu');
    expect(formatTemperature(-18.5)).toBe('−૧૮.૫°C');
    expect(formatHumidity(85.6)).toBe('૮૬%');
    expect(t('sensors.detail.temperatureValue', { value: formatTemperature(4) })).toBe('તાપમાન ૪.૦°C');
  });

  it('summarises a chart as whole sentences', () => {
    setLanguage('gu');
    const readings = [
      { timestamp: '2026-10-01T00:00:00Z', temperature: -18.5, humidity: 80 },
      { timestamp: '2026-10-02T00:00:00Z', temperature: 2.3, humidity: 90 },
    ] as SensorHistoryReading[];
    expect(summariseReadings(readings, '1 day')).toBe(
      'તાપમાન −૧૮.૫°C થી ૨.૩°C સુધી, સરેરાશ −૮.૧°C. ભેજ ૮૦% થી ૯૦% સુધી, સરેરાશ ૮૫%. ૨ નોંધ, દરરોજની સરેરાશ.'
    );
  });
});
