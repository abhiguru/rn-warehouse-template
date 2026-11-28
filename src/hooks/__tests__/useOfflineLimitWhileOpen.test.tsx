/**
 * WH-389: the while-open offline-limit check runs only at a facility with the offline feature. Real: the hook, the facility
 * capabilities. Faked at the edge: the connection (`useIsOffline`) and the read of the kept profile, which says the limit
 * has passed whenever it is asked.
 */
import { act, renderHook } from '@testing-library/react-native';
import { setFacilityCapabilities, resetFacilityCapabilities } from '@/config/facilityCapabilities';
import { useOfflineLimitWhileOpen, OFFLINE_LIMIT_CHECK_MS } from '@/hooks/useOfflineLimitWhileOpen';

const FACILITY = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const mockRead = jest.fn(async (options: { onLimitPassed: () => void }) => { options.onLimitPassed(); return null; });
jest.mock('@/config/supabaseConfig', () => ({ getCachedUserProfile: (options: never) => mockRead(options) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => true }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
  onOperatorServerChange: () => () => undefined,
}));

beforeEach(() => { jest.useFakeTimers(); mockRead.mockClear(); resetFacilityCapabilities(); });
afterEach(() => { jest.useRealTimers(); });

const wait = (ms = 0) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

it('with the feature off nothing is read and nothing is closed, at once or at the next checks', async () => {
  setFacilityCapabilities(FACILITY, { sync: false });
  const close = jest.fn();
  await renderHook(() => useOfflineLimitWhileOpen(close));
  await wait(2 * OFFLINE_LIMIT_CHECK_MS);
  expect(mockRead).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it('the feature turned on starts the check; turned off again it stops', async () => {
  setFacilityCapabilities(FACILITY, { sync: false });
  const close = jest.fn();
  await renderHook(() => useOfflineLimitWhileOpen(close));
  await act(async () => { setFacilityCapabilities(FACILITY, { sync: true }); });
  await wait();
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => { setFacilityCapabilities(FACILITY, { sync: false }); });
  await wait(2 * OFFLINE_LIMIT_CHECK_MS);
  expect(close).toHaveBeenCalledTimes(1);
});
