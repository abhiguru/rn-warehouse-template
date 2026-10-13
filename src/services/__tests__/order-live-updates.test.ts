import { operatorResumeGate } from '@/config/operatorResume';
import { createClient } from '@supabase/supabase-js';
import { acquireValidSession } from '@/config/supabaseConfig';
import { advanceSessionGeneration, getSessionGeneration } from '@/config/sessionLifecycle';
import { subscribeToOrderChanges } from '../order-live-updates';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  acquireValidSession: jest.fn(),
}));
// The validated session as acquireValidSession returns it: tied to the
// generation that was current when the acquisition began.
const sessionFor = (authToken: string) => ({
  authToken,
  refreshToken: 'refresh-test',
  expiresAt: Date.now() + 3600 * 1000,
  generation: getSessionGeneration(),
});
const holdSession = () => {
  let finish!: (value: ReturnType<typeof sessionFor> | null) => void;
  (acquireValidSession as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  return (value: ReturnType<typeof sessionFor> | null) => finish(value);
};

/** The part of a Realtime channel the service uses; each method returns the channel. */
type FakeChannel = { on: jest.Mock; subscribe: jest.Mock };
const handlers: Record<string, (...args: any[]) => void> = {};
let status: (status: string) => void;
let accessToken: () => Promise<string>;
const disconnect = jest.fn();
const removeAllChannels = jest.fn().mockResolvedValue([]);
let stop: (() => void) | undefined;
const flush = () => jest.advanceTimersByTimeAsync(200);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (acquireValidSession as jest.Mock).mockImplementation(async () => sessionFor('session-one'));
  (createClient as jest.Mock).mockImplementation((_url, _key, options) => {
    accessToken = options.accessToken;
    const channel: FakeChannel = {
      on: jest.fn((event, _filter, callback) => { handlers[event] = callback; return channel; }),
      subscribe: jest.fn(callback => { status = callback; return channel; }),
    };
    return { channel: () => channel, realtime: { disconnect }, removeAllChannels };
  });
});
afterEach(() => { stop?.(); stop = undefined; jest.useRealTimers(); });

test('coalesces changes and refetches after each reconnect', async () => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  status('SUBSCRIBED');
  handlers.system({ status: 'ok' });
  handlers.postgres_changes({ new: { secret: 'never consumed' } });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith();
  status('CHANNEL_ERROR');
  status('SUBSCRIBED');
  await flush();
  expect(refresh).toHaveBeenCalledTimes(2);
});

test('the first join refetches nothing; a rejoin on the same subscription refetches once', async () => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  status('SUBSCRIBED');
  await flush();
  expect(refresh).not.toHaveBeenCalled();
  status('CHANNEL_ERROR');
  status('SUBSCRIBED');
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
});

test.each([
  ['SUBSCRIBED first', ['join', 'ok']],
  ['system ok first', ['ok', 'join']],
])('the first join and first system ok refetch nothing (%s); later ones do, coalesced', async (_name, order) => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  for (const message of order) {
    if (message === 'join') status('SUBSCRIBED');
    else handlers.system({ status: 'ok' });
  }
  await flush();
  expect(refresh).not.toHaveBeenCalled();
  // A later system ok on its own: one refetch.
  handlers.system({ status: 'ok' });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  // A rejoin and its system ok within the 150 ms debounce: one refetch.
  status('CHANNEL_ERROR');
  status('SUBSCRIBED');
  await jest.advanceTimersByTimeAsync(50);
  handlers.system({ status: 'ok' });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(2);
});

test('queues changes received during a slow refetch', async () => {
  let finish!: () => void;
  const refresh = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  stop = subscribeToOrderChanges(refresh);
  handlers.postgres_changes();
  await flush();
  handlers.postgres_changes();
  handlers.postgres_changes();
  finish();
  await flush();
  expect(refresh).toHaveBeenCalledTimes(2);
});

test('reads rotated custom tokens and never falls back to anonymous auth', async () => {
  stop = subscribeToOrderChanges(jest.fn());
  expect(await accessToken()).toBe('session-one');
  (acquireValidSession as jest.Mock).mockImplementation(async () => sessionFor('session-two'));
  expect(await accessToken()).toBe('session-two');
  (acquireValidSession as jest.Mock).mockResolvedValue(null);
  await expect(accessToken()).rejects.toThrow('Sign in required');
});

test('logout disconnects immediately, cancels pending refresh and rejects late token reads', async () => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  const finish = holdSession();
  const pending = accessToken();
  const rejection = expect(pending).rejects.toThrow('Sign in required');
  handlers.postgres_changes();
  advanceSessionGeneration();
  expect(disconnect).toHaveBeenCalledTimes(1);
  finish({ ...sessionFor('session-one'), generation: getSessionGeneration() - 1 });
  await rejection;
  status('SUBSCRIBED');
  await flush();
  expect(refresh).not.toHaveBeenCalled();
  expect(removeAllChannels).toHaveBeenCalledTimes(1);
});

test('unmount is idempotent and ignores late socket events', async () => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  stop(); stop();
  handlers.postgres_changes();
  await flush();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
});

test('resume cannot construct a socket before public identity verification completes', async () => {
  let release!: (value: boolean) => void;
  const pending = new Promise<boolean>(resolve => { release = resolve; });
  const remove = operatorResumeGate.installVerifier(() => pending);
  operatorResumeGate.suspend();
  stop = subscribeToOrderChanges(jest.fn());
  expect(createClient).not.toHaveBeenCalled();
  release(true); await operatorResumeGate.ensureVerified(); await Promise.resolve();
  expect(createClient).toHaveBeenCalledTimes(1);
  operatorResumeGate.suspend();
  expect(disconnect).toHaveBeenCalledTimes(1);
  await operatorResumeGate.ensureVerified(); remove();
});
test('a changed session during discovery cannot construct a socket for the old account', async () => {
  let release!: (value: boolean) => void;
  const pending = new Promise<boolean>(resolve => { release = resolve; });
  const remove = operatorResumeGate.installVerifier(() => pending);
  operatorResumeGate.suspend(); stop = subscribeToOrderChanges(jest.fn());
  advanceSessionGeneration(); release(true);
  await operatorResumeGate.ensureVerified(); await Promise.resolve();
  expect(createClient).not.toHaveBeenCalled(); remove();
});

describe("the client's own first token read (backlog A19)", () => {
  const setAuth = jest.fn();
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // As supabase-js's SupabaseClient constructor does when given `accessToken`: it reads the
    // token at once and logs a warning when that read is refused.
    (createClient as jest.Mock).mockImplementation((_url, _key, options) => {
      accessToken = options.accessToken;
      Promise.resolve(options.accessToken())
        .then((token: string) => setAuth(token))
        // eslint-disable-next-line no-console -- the library's own call, which the test watches
        .catch((e: unknown) => console.warn('Failed to set initial Realtime auth token:', e));
      const channel: FakeChannel = {
        on: jest.fn((event: string, _filter: unknown, callback: (...args: unknown[]) => void) => { handlers[event] = callback; return channel; }),
        subscribe: jest.fn((callback: (value: string) => void) => { status = callback; return channel; }),
      };
      return { channel: () => channel, realtime: { disconnect }, removeAllChannels };
    });
  });
  afterEach(() => { warn.mockRestore(); });

  test('the subscription ends while that read waits for the session check: no warning, and no token', async () => {
    const finish = holdSession();
    stop = subscribeToOrderChanges(jest.fn());
    expect(createClient).toHaveBeenCalledTimes(1);
    stop(); // the screen went while the first read was on its way
    finish(sessionFor('session-one'));
    await flush();
    expect(warn).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('the session changes while that read reads the stored token: no warning, and no token', async () => {
    const finish = holdSession();
    stop = subscribeToOrderChanges(jest.fn());
    await flush(); // the stored session is being read
    const before = sessionFor('session-one');
    advanceSessionGeneration();
    finish(before);
    await flush();
    expect(warn).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });

  test('nothing changes for a current subscription: the token is handed over, and a read after the end is still refused', async () => {
    stop = subscribeToOrderChanges(jest.fn());
    await flush();
    expect(setAuth).toHaveBeenCalledWith('session-one');
    expect(warn).not.toHaveBeenCalled();
    stop();
    await expect(accessToken()).rejects.toThrow('Sign in required');
  });

  test('nothing changes for a current subscription without a session: its first read is refused, as before', async () => {
    (acquireValidSession as jest.Mock).mockResolvedValue(null);
    stop = subscribeToOrderChanges(jest.fn());
    await flush();
    expect(setAuth).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Failed to set initial Realtime auth token:', expect.objectContaining({ message: 'Sign in required' }));
  });
});
