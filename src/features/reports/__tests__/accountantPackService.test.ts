/**
 * WH-158 (contract section 7): makeAccountantPack(fromDate, toDate): the request it sends to generate-accountant-pack, the zip it
 * answers with and the file name from `filename*`, and what it answers for a refusal. The real service runs; only the server's reply is faked.
 * Written BEFORE the build: fails today because the module does not exist.
 */
import { getAuthTokenString } from '@/utils/authTokenUtils';
import { makeAccountantPack } from '../accountantPackService';

jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'https://warehouse.example.test' }),
  createAuthenticatedFetch: jest.fn(() => (...args: Parameters<typeof fetch>) => global.fetch(...args)),
}));
jest.mock('@/utils/authTokenUtils', () => ({ getAuthTokenString: jest.fn() }));

const originalFetch = global.fetch;
let logs: jest.SpyInstance[];
beforeEach(() => {
  jest.mocked(getAuthTokenString).mockResolvedValue('fictional-access-credential');
  global.fetch = jest.fn();
  logs = ['log', 'info', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
});
afterEach(() => { logs.forEach(log => log.mockRestore()); global.fetch = originalFetch; });

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]).buffer;
const zipAnswer = (disposition: string | null) => ({
  ok: true, status: 200,
  headers: { get: (name: string) => ({ 'content-type': 'application/zip', 'content-disposition': disposition }[name.toLowerCase()] ?? null) },
  arrayBuffer: jest.fn(async () => ZIP_BYTES),
  json: jest.fn(async () => { throw new Error('not json'); }),
}) as any;
const jsonAnswer = (status: number, body: unknown) => ({
  ok: false, status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body, arrayBuffer: jest.fn(), text: async () => JSON.stringify(body),
}) as any;

it('POSTs { from_date, to_date } with the caller\'s token to /functions/v1/generate-accountant-pack', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer("attachment; filename*=UTF-8''demo-accountant-pack-2026-10.zip"));
  await makeAccountantPack('2026-10-01', '2026-10-31');
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = jest.mocked(fetch).mock.calls[0];
  expect(url).toBe('https://warehouse.example.test/functions/v1/generate-accountant-pack');
  expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fictional-access-credential' } });
  expect(JSON.parse(init!.body as string)).toEqual({ from_date: '2026-10-01', to_date: '2026-10-31' });
});

it('a zip answer gives the bytes and the file name from filename* (percent-decoded)', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer("attachment; filename*=UTF-8''demo%20cold-accountant-pack-2026-10.zip"));
  const result = await makeAccountantPack('2026-10-01', '2026-10-31');
  expect(result).toEqual({ success: true, bytes: ZIP_BYTES, fileName: 'demo cold-accountant-pack-2026-10.zip' });
});

it('[crit 15] the three refusals the screen words are passed on with their code: NOTHING_IN_PERIOD, PERIOD_ACROSS_YEARS, PACK_TOO_LONG, PACK_FORBIDDEN', async () => {
  const cases: [number, string][] = [[404, 'NOTHING_IN_PERIOD'], [400, 'PERIOD_ACROSS_YEARS'], [400, 'PACK_TOO_LONG'], [403, 'PACK_FORBIDDEN'], [400, 'INVALID_PERIOD'], [503, 'PACK_UNAVAILABLE']];
  for (const [status, code] of cases) {
    jest.mocked(fetch).mockResolvedValue(jsonAnswer(status, { success: false, error: 'Server text.', code }));
    const result = await makeAccountantPack('2026-10-01', '2026-10-31');
    expect(result).toMatchObject({ success: false, code });
    if (result.success) throw new Error('expected a refusal');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  }
});

it('no answer at all (the request fails) is a refusal without a code, with a message', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
  const result = await makeAccountantPack('2026-10-01', '2026-10-31');
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected a refusal');
  expect(result.code).toBeUndefined();
  expect(result.message.length).toBeGreaterThan(0);
});

it('no sign-in token: nothing is sent', async () => {
  jest.mocked(getAuthTokenString).mockResolvedValue(null as never);
  const result = await makeAccountantPack('2026-10-01', '2026-10-31');
  expect(result.success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('nothing of the pack or the token is logged', async () => {
  jest.mocked(fetch).mockResolvedValue(zipAnswer("attachment; filename*=UTF-8''a.zip"));
  await makeAccountantPack('2026-10-01', '2026-10-31');
  jest.mocked(fetch).mockResolvedValue(jsonAnswer(404, { success: false, error: 'x', code: 'NOTHING_IN_PERIOD' }));
  await makeAccountantPack('2026-10-01', '2026-10-31');
  for (const log of logs) for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain('fictional-access-credential');
});
