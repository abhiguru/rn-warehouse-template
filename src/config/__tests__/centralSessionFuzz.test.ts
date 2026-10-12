/**
 * The central session under random interleavings, against a stand-in for the identity
 * service whose refresh tokens work exactly once (a second presentation revokes the whole
 * family, as the real service does).
 *
 * Every secure-store call and every network call waits until the test lets it go, in an
 * order a seeded random generator picks; between those steps the test starts code checks
 * (right and wrong), refreshes, profile reads, sign-outs, account deletions and restore
 * retries. When everything has settled, the in-memory state and the store must agree, and
 * the next start must read the same picture. The seeds are a FIXED list: a failure names the
 * seed and prints the shortest trace of its kind, and the same seed gives the same run.
 *
 * Two more checks pin the account deletion and the sign-in: every DELETE request carries the
 * token of the person whose deletion was asked for (the person the app named when it began;
 * a request with anybody else's token is a fault, no request is not), and when the last step
 * of a run that checks a code, signs out or deletes is a right code, that person ends signed
 * in. (Not when a sign-out or a deletion begun earlier was still running as that code was
 * checked: its own ending of the session may legitimately come after the sign-in.)
 *
 * Most runs start signed in as person 1: the faults of the refresh and profile writes need
 * a code check while somebody is already signed in. A second list of seeds starts from a
 * random, often broken, set of stored keys: after the start the store must hold either a whole
 * good session or nothing at all.
 */
import * as SecureStore from 'expo-secure-store';
import {
  CENTRAL_SECURE_KEYS,
  deleteCentralAccount,
  fetchCentralProfile,
  refreshCentralSession,
  resetCentralSessionForTests,
  restoreCentralSession,
  retryCentralRestoreIfNeeded,
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

/** The fixed list of seeds: 5,000 runs of 40 steps each. */
const SEEDS: readonly number[] = Array.from({ length: 5000 }, (_, index) => index + 1);
/** Seeds that start from a random, often broken, set of stored keys. */
const BROKEN_START_SEEDS: readonly number[] = Array.from({ length: 2500 }, (_, index) => index + 1);
const STEPS = 40;
/** The chance that a step starts a new operation when something is waiting to be let go. */
const START_PROBABILITY = 0.3;
const PHONES = ['919000000001', '919000000002'] as const;
/**
 * What a step may start; a name listed twice is started twice as often. Code checks and
 * refreshes are the common steps, because the faults need a check while somebody is
 * already signed in and a refresh in flight.
 */
type Operation = 'verifyOk' | 'verifyBad' | 'signOut' | 'delete' | 'profile' | 'refresh' | 'retryRestore';
const OPERATIONS: readonly Operation[] = ['verifyOk', 'verifyOk', 'verifyBad', 'signOut', 'delete', 'profile', 'refresh', 'refresh', 'retryRestore'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const claimsOf = (token: string): { fam?: unknown } | null => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

// ----- the stand-in service ------------------------------------------------------------
type Family = { id: number; userId: string; current: string; revoked: boolean };
let rng: () => number = Math.random;
let families: Family[] = [];
let tokenFamily = new Map<string, number>();
let deletedUsers = new Set<string>();
let issued = 0;
/** Every refresh token the app has stored, as the store saw it. */
let everStored = new Set<string>();
let reuseEvents: string[] = [];
let oldAfterNewerStored: string[] = [];
/** The deletion that is running, and the person the app named when it began (null: nobody). */
let deleteRunning: { expected: string | null } | null = null;
let deleteComplaints: { nobody: boolean; text: string }[] = [];
/**
 * The last code check, sign-out or deletion that was started, for the last-right-code check;
 * `clean` is true for a code check that began while no sign-out and no deletion was running.
 */
let lastStep: { label: string; user: string; clean: boolean } | null = null;
let endersRunning = 0;
/** How often the two checks had something to look at, over a sweep (so they cannot pass by looking at nothing). */
const looked = { deleteRequests: 0, lastRightCode: 0 };

type StandInReply = { ok: boolean; status: number; url: string; headers: { get: () => null }; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): StandInReply => ({ ok: status >= 200 && status < 300, status, url: '', headers: { get: () => null }, json: async () => body });
const refused = (code: string) => reply(401, { error: { code, message: 'x' } });
const userOf = (userId: string) => ({ id: userId, phone_number: userId.replace('user-', ''), name: null, created_at: '' });

function newSession(family: Family) {
  issued += 1;
  const iat = Math.floor(Date.now() / 1000);
  const life = rng() < 0.5 ? 30 : 900;
  const refresh = `r${issued}`.padEnd(64, 'x');
  family.current = refresh;
  tokenFamily.set(refresh, family.id);
  return {
    access_token: `${b64url({ alg: 'ES256' })}.${b64url({ fam: family.id, n: issued, iat, exp: iat + life })}.sig`,
    refresh_token: refresh,
  };
}

function newFamily(userId: string): Family {
  const family: Family = { id: families.length, userId, current: '', revoked: false };
  families.push(family);
  return family;
}

function serve(method: string, path: string, body: Record<string, unknown> | null, bearer: string | null): StandInReply {
  if (method === 'POST' && path === '/v1/otp/verify') {
    if (body?.otp_code !== '111111') return refused('invalid_code');
    const userId = `user-${String(body.phone_number)}`;
    deletedUsers.delete(userId);
    return reply(200, { user: userOf(userId), session: newSession(newFamily(userId)) });
  }
  if (method === 'POST' && path === '/v1/session/refresh') {
    const token = String(body?.refresh_token);
    const id = tokenFamily.get(token);
    if (id === undefined) return refused('invalid_refresh_token');
    const family = families[id];
    if (family.revoked) return refused('invalid_refresh_token');
    if (family.current !== token) {
      family.revoked = true;
      reuseEvents.push(`family ${id} of ${family.userId}`);
      if (everStored.has(family.current))
        oldAfterNewerStored.push(`${token.replace(/x+$/, '')} presented after ${family.current.replace(/x+$/, '')} was stored (family ${id})`);
      return refused('invalid_refresh_token');
    }
    return reply(200, { session: newSession(family) });
  }
  const claims = bearer ? claimsOf(bearer) : null;
  const family = claims && typeof claims.fam === 'number' ? families[claims.fam] : undefined;
  if (!family || family.revoked || deletedUsers.has(family.userId)) return refused('invalid_token');
  if (method === 'GET' && path === '/v1/me') return reply(200, { user: userOf(family.userId) });
  if (method === 'POST' && path === '/v1/session/signout') {
    family.revoked = true;
    return reply(200, { ok: true });
  }
  if (method === 'DELETE' && path === '/v1/me') {
    deletedUsers.add(family.userId);
    for (const other of families) if (other.userId === family.userId) other.revoked = true;
    return reply(200, { ok: true });
  }
  return reply(404, { error: { code: 'not_found', message: 'x' } });
}

// ----- waits the test lets go one by one -----------------------------------------------
type Held = { label: string; run: () => void };
let held: Held[] = [];
/** While true every wait is let go at once (the next start, after the run). */
let auto = false;
let trace: string[] = [];
function gate<T>(label: string, compute: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      try {
        resolve(compute());
      } catch (error) {
        reject(error);
      }
    };
    if (auto) run();
    else held.push({ label, run });
  });
}

const secure = new Map<string, string>();
const short = (key: string) => key.replace('secure_central_', '');
const originalFetch = global.fetch;
const flush = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise(resolve => setImmediate(resolve));
};

function install() {
  jest.mocked(SecureStore.getItemAsync).mockImplementation(key => gate(`get ${short(key)}`, () => secure.get(key) ?? null));
  jest.mocked(SecureStore.setItemAsync).mockImplementation((key, value) =>
    gate(`set ${short(key)}`, () => {
      secure.set(key, value);
      if (key === CENTRAL_SECURE_KEYS.REFRESH_TOKEN) everStored.add(value);
    })
  );
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(key => gate(`delete ${short(key)}`, () => void secure.delete(key)));
  global.fetch = ((url: string, init: RequestInit) => {
    const path = url.replace(ORIGIN, '');
    const method = String(init.method);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const bearer = ((init.headers as Record<string, string>).Authorization ?? '').replace('Bearer ', '') || null;
    const what = body?.otp_code
      ? ` [${body.otp_code === '111111' ? 'OK' : 'WRONG'} ${String(body.phone_number).slice(-1)}]`
      : body?.refresh_token
        ? ` [${String(body.refresh_token).replace(/x+$/, '')}]`
        : '';
    if (method === 'DELETE' && deleteRunning) {
      looked.deleteRequests += 1;
      const family = bearer ? claimsOf(bearer)?.fam : undefined;
      const owner = typeof family === 'number' ? (families[family]?.userId ?? null) : null;
      if (owner !== deleteRunning.expected)
        deleteComplaints.push({
          nobody: deleteRunning.expected === null,
          text: `asked while memory said ${deleteRunning.expected ?? 'signed out'}, sent with the token of ${owner ?? 'nobody known'}`,
        });
    }
    return gate(`net ${method} ${path}${what}`, () => {
      const answer = serve(method, path, body, bearer);
      trace.push(`    service ${method} ${path} -> ${answer.status}`);
      return answer;
    });
  }) as unknown as typeof fetch;
}

// ----- one run -------------------------------------------------------------------------
type Violation = { kind: string; seed: number; detail: string; trace: string[] };

type StartMode = 'usually-signed-in' | 'broken-keys';

/**
 * The start of the app. 'usually-signed-in': person 1 with an access token that is fresh or
 * within the minute before it is replaced. (An access token that has already expired is left
 * out on purpose: sign-out then sends its own refresh, with the token it read, outside the
 * one-at-a-time rule. That is the sign-out code, not part of what this test pins.)
 * 'broken-keys': each of the four keys is present or missing at random, and the expiry and the
 * user may be unreadable. `intact` is true when what is stored is a whole good session.
 */
function preload(mode: StartMode): { text: string; intact: boolean; anything: boolean } {
  if (mode === 'usually-signed-in' && rng() >= 0.75) return { text: 'nothing stored', intact: false, anything: false };
  const family = newFamily(`user-${PHONES[0]}`);
  const session = newSession(family);
  const goodUser = JSON.stringify({ id: family.userId, phoneNumber: PHONES[0], name: null, createdAt: '' });
  const lifetimes = [600000, 30000];
  const expiresIn = lifetimes[Math.floor(rng() * lifetimes.length)];
  if (mode === 'usually-signed-in') {
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, session.access_token);
    secure.set(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, session.refresh_token);
    secure.set(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(Date.now() + expiresIn));
    secure.set(CENTRAL_SECURE_KEYS.USER, goodUser);
    everStored.add(session.refresh_token);
    return { text: `signed in as person 1, access token expires in ${expiresIn / 1000} s`, intact: true, anything: true };
  }
  const pick = (values: string[]) => values[Math.floor(rng() * values.length)];
  const access = pick(['', session.access_token, session.access_token]);
  const refresh = pick(['', session.refresh_token, session.refresh_token]);
  const expires = pick(['', String(Date.now() + expiresIn), String(Date.now() + expiresIn), 'junk', '0']);
  const user = pick(['', goodUser, goodUser, '{broken', JSON.stringify({ phoneNumber: PHONES[0] })]);
  const chosen: [string, string][] = [
    [CENTRAL_SECURE_KEYS.ACCESS_TOKEN, access],
    [CENTRAL_SECURE_KEYS.REFRESH_TOKEN, refresh],
    [CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, expires],
    [CENTRAL_SECURE_KEYS.USER, user],
  ];
  for (const [key, value] of chosen) if (value !== '') secure.set(key, value);
  if (refresh) everStored.add(refresh);
  const intact = Boolean(access && refresh && Number(expires) > 0 && user === goodUser);
  return {
    text: chosen.map(([key, value]) => `${short(key)}=${value === '' ? '-' : value.length > 14 ? 'ok' : value}`).join(' '),
    intact,
    anything: chosen.some(([, value]) => value !== ''),
  };
}

async function runSeed(seed: number, mode: StartMode): Promise<Violation[]> {
  rng = mulberry32(seed);
  families = [];
  tokenFamily = new Map();
  deletedUsers = new Set();
  everStored = new Set();
  reuseEvents = [];
  oldAfterNewerStored = [];
  deleteRunning = null;
  deleteComplaints = [];
  lastStep = null;
  endersRunning = 0;
  issued = 0;
  held = [];
  trace = [];
  auto = false;
  secure.clear();
  install();
  resetCentralSessionForTests();
  resetCentralStateForTests();
  const loaded = preload(mode);
  trace.push(`PRELOAD ${loaded.text}`);

  const running: { label: string; done: boolean }[] = [];
  const start = (label: string, make: () => Promise<unknown>) => {
    const entry = { label, done: false };
    running.push(entry);
    trace.push(`START ${label}`);
    make().then(
      value => {
        entry.done = true;
        const answer = value && typeof value === 'object' ? (value as { ok?: unknown; kind?: unknown; code?: unknown }) : null;
        trace.push(`  END ${label}: ${answer ? JSON.stringify({ ok: answer.ok, kind: answer.kind, code: answer.code }) : 'done'}`);
      },
      error => {
        entry.done = true;
        trace.push(`  END ${label}: THREW ${String(error)}`);
      }
    );
  };
  let verifies = 0;
  const startOperation = () => {
    const name = OPERATIONS[Math.floor(rng() * OPERATIONS.length)];
    const phone = PHONES[Math.floor(rng() * PHONES.length)];
    if (name === 'verifyOk' || name === 'verifyBad') {
      verifies += 1;
      const right = name === 'verifyOk';
      const label = `verify#${verifies} ${right ? 'OK' : 'WRONG'} ${phone.slice(-1)}`;
      lastStep = { label, user: `user-${phone}`, clean: endersRunning === 0 };
      start(label, () => verifyCentralCode(phone, right ? '111111' : '000000', '2025-12'));
    } else if (name === 'signOut') {
      lastStep = { label: 'signOut', user: '', clean: false };
      endersRunning += 1;
      start('signOut', () =>
        signOutCentral().finally(() => {
          endersRunning -= 1;
        })
      );
    } else if (name === 'delete') {
      // One deletion at a time: a second one while the first runs is not started.
      if (deleteRunning) return;
      const mine = { expected: getCentralState().status === 'signedIn' ? (getCentralState().user?.id ?? null) : null };
      deleteRunning = mine;
      lastStep = { label: 'deleteAccount', user: '', clean: false };
      endersRunning += 1;
      start('deleteAccount', () =>
        deleteCentralAccount().finally(() => {
          endersRunning -= 1;
          if (deleteRunning === mine) deleteRunning = null;
        })
      );
    }
    else if (name === 'profile') start('profile', () => fetchCentralProfile());
    else if (name === 'refresh') start('refresh', () => refreshCentralSession());
    else start('retryRestore', () => retryCentralRestoreIfNeeded());
  };
  const letGo = (index: number) => {
    const [next] = held.splice(index, 1);
    trace.push(`    ${next.label}`);
    next.run();
  };

  // The start of the app: the stored session is read first, as the navigation gate does.
  start('restore(start)', () => restoreCentralSession());
  await flush();
  while (!running[0].done) {
    if (held.length) letGo(0);
    await flush();
  }
  trace.push(`  (after start: ${getCentralState().status}, keys left: ${[...secure.keys()].map(short).join(',') || 'none'})`);
  const violations: Violation[] = [];
  const add = (kind: string, detail: string) => violations.push({ kind, seed, detail, trace: [...trace] });
  if (mode === 'broken-keys') {
    // After the start the store holds a whole good session or nothing, and the status says which.
    const want = loaded.intact ? 'signedIn' : 'signedOut';
    if (getCentralState().status !== want) add('START_WRONG_STATUS', `want ${want} got ${getCentralState().status}; ${loaded.text}`);
    if (loaded.intact && secure.size !== 4) add('START_REMOVED_A_GOOD_SESSION', loaded.text);
    if (!loaded.intact && secure.size > 0) add('START_LEFT_KEYS_BEHIND', `${loaded.text} -> left ${[...secure.keys()].map(short).join(',')}`);
  }

  for (let step = 0; step < STEPS; step += 1) {
    if (held.length === 0 || rng() < START_PROBABILITY) startOperation();
    else letGo(Math.floor(rng() * held.length));
    await flush();
  }
  for (let guard = 0; held.length && guard < 2000; guard += 1) {
    letGo(Math.floor(rng() * held.length));
    await flush();
  }
  await flush();

  for (const entry of running) if (!entry.done) add('HANG', entry.label);
  const state = getCentralState();
  const access = secure.get(CENTRAL_SECURE_KEYS.ACCESS_TOKEN) ?? null;
  const refresh = secure.get(CENTRAL_SECURE_KEYS.REFRESH_TOKEN) ?? null;
  const expires = secure.get(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES) ?? null;
  const userText = secure.get(CENTRAL_SECURE_KEYS.USER) ?? null;
  const complete = Boolean(access && refresh && expires);
  const storedUser = ((): string | null => {
    try {
      return userText ? (JSON.parse(userText) as { id: string }).id : null;
    } catch {
      return 'UNPARSEABLE';
    }
  })();
  const picture = `state=${state.status}/${state.user?.id ?? '-'} store=${complete ? 'session' : access || refresh || expires ? 'partial' : 'none'}/${storedUser ?? '-'}`;

  // The in-memory state and the store must say the same.
  if (state.status === 'signedIn' && !(complete && storedUser)) add('SIGNED_IN_WITHOUT_STORED_SESSION', picture);
  if (state.status === 'signedIn' && complete && storedUser && storedUser !== state.user?.id) add('SIGNED_IN_USER_DIFFERS_FROM_STORE', picture);
  if (state.status === 'signedOut' && complete) add('SIGNED_OUT_WITH_TOKENS_STORED', picture);
  if (state.status === 'signedOut' && !complete && secure.size > 0) add('SIGNED_OUT_WITH_LEFTOVER_KEYS', picture);
  if (state.status === 'signedOut' && state.user) add('SIGNED_OUT_WITH_USER_IN_STATE', picture);
  if (state.status === 'unknown') add('STATUS_UNKNOWN', picture);
  // The stored tokens must be the ones of the person the state names, and must still be usable.
  if (complete && refresh && state.status === 'signedIn') {
    const id = tokenFamily.get(refresh);
    const family = id === undefined ? undefined : families[id];
    if (family && family.userId !== state.user?.id) add('TOKENS_OF_ANOTHER_PERSON', `${picture} tokens=${family.userId}`);
    if (family && !family.revoked && !deletedUsers.has(family.userId) && family.current !== refresh)
      add('STORED_REFRESH_TOKEN_IS_SPENT', `${picture} (the next refresh would revoke the family)`);
  }
  if (oldAfterNewerStored.length) add('OLD_REFRESH_TOKEN_PRESENTED_AFTER_NEWER_STORED', oldAfterNewerStored.join('; '));
  if (reuseEvents.length) add('REFRESH_TOKEN_PRESENTED_TWICE', reuseEvents.join('; '));
  // Every DELETE carried the token of the person whose deletion was asked for.
  if (deleteComplaints.some(item => !item.nobody)) add('DELETE_SENT_AS_ANOTHER_PERSON', deleteComplaints.map(item => item.text).join('; '));
  if (deleteComplaints.some(item => item.nobody)) add('DELETE_SENT_WHILE_MEMORY_SAID_SIGNED_OUT', deleteComplaints.map(item => item.text).join('; '));
  // The last step that checked a code or signed out was a right code, so that person is signed in.
  const last = lastStep as { label: string; user: string; clean: boolean } | null;
  const lastIsRightCode = Boolean(last && last.clean && last.label.includes(' OK '));
  if (lastIsRightCode) looked.lastRightCode += 1;
  if (last && lastIsRightCode && !(state.status === 'signedIn' && state.user?.id === last.user))
    add('LAST_RIGHT_CODE_NOT_SIGNED_IN', `${last.label}; ${picture}`);

  // The next start must read the same picture.
  const before = `${state.status}/${state.user?.id ?? '-'}`;
  if (state.status !== 'unknown') {
    auto = true;
    resetCentralSessionForTests();
    resetCentralStateForTests();
    await restoreCentralSession();
    await flush();
    const after = `${getCentralState().status}/${getCentralState().user?.id ?? '-'}`;
    if (after !== before) add('NEXT_START_DISAGREES', `before=${before} after=${after} ${picture}`);
    auto = false;
  }
  resetCentralSessionForTests();
  return violations;
}

beforeEach(() => {
  jest.mocked(SecureStore.getItemAsync).mockReset();
  jest.mocked(SecureStore.setItemAsync).mockReset();
  jest.mocked(SecureStore.deleteItemAsync).mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});

async function sweep(seeds: readonly number[], mode: StartMode) {
  const counts: Record<string, number> = {};
  const seedsOf: Record<string, number[]> = {};
  const examples: Record<string, Violation> = {};
  looked.deleteRequests = 0;
  looked.lastRightCode = 0;
  for (const seed of seeds) {
    for (const violation of await runSeed(seed, mode)) {
      counts[violation.kind] = (counts[violation.kind] ?? 0) + 1;
      (seedsOf[violation.kind] ??= []).push(seed);
      if (!examples[violation.kind] || violation.trace.length < examples[violation.kind].trace.length) examples[violation.kind] = violation;
    }
  }
  if (Object.keys(counts).length) {
    const lines = [`violations over ${seeds.length} seeds (${mode}): ${JSON.stringify(counts)}; looked at ${JSON.stringify(looked)}`];
    for (const [kind, example] of Object.entries(examples))
      lines.push(`--- ${kind}: ${example.detail} (seeds ${seedsOf[kind].slice(0, 8).join(', ')}${seedsOf[kind].length > 8 ? ', ...' : ''}; shortest trace is seed ${example.seed})`, ...example.trace);
    throw new Error(lines.join('\n'));
  }
  // The two checks above had something to look at: DELETE requests were sent, and runs ended on a right code.
  expect(looked.deleteRequests).toBeGreaterThan(0);
  expect(looked.lastRightCode).toBeGreaterThan(0);
}

it(`${SEEDS.length} fixed seeds: state and store agree, the next start agrees, and no refresh token is presented after a newer one was stored`, () =>
  sweep(SEEDS, 'usually-signed-in'), 600000);

it(`${BROKEN_START_SEEDS.length} fixed seeds that start from a random, often broken, set of stored keys: the start leaves a whole good session or nothing, and the rest agrees too`, () =>
  sweep(BROKEN_START_SEEDS, 'broken-keys'), 600000);
