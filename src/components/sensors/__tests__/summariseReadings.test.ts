import { summariseReadings } from '../SensorHistoryChart';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const TWO = [
  { timestamp: '2026-10-12T04:00:00Z', temperature: 2.5, humidity: 84 },
  { timestamp: '2026-10-12T05:00:00Z', temperature: 4.2, humidity: 88 },
];

describe('summariseReadings', () => {
  it('gives the range and the number of averages, with no average of averages', () => {
    expect(summariseReadings(TWO, '1 hour')).toBe(
      'Temperature 2.5°C to 4.2°C. Humidity 84% to 88%. 2 hourly averages.'
    );
  });

  it('counts a single point in the singular and other intervals by name', () => {
    expect(summariseReadings(TWO.slice(0, 1), '1 hour')).toBe(
      'Temperature 2.5°C to 2.5°C. Humidity 84% to 84%. 1 hourly average.'
    );
    expect(summariseReadings(TWO, '1 day')).toMatch(/2 daily averages\.$/);
    expect(summariseReadings(TWO, '2 hours')).toMatch(/2 2-hour averages\.$/);
    expect(summariseReadings(TWO, '5 minutes')).toMatch(/2 5 minutes averages\.$/);
  });
});
