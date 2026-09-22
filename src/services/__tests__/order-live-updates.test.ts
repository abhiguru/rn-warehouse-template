import { createClient } from '@supabase/supabase-js';
import { ensureValidTokens, getStoredToken } from '@/config/supabaseConfig';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { subscribeToOrderChanges } from '../order-live-updates';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  ensureValidTokens: jest.fn(),
  getStoredToken: jest.fn(),
}));

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
  (ensureValidTokens as jest.Mock).mockResolvedValue(true);
  (getStoredToken as jest.Mock).mockResolvedValue({ isValid: true, authToken: 'session-one' });
  (createClient as jest.Mock).mockImplementation((_url, _key, options) => {
    accessToken = options.accessToken;
    const channel = {
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
  (getStoredToken as jest.Mock).mockResolvedValue({ isValid: true, authToken: 'session-two' });
  expect(await accessToken()).toBe('session-two');
  (ensureValidTokens as jest.Mock).mockResolvedValue(false);
  await expect(accessToken()).rejects.toThrow('Sign in required');
});

test('logout disconnects immediately, cancels pending refresh and rejects late token reads', async () => {
  const refresh = jest.fn();
  stop = subscribeToOrderChanges(refresh);
  let finish!: (value: boolean) => void;
  (ensureValidTokens as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = accessToken();
  const rejection = expect(pending).rejects.toThrow('Sign in required');
  handlers.postgres_changes();
  advanceSessionGeneration();
  expect(disconnect).toHaveBeenCalledTimes(1);
  finish(true);
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
