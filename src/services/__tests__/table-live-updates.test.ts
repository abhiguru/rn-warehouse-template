/**
 * The table-agnostic subscription (order-live-updates.test.ts covers the orders channel and
 * the session rules in full): each table gets its own channel and filter, and the sensors
 * channel keeps the shared rules (first join refetches once, bursts coalesce).
 */
import { createClient } from '@supabase/supabase-js';
import { acquireValidSession } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { subscribeToTableChanges } from '../table-live-updates';
import { SENSOR_LATEST_TABLE, subscribeToSensorChanges } from '../sensor-live-updates';
import { subscribeToOrderChanges } from '../order-live-updates';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getCurrentConfig: () => ({ url: 'http://localhost:18000', anonKey: 'public-key' }),
  acquireValidSession: jest.fn(),
}));

type FakeChannel = { on: jest.Mock; subscribe: jest.Mock };
const handlers: Record<string, (...args: any[]) => void> = {};
const filters: Record<string, unknown> = {};
let status: (status: string) => void;
let channelName: jest.Mock;
const disconnect = jest.fn();
const removeAllChannels = jest.fn().mockResolvedValue([]);
let stop: (() => void) | undefined;
const flush = () => jest.advanceTimersByTimeAsync(200);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (acquireValidSession as jest.Mock).mockImplementation(async () => ({
    authToken: 'session-one',
    refreshToken: 'refresh-test',
    expiresAt: Date.now() + 3600 * 1000,
    generation: getSessionGeneration(),
  }));
  (createClient as jest.Mock).mockImplementation(() => {
    const channel: FakeChannel = {
      on: jest.fn((event, filter, callback) => { handlers[event] = callback; filters[event] = filter; return channel; }),
      subscribe: jest.fn(callback => { status = callback; return channel; }),
    };
    channelName = jest.fn(() => channel);
    return { channel: channelName, realtime: { disconnect }, removeAllChannels };
  });
});
afterEach(() => { stop?.(); stop = undefined; jest.useRealTimers(); });

test('sensors subscribe to public.sensor_latest on their own channel', () => {
  stop = subscribeToSensorChanges(jest.fn());
  expect(SENSOR_LATEST_TABLE).toBe('sensor_latest');
  expect(channelName).toHaveBeenCalledWith('warehouse-sensors');
  expect(filters.postgres_changes).toEqual({ event: '*', schema: 'public', table: 'sensor_latest' });
});

test('orders keep their channel and filter', () => {
  stop = subscribeToOrderChanges(jest.fn());
  expect(channelName).toHaveBeenCalledWith('warehouse-orders');
  expect(filters.postgres_changes).toEqual({ event: '*', schema: 'public', table: 'orders' });
});

test('a schema other than public is passed through', () => {
  stop = subscribeToTableChanges({ table: 'ledger', channel: 'warehouse-ledger', schema: 'audit' }, jest.fn());
  expect(channelName).toHaveBeenCalledWith('warehouse-ledger');
  expect(filters.postgres_changes).toEqual({ event: '*', schema: 'audit', table: 'ledger' });
});

test('sensors: the first join refetches once, the first system ok nothing; a rejoin refetches again', async () => {
  const refresh = jest.fn();
  stop = subscribeToSensorChanges(refresh);
  status('SUBSCRIBED');
  handlers.system({ status: 'ok' });
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  status('CHANNEL_ERROR');
  status('SUBSCRIBED');
  await flush();
  expect(refresh).toHaveBeenCalledTimes(2);
});

test('sensors: a burst of changes within 150 ms refetches once, without the payload', async () => {
  const refresh = jest.fn();
  stop = subscribeToSensorChanges(refresh);
  status('SUBSCRIBED');
  handlers.postgres_changes({ new: { temperature: 4.2 } });
  await jest.advanceTimersByTimeAsync(100);
  handlers.postgres_changes({ new: { temperature: 4.3 } });
  handlers.postgres_changes({ new: { humidity: 81 } });
  expect(refresh).not.toHaveBeenCalled();
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith();
});

test('stop disconnects and removes the channels', () => {
  stop = subscribeToSensorChanges(jest.fn());
  stop();
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(removeAllChannels).toHaveBeenCalledTimes(1);
});
