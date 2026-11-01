/**
 * get_sensor_hourly: the range is asked in chunks of at most 400 days, the server's refusals are worded by their code,
 * an older backend (PGRST202) is recorded and hides the long ranges, and a half range is never returned as all.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { resetRpcSupport, rpcSupport } from '@/config/facilityRpcSupport';
import { getSensorHistory } from '@/services/sensor-history-service';
import { getSensorHistoryLong, getSensorHourlyRows } from '../sensor-hourly-service';

jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => undefined,
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn(), getSessionIdentity: jest.fn(async () => null) }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));
jest.mock('@/services/sensor-history-service', () => ({ getSensorHistory: jest.fn() }));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1);
const hours = (...stamps: string[]) =>
  stamps.map(hour => ({ hour, sample_count: 12, temperature_min: 1, temperature_max: 3, temperature_avg: 2, humidity_min: 80, humidity_max: 90, humidity_avg: 85 }));
const answer = (rows: unknown[]) => ({
  data: { success: true, data: { device_id: 's1', device_name: 'Chamber 1', location: 'North', hours: rows }, metadata: { row_count: rows.length } },
  error: null,
});

let rpc: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  resetRpcSupport();
  rpc = jest.fn();
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});

describe('getSensorHourlyRows', () => {
  it('asks two years in two calls that meet, and returns the hours in order', async () => {
    rpc.mockResolvedValueOnce(answer(hours('2025-06-01T00:00:00Z'))).mockResolvedValueOnce(answer(hours('2026-06-01T00:00:00Z')));
    const result = await getSensorHourlyRows('s1', { fromMs: NOW - 730 * DAY, toMs: NOW });

    expect(rpc).toHaveBeenCalledTimes(2);
    const [first, second] = rpc.mock.calls.map(call => call[1]);
    expect(rpc.mock.calls[0][0]).toBe('get_sensor_hourly');
    expect(first.p_device_id).toBe('s1');
    expect(first.p_to).toBe(second.p_from);
    expect(second.p_to).toBe(new Date(NOW).toISOString());
    for (const call of [first, second]) expect(Date.parse(call.p_to) - Date.parse(call.p_from)).toBeLessThanOrEqual(400 * DAY);
    expect(result).toMatchObject({ success: true, device: { id: 's1', name: 'Chamber 1', location: 'North' } });
    expect(result.success && result.rows.map(r => r.hour)).toEqual(['2025-06-01T00:00:00Z', '2026-06-01T00:00:00Z']);
    expect(rpcSupport('sensorHourly')).toBe(true);
  });

  it.each([
    ['INVALID_RANGE', 'The period is not valid. Choose another one.'],
    ['RANGE_TOO_LARGE', 'The period is too long for one request. Choose a shorter one.'],
    ['DEVICE_NOT_FOUND', 'This sensor is not on this facility any more.'],
  ])('words %s in the app\'s language and never shows the server sentence', async (code, text) => {
    rpc.mockResolvedValue({ data: { success: false, error: 'server english', error_code: code }, error: null });
    const result = await getSensorHourlyRows('s1', { fromMs: NOW - 30 * DAY, toMs: NOW });
    expect(result).toEqual({ success: false, code, message: text });
  });

  it('does not return half a range: the first chunk that fails ends the read', async () => {
    rpc.mockResolvedValueOnce(answer(hours('2025-06-01T00:00:00Z'))).mockResolvedValueOnce({ data: { success: false, error: 'x', error_code: 'RANGE_TOO_LARGE' }, error: null });
    const result = await getSensorHourlyRows('s1', { fromMs: NOW - 730 * DAY, toMs: NOW });
    expect(result.success).toBe(false);
  });

  it('records an older backend (PGRST202) and says it is unsupported', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_sensor_hourly' } });
    const result = await getSensorHourlyRows('s1', { fromMs: NOW - 183 * DAY, toMs: NOW });
    expect(result).toMatchObject({ success: false, unsupported: true });
    expect(rpcSupport('sensorHourly')).toBe(false);
  });

  it('passes the access refusal of a customer account on as 42501', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Staff access required' } });
    const result = await getSensorHourlyRows('s1', { fromMs: NOW - 30 * DAY, toMs: NOW });
    expect(result).toMatchObject({ success: false, code: '42501' });
  });

  it('sends nothing for a range that is not after its start', async () => {
    const result = await getSensorHourlyRows('s1', { fromMs: NOW, toMs: NOW });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, code: 'INVALID_RANGE' });
  });
});

describe('getSensorHistoryLong', () => {
  it('answers the history screen with daily points for 6 months', async () => {
    rpc.mockResolvedValue(answer(hours('2026-10-01T01:00:00Z', '2026-10-01T02:00:00Z')));
    const result = await getSensorHistoryLong('s1', 183, NOW);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ period_days: 183, aggregation_interval: '1 day', device_name: 'Chamber 1' });
    expect(result.data?.readings).toHaveLength(1);
  });

  it('reads the year the older way on a backend without the hourly summary, but refuses 6 months and 2 years', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    jest.mocked(getSensorHistory).mockResolvedValue({ success: true, data: null });
    await getSensorHistoryLong('s1', 365, NOW);
    expect(getSensorHistory).toHaveBeenCalledWith('s1', 365);

    // Known now: the year goes the older way without asking again.
    rpc.mockClear();
    await getSensorHistoryLong('s1', 365, NOW);
    expect(rpc).not.toHaveBeenCalled();

    const sixMonths = await getSensorHistoryLong('s1', 183, NOW);
    expect(sixMonths.success).toBe(false);
  });
});
