/**
 * The central session when two things use the secure store at once: a code check
 * overtaken by a newer check or by a sign-out, a check whose store write fails,
 * and a start-up read that finds a leftover. In each case the store, the
 * in-memory state and the next start must agree. Every wait is held open by the
 * test, so the order of events is fixed (no timers).
 */
import * as SecureStore from 'expo-secure-store';
import {
  CENTRAL_SECURE_KEYS,
  refreshCentralSession,
  resetCentralSessionForTests,
  restoreCentralSession,
  signOutCentral,
  verifyCentralCode,
} from '../centralSession';
import { getCentralState, resetCentralStateForTests } from '../centralState';

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
  `${b64url({ alg: 'ES256', typ: 'central-access+jwt' })}.${b64url({ iss: ORIGIN, sub: label, iat: ISSUED_AT, exp: ISSUED_AT + 900, label })}.signature`;
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

/** Queued answers of the service, by `METHOD path`, each one a promise the test resolves. */
let pending: Record<string, Deferred<ReturnType<typeof reply>>[]> = {};
function expectCall(key: string) {
  const d = deferred<ReturnType<typeof reply>>();
  (pending[key] ??= []).push(d);
  return d;
}

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

  // Backlog A9: not fixed in this round, it needs its own decision (the test body is kept with the backlog material).
  it.todo('R9. a code check that fails during a refresh does not lose the new token pair');
});
