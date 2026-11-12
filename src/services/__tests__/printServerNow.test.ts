/**
 * WH-152: getPrintJobs keeps the server's "now" (migration 183 sends server_now), serverNowMs counts on from it with the
 * phone's monotonic clock, and an older server (no server_now) leaves it null.
 */
const mockFetch = jest.fn();
jest.mock('../../config/supabaseConfig', () => ({
  createAuthenticatedFetch: () => mockFetch,
  getCurrentConfig: () => ({ url: 'https://example.invalid', anonKey: 'fictional-anon-key' }),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: async () => 'token' }));

type Service = typeof import('../print-service');
function load(): Service {
  let service!: Service;
  jest.isolateModules(() => {
    service = require('../print-service');
  });
  return service;
}
const answer = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('is null until a read carried server_now, and an answer without it leaves it null', async () => {
  const service = load();
  expect(service.serverNowMs()).toBeNull();
  mockFetch.mockResolvedValue(answer({ success: true, data: [] }));
  const result = await service.getPrintJobs();
  expect(result).toEqual({ success: true, data: [] });
  expect(service.serverNowMs()).toBeNull();
});

it('starts at the server time of the last read and moves on with the monotonic clock, not the phone\'s date', async () => {
  const service = load();
  const perf = jest.spyOn(performance, 'now');
  perf.mockReturnValue(1000);
  mockFetch.mockResolvedValue(answer({ success: true, data: [], server_now: '2026-11-12T10:00:00Z' }));
  const result = await service.getPrintJobs();
  expect(result).toEqual({ success: true, data: [], server_now: '2026-11-12T10:00:00Z' });
  const base = Date.parse('2026-11-12T10:00:00Z');
  expect(service.serverNowMs()).toBe(base);
  perf.mockReturnValue(61_000);
  jest.spyOn(Date, 'now').mockReturnValue(0); // a phone clock set wrong changes nothing
  expect(service.serverNowMs()).toBe(base + 60_000);
});
