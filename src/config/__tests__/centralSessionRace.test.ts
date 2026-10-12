/**
 * The central session when two things use the secure store at once: a code check
 * overtaken by a newer check or by a sign-out, a check whose store write fails,
 * a start-up read that finds a leftover, and a refresh or a profile answer that
 * arrives after something else has changed the session. In each case the store,
 * the in-memory state and the next start must agree. Every wait is held open by
 * the test, so the order of events is fixed (no timers).
 *
 * Also here: an account deletion never carries the token of another person than the one it
 * was asked for, a refresh that waits behind another and begins during the next sign-in does
 * not end that sign-in, and one failed read of the stored refresh token costs nobody the
 * session.
 *
 * And from the external review of 2026-10-12: a refresh of person X answered after Y was
 * stored neither writes X's pair under Y (also when that read fails) nor ends Y's session on a
 * refusal; a token set whose access token names another person than the stored user is never
 * used for that user; a sign-out whose deletions fail says so and the next start does not
 * sign the person back in.
 */
import * as SecureStore from 'expo-secure-store';
import {
  CENTRAL_SECURE_KEYS,
  CENTRAL_SIGNED_OUT_KEY,
  deleteCentralAccount,
  fetchCentralProfile,
  refreshCentralSession,
  requestFacilityToken,
  resetCentralSessionForTests,
  restoreCentralSession,
  signOutCentral,
  verifyCentralCode,
} from '../centralSession';
import { getCentralState, resetCentralStateForTests, setCentralState } from '../centralState';

const ORIGIN = 'https://identity.example.test';
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));

const secure = new Map<string, string>();
const originalFetch = global.fetch;
const fetchMock = jest.fn();

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const ISSUED_AT = Math.floor(Date.now() / 1000);
const accessToken = (label: string) =>
  `${b64url({ alg: 'ES256', typ: 'central-access+jwt' })}.${b64url({ iss: ORIGIN, sub: label.startsWith('y') ? 'user-y' : 'user-x', iat: ISSUED_AT, exp: ISSUED_AT + 900, label })}.signature`;
const refreshToken = (digit: string) => digit.repeat(64);
const sessionOf = (label: string, digit: string) => ({
  access_token: accessToken(label),
  access_expires_at: new Date((ISSUED_AT + 900) * 1000).toISOString(),
  refresh_token: refreshToken(digit),
});
const USER_X = { id: 'user-x', phone_number: '919000000001', name: null, created_at: '2026-10-12T06:00:00.000Z' };
const USER_Y = { id: 'user-y', phone_number: '919000000002', name: null, created_at: '2026-10-12T06:00:00.000Z' };
const PHONE_X = '+919000000001';
const PHONE_Y = '+919000000002';

const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  url: '',
  headers: { get: () => null },
  json: async () => body,
});
const wrongCode = () => reply(401, { error: { code: 'invalid_code', message: 'x' } });

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
/** Lets every promise chain that can run, run. */
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)); };

/** The next `setItemAsync` of `key` whose value contains `marker` waits for the returned gate. */
let writeGates: { key: string; marker: string; gate: Deferred<void>; reached: Deferred<void> }[] = [];
function holdWrite(key: string, marker: string) {
  const entry = { key, marker, gate: deferred<void>(), reached: deferred<void>() };
  writeGates.push(entry);
  return entry;
}
let readGate: { gate: Deferred<void>; reached: Deferred<void> } | null = null;
/** The `after`-th secure-store read from the moment this is set waits for `gate` (any key). */
let readHold: { after: number; seen: number; gate: Deferred<void>; reached: Deferred<void> } | null = null;

/** Queued answers of the service, by `METHOD path`, each one a promise the test resolves. */
let pending: Record<string, Deferred<ReturnType<typeof reply>>[]> = {};
function expectCall(key: string) {
  const d = deferred<ReturnType<typeof reply>>();
  (pending[key] ??= []).push(d);
  return d;
}

const callsOf = (key: string) => fetchMock.mock.calls.filter(([url, init]) => `${init.method} ${String(url).replace(ORIGIN, '')}` === key);

const stored = () => ({
  access: secure.get(CENTRAL_SECURE_KEYS.ACCESS_TOKEN) ?? null,
  refresh: secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN) ?? null,
  expires: secure.has(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES),
  userId: secure.has(CENTRAL_SECURE_KEYS.USER) ? JSON.parse(secure.get(CENTRAL_SECURE_KEYS.USER) as string).id : null,
});

beforeEach(() => {
  secure.clear();
  writeGates = [];
  readGate = null;
  readHold = null;
  pending = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    const key = `${init.method} ${url.replace(ORIGIN, '')}`;
    const next = pending[key]?.shift();
    if (!next) return Promise.reject(new Error(`unexpected request ${key}`));
    return next.promise;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    if (readHold) {
      readHold.seen += 1;
      if (readHold.seen === readHold.after) {
        const held = readHold;
        held.reached.resolve();
        await held.gate.promise;
      }
    }
    if (readGate && key === CENTRAL_SECURE_KEYS.ACCESS_TOKEN) {
      const held = readGate;
      readGate = null;
      held.reached.resolve();
      await held.gate.promise;
    }
    return secure.get(key) ?? null;
  });
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    const index = writeGates.findIndex(entry => entry.key === key && value.includes(entry.marker));
    if (index >= 0) {
      const [held] = writeGates.splice(index, 1);
      held.reached.resolve();
      await held.gate.promise;
    }
    secure.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  resetCentralSessionForTests();
  resetCentralStateForTests();
});
afterAll(() => { global.fetch = originalFetch; });

async function signedInAsX(secondsLeft = 600) {
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('x-old'));
  secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, refreshToken('1'));
  secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(Date.now() + secondsLeft * 1000));
  secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'user-x', phoneNumber: '919000000001', name: null, createdAt: '' }));
  await restoreCentralSession();
  expect(getCentralState().status).toBe('signedIn');
}

/** A is answered and is inside its store write; returns the handles. */
async function checkInsideItsWrite(phone: string, user: typeof USER_X, label: string, digit: string) {
  const answer = expectCall('POST /v1/otp/verify');
  const hold = holdWrite(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken(label));
  const check = verifyCentralCode(phone, '111111', '2025-12');
  answer.resolve(reply(200, { user, session: sessionOf(label, digit) }));
  await hold.reached.promise;
  return { check, hold };
}

describe('one code check overtaken by another', () => {
  it('R1. overtaken during its store write, and the newer check fails: nothing of it stays stored, and the next start is signed out', async () => {
    await restoreCentralSession();
    const { check: checkA, hold } = await checkInsideItsWrite(PHONE_X, USER_X, 'x-a', 'a');
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_Y, '222222', '2025-12');
    hold.gate.resolve();
    answerB.resolve(wrongCode());
    expect(await checkA).toMatchObject({ ok: false, code: 'failed' });
    expect(await checkB).toMatchObject({ ok: false, code: 'invalid_code' });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('R2. overtaken during its store write, and the newer check succeeds: every key is the newer one\'s', async () => {
    await restoreCentralSession();
    const { check: checkA, hold } = await checkInsideItsWrite(PHONE_X, USER_X, 'x-a', 'a');
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_Y, '222222', '2025-12');
    answerB.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    await settle();
    hold.gate.resolve();
    expect(await checkA).toMatchObject({ ok: false, code: 'failed' });
    expect(await checkB).toMatchObject({ ok: true, user: { id: 'user-y' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
  });

  it('R3. a check whose store write fails does not remove the session a newer check stored', async () => {
    await restoreCentralSession();
    const { check: checkA, hold } = await checkInsideItsWrite(PHONE_X, USER_X, 'x-a', 'a');
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_Y, '222222', '2025-12');
    answerB.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    await settle();
    hold.gate.reject(new Error('keystore'));
    expect(await checkA).toMatchObject({ ok: false, code: 'failed' });
    expect(await checkB).toMatchObject({ ok: true, user: { id: 'user-y' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
  });

  it('R4. overtaken while it waits in the write queue: it writes nothing at all', async () => {
    await restoreCentralSession();
    // Something else holds the queue: a read of the store.
    readGate = { gate: deferred<void>(), reached: deferred<void>() };
    const held = readGate;
    const reading = refreshCentralSession(); // its first step is a queued read
    await held.reached.promise;
    jest.mocked(SecureStore.setItemAsync).mockClear();
    const answerA = expectCall('POST /v1/otp/verify');
    const checkA = verifyCentralCode(PHONE_X, '111111', '2025-12');
    answerA.resolve(reply(200, { user: USER_X, session: sessionOf('x-a', 'a') }));
    await settle(); // A's answer is in; its write waits behind the read
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12');
    held.gate.resolve();
    answerB.resolve(wrongCode());
    expect(await checkA).toMatchObject({ ok: false, code: 'failed' });
    expect(await checkB).toMatchObject({ ok: false, code: 'invalid_code' });
    await reading;
    await settle();
    expect(jest.mocked(SecureStore.setItemAsync).mock.calls.map(call => call[0])).toEqual([]);
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState().status).toBe('signedOut');
  });

  it('R5. sign-out during a check\'s store write: signed out, the store empty', async () => {
    await restoreCentralSession();
    const { check: checkA, hold } = await checkInsideItsWrite(PHONE_X, USER_X, 'x-a', 'a');
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    const leaving = signOutCentral();
    hold.gate.resolve();
    await checkA;
    await leaving;
    await settle();
    expect(getCentralState().status).toBe('signedOut');
    expect([...secure.keys()]).toEqual([]);
  });

  it('R6. a check whose store write fails while a session is in use: the state does not go on saying signed in over an empty store', async () => {
    await signedInAsX(600);
    const answerA = expectCall('POST /v1/otp/verify');
    const hold = holdWrite(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('y-a'));
    const checkA = verifyCentralCode(PHONE_Y, '111111', '2025-12');
    answerA.resolve(reply(200, { user: USER_Y, session: sessionOf('y-a', 'a') }));
    await hold.reached.promise;
    hold.gate.reject(new Error('keystore'));
    expect(await checkA).toMatchObject({ ok: false, code: 'failed' });
    await settle();
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('R8. a start-up read that finds a leftover does not remove a session stored after it', async () => {
    secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'user-old', phoneNumber: '919000000009', name: null, createdAt: '' }));
    const answerA = expectCall('POST /v1/otp/verify');
    const checkA = verifyCentralCode(PHONE_X, '111111', '2025-12');
    readGate = { gate: deferred<void>(), reached: deferred<void>() };
    const held = readGate;
    const restoring = restoreCentralSession();
    await held.reached.promise;
    answerA.resolve(reply(200, { user: USER_X, session: sessionOf('x-a', 'a') }));
    await settle();
    held.gate.resolve();
    await restoring;
    expect(await checkA).toMatchObject({ ok: true, user: { id: 'user-x' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expect(stored()).toEqual({ access: accessToken('x-a'), refresh: refreshToken('a'), expires: true, userId: 'user-x' });
  });

  it('R9. a code check that fails during a refresh does not lose the new token pair', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle();
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12');
    answerB.resolve(wrongCode());
    await checkB;
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    const outcome = await refreshing;
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expect(stored()).toEqual({ access: accessToken('x-new'), refresh: refreshToken('2'), expires: true, userId: 'user-x' });
    expect(outcome).toMatchObject({ kind: 'ok', session: { refreshToken: refreshToken('2') } });
    // The next refresh presents the NEW token: the service has no reason to call it a reuse.
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-newer', '3') }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'ok' });
    const sent = callsOf('POST /v1/session/refresh').map(([, init]) => JSON.parse(String((init as RequestInit).body)).refresh_token);
    expect(sent).toEqual([refreshToken('1'), refreshToken('2')]);
    expect(stored().refresh).toBe(refreshToken('3'));
  });
});

describe('one refresh at a time, also across a code check', () => {
  it('R16. a refresh asked for after a code check began waits for the running one and sends the NEW token', async () => {
    await signedInAsX(30);
    const answerFirst = expectCall('POST /v1/session/refresh');
    const first = refreshCentralSession();
    await settle(); // the first refresh has sent token 1
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12'); // moves the epoch; fails below
    answerB.resolve(wrongCode());
    await checkB;
    const second = refreshCentralSession(); // not the same epoch: it cannot share the first one's answer
    await settle();
    expect(callsOf('POST /v1/session/refresh')).toHaveLength(1); // token 1 has been sent once and is not sent again
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-newer', '3') }));
    answerFirst.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expect(await first).toMatchObject({ kind: 'ok', session: { refreshToken: refreshToken('2') } });
    expect(await second).toMatchObject({ kind: 'ok', session: { refreshToken: refreshToken('3') } });
    const sent = callsOf('POST /v1/session/refresh').map(([, init]) => JSON.parse(String((init as RequestInit).body)).refresh_token);
    expect(sent).toEqual([refreshToken('1'), refreshToken('2')]);
    await settle();
    expect(stored()).toEqual({ access: accessToken('x-newer'), refresh: refreshToken('3'), expires: true, userId: 'user-x' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
  });
});

describe('a refresh answer that arrives after something else has changed the session', () => {
  it('R10. a check for another person stores its session during a refresh: the refresh\'s new pair is not written over it', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const answerY = expectCall('POST /v1/otp/verify');
    const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12'); // begins before the refresh, as in the sequence of backlog A14
    const refreshing = refreshCentralSession();
    await settle(); // the refresh has read person X's token and sent it
    expect(callsOf('POST /v1/session/refresh')).toHaveLength(1);
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await checkY).toMatchObject({ ok: true, user: { id: 'user-y' } });
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    const outcome = await refreshing;
    await settle();
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(outcome).toMatchObject({ kind: 'unavailable', failure: { code: 'session_ended' } });
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
  });

  it('R11. the check\'s own store write fails and is undone during a refresh: the refresh\'s new pair is not written into the empty store', async () => {
    await signedInAsX(30);
    const answerY = expectCall('POST /v1/otp/verify');
    const hold = holdWrite(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('y-a'));
    const check = verifyCentralCode(PHONE_Y, '111111', '2025-12');
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle(); // the refresh has read person X's token and sent it
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-a', 'a') }));
    await hold.reached.promise; // the check is inside its store operation
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    await settle(); // the refresh's write waits behind the check's store operation
    hold.gate.reject(new Error('keystore'));
    expect(await check).toMatchObject({ ok: false, code: 'failed' });
    const outcome = await refreshing;
    await settle();
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect(outcome).toMatchObject({ kind: 'unavailable', failure: { code: 'session_ended' } });
  });

  it('R12. sign-out during a refresh: the answer is not written, the store stays empty', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle();
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    await signOutCentral();
    expect(getCentralState().status).toBe('signedOut');
    expect([...secure.keys()]).toEqual([]);
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expect(await refreshing).toMatchObject({ kind: 'unavailable', failure: { code: 'session_ended' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });

  it('R12b. sign-out while the refresh\'s pair is being written: the store is empty afterwards', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const hold = holdWrite(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('x-new'));
    const refreshing = refreshCentralSession();
    await settle();
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    await hold.reached.promise; // inside the write of the new pair
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    const leaving = signOutCentral();
    hold.gate.resolve();
    await leaving;
    await refreshing;
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });
});

describe('a profile answer that arrives after something else has changed the session', () => {
  it('R13. a check for another person stores its session while the profile is read: the answer for the first person is not kept', async () => {
    await signedInAsX(600);
    const answerY = expectCall('POST /v1/otp/verify');
    const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12');
    const answerMe = expectCall('GET /v1/me');
    const profile = fetchCentralProfile();
    await settle(); // the profile call has read X's access token and is on its way
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await checkY).toMatchObject({ ok: true, user: { id: 'user-y' } });
    answerMe.resolve(reply(200, { user: { ...USER_X, name: 'Asha' } }));
    expect(await profile).toMatchObject({ ok: true, user: { id: 'user-x' } }); // what the service answered is still handed back
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y', name: null } });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
    expect(JSON.parse(secure.get(CENTRAL_SECURE_KEYS.USER) as string)).toMatchObject({ id: 'user-y', name: null });
  });

  it('R14. sign-out while the profile is read: the answer is not written, the store stays empty', async () => {
    await signedInAsX(600);
    const answerMe = expectCall('GET /v1/me');
    const profile = fetchCentralProfile();
    await settle();
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    await signOutCentral();
    answerMe.resolve(reply(200, { user: { ...USER_X, name: 'Asha' } }));
    expect(await profile).toMatchObject({ ok: true });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });

  it('R15. the same person\'s profile answer is kept in the state and the store, after a failing check began meanwhile', async () => {
    await signedInAsX(600);
    const answerMe = expectCall('GET /v1/me');
    const profile = fetchCentralProfile();
    await settle();
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12');
    answerB.resolve(wrongCode());
    await checkB;
    answerMe.resolve(reply(200, { user: { ...USER_X, name: 'Asha' } }));
    expect(await profile).toMatchObject({ ok: true });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x', name: 'Asha' } });
    expect(JSON.parse(secure.get(CENTRAL_SECURE_KEYS.USER) as string)).toMatchObject({ id: 'user-x', name: 'Asha' });
  });
});

describe('the start-up read and what it finds', () => {
  const KEYS = CENTRAL_SECURE_KEYS;
  const goodUser = JSON.stringify({ id: 'user-x', phoneNumber: '919000000001', name: null, createdAt: '' });
  const completeTokens = (): Record<string, string> => ({
    [KEYS.ACCESS_TOKEN]: accessToken('x-old'),
    [KEYS.REFRESH_TOKEN]: refreshToken('1'),
    [KEYS.ACCESS_EXPIRES]: String(Date.now() + 600000),
  });
  const put = (values: Record<string, string>) => { for (const [key, value] of Object.entries(values)) secure.set(key, value); };
  const deletedKeys = () => jest.mocked(SecureStore.deleteItemAsync).mock.calls.map(call => call[0]).sort();

  beforeEach(() => {
    jest.mocked(SecureStore.deleteItemAsync).mockClear();
    jest.mocked(SecureStore.setItemAsync).mockClear();
  });

  it.each([
    ['only the access token', { [KEYS.ACCESS_TOKEN]: accessToken('x-old') }],
    ['only the refresh token', { [KEYS.REFRESH_TOKEN]: refreshToken('1') }],
    ['only the expiry', { [KEYS.ACCESS_EXPIRES]: String(Date.now() + 600000) }],
    ['the access and the refresh token, no expiry', { [KEYS.ACCESS_TOKEN]: accessToken('x-old'), [KEYS.REFRESH_TOKEN]: refreshToken('1') }],
    ['the tokens and an expiry that is not a number', { ...completeTokens(), [KEYS.ACCESS_EXPIRES]: 'junk' }],
  ])('R17. an incomplete token set and no user (%s): all four keys are removed at start, and the person is signed out', async (_name, values) => {
    put(values);
    await restoreCentralSession();
    expect(deletedKeys()).toEqual([KEYS.ACCESS_EXPIRES, KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER].sort());
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('R18. a user without a session is removed at start (all four keys), and the person is signed out', async () => {
    put({ [KEYS.USER]: goodUser });
    await restoreCentralSession();
    expect(deletedKeys()).toEqual([KEYS.ACCESS_EXPIRES, KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER].sort());
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it.each([
    ['text that is not JSON', '{broken'],
    ['JSON without an id', JSON.stringify({ phoneNumber: '919000000001' })],
  ])('R19. a complete session with a user that cannot be read (%s) is removed at start', async (_name, userText) => {
    put({ ...completeTokens(), [KEYS.USER]: userText });
    await restoreCentralSession();
    expect(deletedKeys()).toEqual([KEYS.ACCESS_EXPIRES, KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER].sort());
    expect([...secure.keys()]).toEqual([]);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('R20. a good session is kept at start: nothing is deleted or written', async () => {
    put({ ...completeTokens(), [KEYS.USER]: goodUser });
    await restoreCentralSession();
    expect(jest.mocked(SecureStore.deleteItemAsync)).not.toHaveBeenCalled();
    expect(jest.mocked(SecureStore.setItemAsync)).not.toHaveBeenCalled();
    expect([...secure.keys()].sort()).toEqual(Object.values(KEYS).sort());
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
  });

  it('R21. nothing stored: nothing is deleted or written at start', async () => {
    await restoreCentralSession();
    expect(jest.mocked(SecureStore.deleteItemAsync)).not.toHaveBeenCalled();
    expect(jest.mocked(SecureStore.setItemAsync)).not.toHaveBeenCalled();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('R22. the leftover is removed inside the operation that read it: before the session a check stores after that read', async () => {
    put({ [KEYS.USER]: JSON.stringify({ id: 'user-old', phoneNumber: '919000000009', name: null, createdAt: '' }) });
    const answerA = expectCall('POST /v1/otp/verify');
    const checkA = verifyCentralCode(PHONE_X, '111111', '2025-12');
    readGate = { gate: deferred<void>(), reached: deferred<void>() };
    const held = readGate;
    const restoring = restoreCentralSession();
    await held.reached.promise; // the start-up read is inside its queued operation
    answerA.resolve(reply(200, { user: USER_X, session: sessionOf('x-a', 'a') }));
    await settle(); // the check's write waits behind the read
    held.gate.resolve();
    await restoring;
    expect(await checkA).toMatchObject({ ok: true, user: { id: 'user-x' } });
    await settle();
    // Every key was deleted by the start-up read before the first write of the check.
    const firstWrite = Math.min(...jest.mocked(SecureStore.setItemAsync).mock.invocationCallOrder);
    const deletedBefore = jest.mocked(SecureStore.deleteItemAsync).mock.calls
      .filter((_call, index) => jest.mocked(SecureStore.deleteItemAsync).mock.invocationCallOrder[index] < firstWrite)
      .map(call => call[0]);
    // (The check's own write deletes the expiry key first, so that key may appear twice.)
    expect([...new Set(deletedBefore)].sort()).toEqual([KEYS.ACCESS_EXPIRES, KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER].sort());
    expect(stored()).toEqual({ access: accessToken('x-a'), refresh: refreshToken('a'), expires: true, userId: 'user-x' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
  });

  it('R23. a leftover is not removed when a sign-in has begun since the start: that sign-in decides what the store holds', async () => {
    put({ [KEYS.USER]: JSON.stringify({ id: 'user-old', phoneNumber: '919000000009', name: null, createdAt: '' }) });
    readGate = { gate: deferred<void>(), reached: deferred<void>() };
    const held = readGate;
    const restoring = restoreCentralSession();
    await held.reached.promise; // the start-up read is inside its queued operation, the start has an epoch
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12'); // a sign-in begins: the epoch moves
    held.gate.resolve();
    await restoring;
    await settle();
    expect(jest.mocked(SecureStore.deleteItemAsync)).not.toHaveBeenCalled();
    expect(secure.has(KEYS.USER)).toBe(true);
    expect(getCentralState().status).not.toBe('signedIn');
    answerB.resolve(wrongCode());
    expect(await checkB).toMatchObject({ ok: false, code: 'invalid_code' });
  });
});

/** The label of the access token each request carried (its `sub` names the person). */
const bearerOf = (call: unknown[]) =>
  JSON.parse(Buffer.from(String(((call[1] as RequestInit).headers as Record<string, string>).Authorization).split('.')[1], 'base64url').toString()).label as string;
const deleteBearers = () => callsOf('DELETE /v1/me').map(bearerOf);

/** The next read of `key` fails once; every other read is the ordinary one. The returned function disarms a failure not used yet. */
function failNextRead(key: string) {
  const ordinary = jest.mocked(SecureStore.getItemAsync).getMockImplementation() as (key: string) => Promise<string | null>;
  let armed = true;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async k => {
    if (armed && k === key) {
      armed = false;
      throw new Error('keystore');
    }
    return ordinary(k);
  });
  return () => {
    armed = false;
  };
}

describe('an account deletion while a check for another person is answered (person X deletes, person Y signs in)', () => {
  // The deletion acts on the person whose token it sends and the caller removes the list of the
  // person it named: a request with Y's token, with X named, deletes the wrong account.
  it.each([
    ['R24a. fresh token: the check is stored after the deletion\'s 1st store read', 1],
    ['R24b. fresh token: the check is stored after the deletion\'s 4th store read (the last one that looks at who is stored)', 4],
  ])('%s: no DELETE carries Y\'s token', async (_name, after) => {
    await signedInAsX(600);
    const answerY = expectCall('POST /v1/otp/verify');
    const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12'); // begins now; its answer comes later
    await settle();
    readHold = { after, seen: 0, gate: deferred<void>(), reached: deferred<void>() };
    const hold = readHold;
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    const deleting = deleteCentralAccount(); // memory says X
    await hold.reached.promise;
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    await settle(); // Y's store operation waits behind the deletion's
    hold.gate.resolve();
    await checkY; // a deletion that ends the session after Y's check began overtakes it, as a sign-out does
    await deleting;
    await settle();
    // Either no request, or X's: never Y's.
    expect(deleteBearers().filter(label => label !== 'x-old')).toEqual([]);
  });

  it('R25. expiring token, a slow refresh of X in flight: the check for Y is stored while the deletion waits for it, and the refresh then serves Y: no DELETE is sent', async () => {
    await signedInAsX(30);
    const answerR1 = expectCall('POST /v1/session/refresh');
    void refreshCentralSession(); // a call of X is refreshing on a slow network
    await settle();
    const answerY = expectCall('POST /v1/otp/verify');
    const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12');
    await settle();
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('y-c', 'c') })); // the one that runs for whoever is stored by then
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    const deleting = deleteCentralAccount(); // memory says X, the store says X
    await settle();
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await checkY).toMatchObject({ ok: true, user: { id: 'user-y' } });
    await settle();
    answerR1.resolve(reply(200, { session: sessionOf('x-new', '2') })); // the slow refresh answers seconds later
    const result = await deleting;
    await settle();
    expect(deleteBearers().filter(label => label !== 'x-old' && label !== 'x-new')).toEqual([]);
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    // Nothing of Y's was ended or touched by the refused deletion.
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored().userId).toBe('user-y');
    expect(callsOf('DELETE /v1/me')).toHaveLength(0);
  });

  it('R26. a deletion answered 401 looks again: Y was stored meanwhile, so it does not send again with Y\'s token', async () => {
    await signedInAsX(600);
    const answerDelete = expectCall('DELETE /v1/me');
    const deleting = deleteCentralAccount(); // X's token is on its way
    await settle();
    const answerY = expectCall('POST /v1/otp/verify');
    const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12');
    answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await checkY).toMatchObject({ ok: true });
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true })); // would answer a second request
    answerDelete.resolve(reply(401, { error: { code: 'invalid_token', message: 'x' } }));
    expect(await deleting).toMatchObject({ ok: false, code: 'failed' });
    await settle();
    expect(deleteBearers()).toEqual(['x-old']);
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
  });

  it('R27. nothing changes for one person: a deletion with an expiring token refreshes first and deletes with the NEW token, then signs out', async () => {
    await signedInAsX(30);
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    expect(await deleteCentralAccount()).toEqual({ ok: true, userId: 'user-x' });
    await settle();
    expect(deleteBearers()).toEqual(['x-new']);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });

  it('R28. nothing changes for one person: a deletion answered 401 refreshes once and sends again with the NEW token', async () => {
    await signedInAsX(600);
    expectCall('DELETE /v1/me').resolve(reply(401, { error: { code: 'invalid_token', message: 'x' } }));
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    expect(await deleteCentralAccount()).toEqual({ ok: true, userId: 'user-x' });
    expect(deleteBearers()).toEqual(['x-old', 'x-new']);
    expect(getCentralState().status).toBe('signedOut');
  });

  it('R29. the stored user cannot be read: nothing is sent and the answer says the store is unavailable', async () => {
    await signedInAsX(600);
    failNextRead(CENTRAL_SECURE_KEYS.USER);
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    expect(await deleteCentralAccount()).toMatchObject({ ok: false, code: 'unavailable' });
    expect(callsOf('DELETE /v1/me')).toHaveLength(0);
    expect(getCentralState().status).toBe('signedIn');
  });
});

describe('a refresh that waits behind another one and begins late', () => {
  // A slow refresh is in flight, the person signs out, and a signed call started in the same
  // moment makes a second refresh wait for the first. The waiter begins when the first ends,
  // under the epoch then current, and finds the store empty: that is no session of anybody to
  // end, and it must not end the sign-in that has begun meanwhile.
  async function slowRefreshThenSignOut() {
    await signedInAsX(30);
    const answerR1 = expectCall('POST /v1/session/refresh');
    const p1 = fetchCentralProfile(); // needs a token: refresh 1 sends token 1 on a slow network
    await settle();
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    const leaving = signOutCentral();
    const p2 = fetchCentralProfile(); // started in the same moment as the sign-out: its refresh waits
    await leaving;
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
    return { answerR1, p1, p2 };
  }

  it('R30. the person signs in again while the check is on its way: the slow answer arrives, and the right code then signs in', async () => {
    const { answerR1, p1, p2 } = await slowRefreshThenSignOut();
    setCentralState({ signInPhone: PHONE_X }); // the person is on the code step
    const answerV = expectCall('POST /v1/otp/verify');
    const check = verifyCentralCode(PHONE_X, '111111', '2025-12');
    await settle();
    answerR1.resolve(reply(200, { session: sessionOf('x-new', '2') })); // the slow answer arrives now; the waiter then begins
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', signInPhone: PHONE_X });
    answerV.resolve(reply(200, { user: USER_X, session: sessionOf('x-b', 'b') }));
    expect(await check).toMatchObject({ ok: true, user: { id: 'user-x' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expect(stored()).toEqual({ access: accessToken('x-b'), refresh: refreshToken('b'), expires: true, userId: 'user-x' });
    expect(await p1).toMatchObject({ ok: false, code: 'session_ended' });
    expect(await p2).toMatchObject({ ok: false, code: 'session_ended' });
  });

  it('R31. the person is on the code step and has not sent the code yet: the waiter leaves the phone number alone', async () => {
    const { answerR1, p1, p2 } = await slowRefreshThenSignOut();
    setCentralState({ signInPhone: PHONE_X });
    answerR1.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', signInPhone: PHONE_X });
    expect(await p1).toMatchObject({ ok: false, code: 'session_ended' });
    expect(await p2).toMatchObject({ ok: false, code: 'session_ended' });
  });

  it('R32. a call in flight at sign-out is answered 401 while the next check is on its way: it does not end that sign-in', async () => {
    await signedInAsX(600);
    const answerMe = expectCall('GET /v1/me');
    const p1 = fetchCentralProfile(); // slow network, fresh token
    await settle();
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    await signOutCentral();
    await settle();
    setCentralState({ signInPhone: PHONE_X });
    const answerV = expectCall('POST /v1/otp/verify');
    const check = verifyCentralCode(PHONE_X, '111111', '2025-12');
    await settle();
    answerMe.resolve(reply(401, { error: { code: 'invalid_token', message: 'x' } })); // the sign-out revoked the family
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', signInPhone: PHONE_X });
    answerV.resolve(reply(200, { user: USER_X, session: sessionOf('x-b', 'b') }));
    expect(await check).toMatchObject({ ok: true });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expect(await p1).toMatchObject({ ok: false, code: 'session_ended' });
  });

  it('R33. nothing changes when memory still says signed in: a refresh that finds the store empty ends the session', async () => {
    await signedInAsX(30);
    secure.clear(); // the store was emptied behind the app's back
    expect(await refreshCentralSession()).toMatchObject({ kind: 'refused' });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect(callsOf('POST /v1/session/refresh')).toHaveLength(0);
  });
});

describe('one failed read of the stored refresh token when the refresh answer arrives', () => {
  it('R34. the read throws once: the person stays signed in and the store holds the NEW pair', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle(); // token 1 has been sent
    failNextRead(CENTRAL_SECURE_KEYS.REFRESH_TOKEN);
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    const outcome = await refreshing;
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' }, endedMessage: null });
    expect(stored()).toEqual({ access: accessToken('x-new'), refresh: refreshToken('2'), expires: true, userId: 'user-x' });
    expect(outcome).toMatchObject({ kind: 'ok', session: { refreshToken: refreshToken('2') } });
    // The next refresh presents the NEW token: the service has no reason to call it a reuse.
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-newer', '3') }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'ok' });
    const sent = callsOf('POST /v1/session/refresh').map(([, init]) => JSON.parse(String((init as RequestInit).body)).refresh_token);
    expect(sent).toEqual([refreshToken('1'), refreshToken('2')]);
  });

  it('R35. the read throws once and a check began meanwhile but wrote nothing: the new pair is kept', async () => {
    // The epoch cannot tell "a check began and failed" from "a check stored another person";
    // what is stored can: nothing was written or cleared since this refresh read the store.
    // Dropping the pair would keep a token the service has already replaced, and the next
    // refresh would be a reuse that signs the person out (R9, R34).
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle();
    const answerB = expectCall('POST /v1/otp/verify');
    const checkB = verifyCentralCode(PHONE_X, '222222', '2025-12'); // moves the epoch; fails below
    answerB.resolve(wrongCode());
    await checkB;
    failNextRead(CENTRAL_SECURE_KEYS.REFRESH_TOKEN);
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expect(await refreshing).toMatchObject({ kind: 'ok', session: { refreshToken: refreshToken('2') } });
    await settle();
    expect(stored()).toEqual({ access: accessToken('x-new'), refresh: refreshToken('2'), expires: true, userId: 'user-x' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-newer', '3') }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'ok' });
    const sent = callsOf('POST /v1/session/refresh').map(([, init]) => JSON.parse(String((init as RequestInit).body)).refresh_token);
    expect(sent).toEqual([refreshToken('1'), refreshToken('2')]);
  });
});

/** Every deletion of `keys` (of every key when none are named) throws until the returned function is called. */
function failDeletes(keys?: string[]) {
  const ordinary = jest.mocked(SecureStore.deleteItemAsync).getMockImplementation() as (key: string) => Promise<void>;
  let armed = true;
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async k => {
    if (armed && (!keys || keys.includes(k))) throw new Error('keystore');
    return ordinary(k);
  });
  return () => {
    armed = false;
  };
}

/** The review's schedule: X's refresh has sent its token, then a check for Y stores Y's session. */
async function refreshOfXOvertakenByY() {
  await signedInAsX(30);
  const answerRefresh = expectCall('POST /v1/session/refresh');
  const answerY = expectCall('POST /v1/otp/verify');
  const checkY = verifyCentralCode(PHONE_Y, '111111', '2025-12'); // begins before the refresh
  const refreshing = refreshCentralSession();
  await settle(); // the refresh has read person X's token and sent it
  expect(callsOf('POST /v1/session/refresh')).toHaveLength(1);
  answerY.resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
  expect(await checkY).toMatchObject({ ok: true, user: { id: 'user-y' } });
  return { answerRefresh, refreshing };
}

describe('a refresh of X answered after Y was stored, under the same epoch (external review R1, R7)', () => {
  it('R36. the read of the stored refresh token throws once: X\'s new pair is not written over Y\'s, and a deletion as Y carries Y\'s token', async () => {
    const { answerRefresh, refreshing } = await refreshOfXOvertakenByY();
    const disarm = failNextRead(CENTRAL_SECURE_KEYS.REFRESH_TOKEN);
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    expect(await refreshing).toMatchObject({ kind: 'unavailable', failure: { code: 'session_ended' } });
    // (The refresh may decide without that read; a failure it did not use is not left for the deletion.)
    disarm();
    await settle();
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true }));
    expect(await deleteCentralAccount()).toEqual({ ok: true, userId: 'user-y' });
    expect(deleteBearers()).toEqual(['y-b']);
  });

  it('R36b. X\'s token pair stored under Y\'s user: no deletion and no facility token is asked with X\'s token for Y', async () => {
    // The state the R1 fault left behind, put in place directly (a start would now clear it, R40).
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('x-new'));
    secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, refreshToken('2'));
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(Date.now() + 600000));
    secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'user-y', phoneNumber: '919000000002', name: null, createdAt: '' }));
    setCentralState({ status: 'signedIn', user: { id: 'user-y', phoneNumber: '919000000002', name: null, createdAt: '' } });
    expectCall('DELETE /v1/me').resolve(reply(200, { ok: true })); // would answer a request, if one were sent
    expectCall('POST /v1/facility-token').resolve(reply(200, { identity_token: 'facility-token-1' }));
    expect(await deleteCentralAccount()).toMatchObject({ ok: false, code: 'failed' });
    expect(callsOf('DELETE /v1/me')).toHaveLength(0);
    expect(await requestFacilityToken('https://north-cold.example.test', 'user-y')).toMatchObject({ ok: false, code: 'failed' });
    expect(callsOf('POST /v1/facility-token')).toHaveLength(0);
  });

  it('R37. X\'s refresh is refused (401): Y\'s session is not ended, Y\'s phone number stays, and the next start is Y', async () => {
    setCentralState({ signInPhone: PHONE_Y });
    const { answerRefresh, refreshing } = await refreshOfXOvertakenByY();
    answerRefresh.resolve(reply(401, { error: { code: 'invalid_refresh_token', message: 'x' } }));
    expect(await refreshing).toMatchObject({ kind: 'unavailable', failure: { code: 'session_ended' } });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' }, signInPhone: PHONE_Y, endedMessage: null });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
  });

  it('R37b. nothing changes for one person: a refusal of the stored token itself still ends the session', async () => {
    await signedInAsX(30);
    expectCall('POST /v1/session/refresh').resolve(reply(401, { error: { code: 'invalid_refresh_token', message: 'x' } }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'refused' });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect(getCentralState().endedMessage).toBeTruthy();
    expect([...secure.keys()]).toEqual([]);
  });
});

describe('a sign-out whose deletions fail (external review R3)', () => {
  it('R38. every deletion fails and the service cannot be reached: sign-out says so, and the next start does not sign the person back in', async () => {
    await signedInAsX(600);
    const disarm = failDeletes();
    // No answer is queued for POST /v1/session/signout: the request fails as without a connection.
    expect(await signOutCentral()).toBe(false);
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect(stored()).toEqual({ access: accessToken('x-old'), refresh: refreshToken('1'), expires: true, userId: 'user-x' });
    expect(secure.has(CENTRAL_SIGNED_OUT_KEY)).toBe(true);
    disarm();
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });

  it('R38b. one deletion fails once: it is tried again, and sign-out succeeds with an empty store', async () => {
    await signedInAsX(600);
    const ordinary = jest.mocked(SecureStore.deleteItemAsync).getMockImplementation() as (key: string) => Promise<void>;
    let failures = 1;
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async k => {
      if (k === CENTRAL_SECURE_KEYS.REFRESH_TOKEN && failures > 0) {
        failures -= 1;
        throw new Error('keystore');
      }
      return ordinary(k);
    });
    expectCall('POST /v1/session/signout').resolve(reply(200, { ok: true }));
    expect(await signOutCentral()).toBe(true);
    expect([...secure.keys()]).toEqual([]);
  });

  it('R38c. after a sign-out whose deletions failed, a refresh does not send the ended session\'s token or replace its pair: the next start is signed out', async () => {
    // Found by the fault seeds of the fuzz: a pair replaced after the failed clear no longer
    // matches the marker, and the next start would sign the person back in.
    await signedInAsX(30);
    const disarm = failDeletes();
    expect(await signOutCentral()).toBe(false);
    disarm();
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-new', '2') })); // would answer, if asked
    expect(await refreshCentralSession()).toMatchObject({ kind: 'refused' });
    expect(callsOf('POST /v1/session/refresh')).toHaveLength(0);
    expect(stored().refresh).toBe(refreshToken('1'));
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });

  it('R39. deletions failed at sign-out, then Y signs in: the next start is Y', async () => {
    await signedInAsX(600);
    const disarm = failDeletes();
    await signOutCentral();
    disarm();
    expectCall('POST /v1/otp/verify').resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await verifyCentralCode(PHONE_Y, '111111', '2025-12')).toMatchObject({ ok: true, user: { id: 'user-y' } });
    await settle();
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored()).toEqual({ access: accessToken('y-b'), refresh: refreshToken('b'), expires: true, userId: 'user-y' });
  });

  it('R40. a whole token set of X stored under Y\'s user at start is a leftover: removed, and the person is signed out', async () => {
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, accessToken('x-new'));
    secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, refreshToken('2'));
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(Date.now() + 600000));
    secure.set(CENTRAL_SECURE_KEYS.USER, JSON.stringify({ id: 'user-y', phoneNumber: '919000000002', name: null, createdAt: '' }));
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
    expect([...secure.keys()]).toEqual([]);
  });
});

/** The second read of the refresh-token key from now throws (signOutCentral's own read is the first; clearEnded's is the second). */
function failSecondRefreshTokenRead() {
  const ordinary = jest.mocked(SecureStore.getItemAsync).getMockImplementation() as (key: string) => Promise<string | null>;
  let reads = 0;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async k => {
    if (k === CENTRAL_SECURE_KEYS.REFRESH_TOKEN && (reads += 1) === 2) throw new Error('keystore');
    return ordinary(k);
  });
}

describe('the sign-out marker after the review of central-b4', () => {
  it('M1. a refresh in flight, then a sign-out whose deletions all fail, then the refresh answers: the pair is not written and the next start is signed out', async () => {
    await signedInAsX(30);
    const answerRefresh = expectCall('POST /v1/session/refresh');
    const refreshing = refreshCentralSession();
    await settle(); // token 1 has been sent
    const disarm = failDeletes();
    expect(await signOutCentral()).toBe(false);
    disarm();
    answerRefresh.resolve(reply(200, { session: sessionOf('x-new', '2') }));
    await refreshing;
    await settle();
    expect(stored().refresh).toBe(refreshToken('1'));
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedOut', user: null });
  });

  it('M3. a `*` marker left by a failed sign-out, then a sign-in: the first refresh keeps that person', async () => {
    await signedInAsX(600);
    const disarm = failDeletes();
    failSecondRefreshTokenRead();
    expect(await signOutCentral()).toBe(false);
    expect(secure.get(CENTRAL_SIGNED_OUT_KEY)).toBe('*');
    disarm();
    expectCall('POST /v1/otp/verify').resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await verifyCentralCode(PHONE_Y, '111111', '2025-12')).toMatchObject({ ok: true });
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('y-c', 'c') }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'ok' });
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
  });

  it('B3. the same, and the sign-in cannot remove the `*` marker either: it is made one that matches nothing, and the first refresh keeps that person', async () => {
    await signedInAsX(600);
    const disarm = failDeletes();
    failSecondRefreshTokenRead();
    expect(await signOutCentral()).toBe(false);
    expect(secure.get(CENTRAL_SIGNED_OUT_KEY)).toBe('*');
    disarm();
    const disarmMarker = failDeletes([CENTRAL_SIGNED_OUT_KEY]);
    expectCall('POST /v1/otp/verify').resolve(reply(200, { user: USER_Y, session: sessionOf('y-b', 'b') }));
    expect(await verifyCentralCode(PHONE_Y, '111111', '2025-12')).toMatchObject({ ok: true });
    disarmMarker();
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('y-c', 'c') }));
    expect(await refreshCentralSession()).toMatchObject({ kind: 'ok' });
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
    expect(stored()).toEqual({ access: accessToken('y-c'), refresh: refreshToken('c'), expires: true, userId: 'user-y' });
    expect(secure.get(CENTRAL_SIGNED_OUT_KEY)).not.toBe('*');
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-y' } });
  });

  it('L3. a read of the marker that fails decides nothing: the refresh answers unavailable, sends nothing and keeps the session', async () => {
    await signedInAsX(30);
    failNextRead(CENTRAL_SIGNED_OUT_KEY);
    expectCall('POST /v1/session/refresh').resolve(reply(200, { session: sessionOf('x-new', '2') })); // would answer, if asked
    expect(await refreshCentralSession()).toMatchObject({ kind: 'unavailable', failure: { code: 'unavailable' } });
    expect(callsOf('POST /v1/session/refresh')).toHaveLength(0);
    await settle();
    expect(getCentralState()).toMatchObject({ status: 'signedIn', user: { id: 'user-x' } });
    expect(stored().refresh).toBe(refreshToken('1'));
  });
});
