/**
 * When the stored access token expires on the device's clock (`deviceExpiry` in
 * centralSession.ts), seen through the public path: a sign-in stores
 * `secure_central_access_expires`. The expiry is the time the answer was received plus
 * the token's own lifetime (`exp - iat`), so a device clock that is hours off changes
 * nothing; a token that cannot be read falls back to the stated expiry, then to 15 minutes.
 */
import * as SecureStore from 'expo-secure-store';
import { CENTRAL_SECURE_KEYS, fetchCentralProfile, resetCentralSessionForTests, verifyCentralCode } from '../centralSession';
import { resetCentralStateForTests } from '../centralState';

const ORIGIN = 'https://identity.example.test';
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));

const secure = new Map<string, string>();
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const token = (claims: Record<string, unknown>) => `${b64url({ alg: 'ES256' })}.${b64url(claims)}.signature`;
const USER = { id: 'user-1', phone_number: '919000000001', name: null, created_at: '' };
const reply = (body: unknown) => ({ ok: true, status: 200, url: '', headers: { get: () => null }, json: async () => body });

/** The device clock at the moment the answer is read: 2026-10-12 12:00:00 UTC on the device. */
const DEVICE_NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const MINUTES = 60 * 1000;

beforeEach(() => {
  secure.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  resetCentralSessionForTests();
  resetCentralStateForTests();
  jest.spyOn(Date, 'now').mockReturnValue(DEVICE_NOW);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { global.fetch = originalFetch; });

async function expiryStoredFor(session: Record<string, unknown>): Promise<number> {
  fetchMock.mockResolvedValueOnce(reply({ user: USER, session: { refresh_token: 'a'.repeat(64), ...session } }));
  const result = await verifyCentralCode('+919000000001', '482913', '2025-12');
  expect(result.ok).toBe(true);
  return Number(secure.get(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES));
}

describe('when the access token expires on the device clock', () => {
  it.each([
    ['two hours ahead of', -2 * 60 * MINUTES],
    ['two hours behind', 2 * 60 * MINUTES],
    ['in step with', 0],
  ])('5a. a device clock %s the service: receipt time plus the token\'s own lifetime (exp - iat)', async (_name, serviceMinusDevice) => {
    const iat = (DEVICE_NOW + serviceMinusDevice) / 1000;
    const stored = await expiryStoredFor({
      access_token: token({ iat, exp: iat + 900 }),
      access_expires_at: new Date((iat + 900) * 1000).toISOString(),
    });
    expect(stored).toBe(DEVICE_NOW + 15 * MINUTES);
  });

  it('5a2. the lifetime is the token\'s, not a fixed 15 minutes', async () => {
    const iat = DEVICE_NOW / 1000 - 3600;
    expect(await expiryStoredFor({ access_token: token({ iat, exp: iat + 300 }) })).toBe(DEVICE_NOW + 5 * MINUTES);
  });

  it('5a3. with the device two hours ahead, the call right after sign-in does not refresh', async () => {
    const iat = DEVICE_NOW / 1000 - 7200;
    await expiryStoredFor({ access_token: token({ iat, exp: iat + 900 }), access_expires_at: new Date((iat + 900) * 1000).toISOString() });
    fetchMock.mockResolvedValueOnce(reply({ user: USER }));
    expect((await fetchCentralProfile()).ok).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(ORIGIN, ''))).toEqual(['/v1/otp/verify', '/v1/me']);
  });

  it.each([
    ['not a token', 'opaque'],
    ['a token without iat', token({ exp: DEVICE_NOW / 1000 + 900 })],
    ['a token whose exp is not after its iat', token({ iat: DEVICE_NOW / 1000, exp: DEVICE_NOW / 1000 })],
    ['a token whose iat is 0', token({ iat: 0, exp: 900 })],
  ])('5b. %s: the stated time is used when it is in the device\'s future', async (_name, accessToken) => {
    expect(await expiryStoredFor({ access_token: accessToken, access_expires_at: new Date(DEVICE_NOW + 10 * MINUTES).toISOString() })).toBe(
      DEVICE_NOW + 10 * MINUTES
    );
  });

  it.each([
    ['no stated time', undefined],
    ['a stated time that is not a date', 'soon'],
    ['a stated time that is now', new Date(DEVICE_NOW).toISOString()],
    ['a stated time in the device\'s past', new Date(DEVICE_NOW - 2 * 60 * MINUTES).toISOString()],
  ])('5c. no readable lifetime and %s: 15 minutes from receipt', async (_name, stated) => {
    expect(await expiryStoredFor({ access_token: 'opaque', ...(stated === undefined ? {} : { access_expires_at: stated }) })).toBe(
      DEVICE_NOW + 15 * MINUTES
    );
  });
});
