/**
 * The temperature report's reads (WH-157, migration 187): the sensor list (array or { success, data }), the period limits
 * (12 months, From at most 2 years back) and the on-screen text of the server's period codes.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getReportSensors, periodProblem, periodTextForCode } from '../temperatureReportService';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const rows = [
  { id: 's1', name: 'Chamber 1', location: 'North', active: true, first_reading_at: '2026-01-01T00:00:00Z', last_reading_at: '2026-11-01T00:00:00Z' },
  { id: 's2', name: 'Chamber 2', location: 'South', active: false, first_reading_at: null },
  { id: '', name: 'No id' },
];

const answer = (data: unknown, error: unknown = null) => {
  const rpc = jest.fn(async () => ({ data, error }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
  return rpc;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('getReportSensors', () => {
  it.each([
    ['{ success, data }', { success: true, data: rows }],
  ])('reads %s (what get_sensor_report_devices answers), drops a row without an id and fills the gaps', async (_case, body) => {
    const rpc = answer(body);
    const result = await getReportSensors();
    expect(rpc).toHaveBeenCalledWith('get_sensor_report_devices');
    expect(result).toEqual({
      success: true,
      data: [
        { id: 's1', name: 'Chamber 1', location: 'North', active: true, first_reading_at: '2026-01-01T00:00:00Z', last_reading_at: '2026-11-01T00:00:00Z' },
        { id: 's2', name: 'Chamber 2', location: 'South', active: false, first_reading_at: null, last_reading_at: null },
      ],
    });
  });

  it('fails with the app\'s words when the answer is not a list', async () => {
    answer({ success: true, data: 'nope' });
    const result = await getReportSensors();
    expect(result.success).toBe(false);
    expect((result as { message: string }).message).toBe("Couldn't load the sensors. Check your connection and try again.");
  });

  it('fails without throwing when the request errors', async () => {
    answer(null, { message: 'relation "x" is on fire', code: 'XX000' });
    const result = await getReportSensors();
    expect(result.success).toBe(false);
  });

  it('fails without throwing when the client cannot be had', async () => {
    (getAuthenticatedClient as jest.Mock).mockRejectedValue(new Error('no session'));
    const result = await getReportSensors();
    expect(result.success).toBe(false);
  });
});

describe('periodProblem', () => {
  const TODAY = '2026-11-12';
  it.each([
    ['2026-01-01', '2026-12-31', null],
    ['2025-11-12', '2026-11-11', null],
    ['2025-11-12', '2026-11-12', 'periodTooLong'],
    ['2026-01-31', '2027-01-30', null],
    ['2026-01-31', '2027-01-31', 'periodTooLong'],
    ['2024-11-12', '2025-01-01', null],
    ['2024-11-11', '2025-01-01', 'periodTooOld'],
  ])('%s to %s: %s', (from, to, expected) => {
    expect(periodProblem(from, to, TODAY)).toBe(expected);
  });

  it('counts 31 Jan + 12 months as 31 Jan of the next year, and a leap day correctly', () => {
    expect(periodProblem('2027-02-28', '2028-02-27', '2027-06-01')).toBeNull();
    expect(periodProblem('2027-02-28', '2028-02-28', '2027-06-01')).toBe('periodTooLong');
    expect(periodProblem('2028-02-29', '2029-02-27', '2028-06-01')).toBeNull();
  });
});

describe('periodTextForCode', () => {
  it.each([
    ['PERIOD_TOO_LONG', 'reports.temperatureReport.periodTooLong'],
    ['PERIOD_TOO_OLD', 'reports.temperatureReport.periodTooOld'],
    ['NO_READINGS', 'reports.temperatureReport.noReadingsInPeriod'],
    ['SOMETHING_ELSE', undefined],
    [undefined, undefined],
  ])('%s', (code, key) => {
    expect(periodTextForCode(code)).toBe(key);
  });
});
