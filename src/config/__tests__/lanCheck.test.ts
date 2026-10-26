import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import {
  DAILY_CHECK_INTERVAL_MS,
  DAILY_CHECK_POLL_MS,
  DAILY_CHECK_START_DELAY_MS,
  checkLanNow,
  readLastLanCheck,
  runDailyLanCheckIfDue,
  startDailyLanCheck,
  subscribeLanCheck,
} from '../lanCheck';
import { resetLanTransport, setLanContext, transportFetch } from '../lanTransport';

jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn() } }));

const PUBLIC = 'https://warehouse.example.test';
const LAN = 'http://192.168.1.20:8080';
const originalFetch = global.fetch;
const key = `lan_check_v1:${PUBLIC}`;
let lanState: 'up' | 'down' | 'refused';
let publicUp: boolean;
let asked: string[];

const reply = (status: number, path: 'lan' | 'public', body: unknown = 'Hello') =>
  ({ ok: status < 400, status, headers: { get: () => path }, json: async () => body, clone: () => reply(status, path, body), body: null }) as unknown as Response;
const route = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  asked.push(url);
  if (url.startsWith(PUBLIC)) {
    if (!publicUp) throw new TypeError('Network request failed');
    return reply(200, 'public');
  }
  if (lanState === 'down') throw new TypeError('Network request failed');
  if (lanState === 'refused') return reply(403, 'lan', '<html>');
  return url.endsWith('/get-public-config') ? reply(200, 'lan', { success: true, data: { instanceId: 'instance-0001' } }) : reply(200, 'lan');
};
const net = (type: string, isConnected: boolean, isInternetReachable: boolean | null) =>
  jest.mocked(NetInfo.fetch).mockResolvedValue({ type, isConnected, isInternetReachable, details: null } as never);

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-26T10:00:00Z'));
  lanState = 'up';
  publicUp = true;
  asked = [];
  await AsyncStorage.clear();
  resetLanTransport();
  setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: 'instance-0001' });
  net('wifi', true, true);
  global.fetch = jest.fn(route) as unknown as typeof fetch;
});
afterEach(() => {
  resetLanTransport();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe('checkLanNow', () => {
  it('asks the LAN address with no credential, and keeps the answer with its time and what asked', async () => {
    const answer = await checkLanNow('manual');
    expect(answer).toEqual({ at: Date.now(), address: LAN, outcome: 'reachable', ms: 0, trigger: 'manual' });
    expect(await readLastLanCheck()).toEqual(answer);
    for (const [, init] of jest.mocked(global.fetch).mock.calls) expect(init?.headers).toBeUndefined();
  });

  it.each([
    ['down', 'unreachable'],
    ['refused', 'refused'],
  ] as const)('keeps a failure too: LAN %s is %s', async (state, outcome) => {
    lanState = state;
    expect(await checkLanNow('daily')).toMatchObject({ outcome, trigger: 'daily' });
    expect(await readLastLanCheck()).toMatchObject({ outcome });
  });

  it('says not-set, and keeps nothing, when the server offers no address', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: 'instance-0001' });
    expect(await checkLanNow()).toEqual({ outcome: 'not-set' });
    expect(await AsyncStorage.getItem(key)).toBeNull();
  });

  it('shares one question between callers who ask together', async () => {
    const [first, second] = await Promise.all([checkLanNow(), checkLanNow()]);
    expect(first).toBe(second);
    expect(asked.filter(url => url.endsWith('/hello'))).toHaveLength(1);
  });

  it('tells those who listen', async () => {
    const listener = jest.fn();
    const stop = subscribeLanCheck(listener);
    await checkLanNow();
    stop();
    await checkLanNow();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still returns the answer when it cannot be kept', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    expect(await checkLanNow()).toMatchObject({ outcome: 'reachable' });
  });

  it('drops an answer about a facility or address that is no longer selected', async () => {
    const pending = checkLanNow();
    setLanContext({ canonical: PUBLIC, lan: 'http://192.168.1.77:8080', instanceId: 'instance-0001' });
    await pending;
    expect(await AsyncStorage.getItem(key)).toBeNull();
  });
});

describe('readLastLanCheck', () => {
  it('shows only a record of the address in use, with a known outcome and time', async () => {
    const good = { at: Date.now(), address: LAN, outcome: 'reachable', ms: 5, trigger: 'manual' };
    await AsyncStorage.setItem(key, JSON.stringify(good));
    expect(await readLastLanCheck()).toEqual(good);
    for (const bad of [{ ...good, address: 'http://192.168.1.77:8080' }, { ...good, outcome: 'fine' }, { ...good, at: 'now' }, { ...good, trigger: 'x' }, 'text', null]) {
      await AsyncStorage.setItem(key, JSON.stringify(bad));
      expect(await readLastLanCheck()).toBeNull();
    }
    await AsyncStorage.setItem(key, '{not json');
    expect(await readLastLanCheck()).toBeNull();
  });
});

describe('the daily check', () => {
  it('runs when it was never made, the phone is on Wi-Fi and the internet reaches the server', async () => {
    expect(await runDailyLanCheckIfDue()).toMatchObject({ outcome: 'reachable', trigger: 'daily' });
    expect(await readLastLanCheck()).toMatchObject({ trigger: 'daily' });
  });

  it('waits a day after the last check, then runs', async () => {
    await checkLanNow('manual');
    asked = [];
    expect(await runDailyLanCheckIfDue(Date.now() + DAILY_CHECK_INTERVAL_MS - 1000)).toBeNull();
    expect(asked).toEqual([]);
    jest.setSystemTime(Date.now() + DAILY_CHECK_INTERVAL_MS + 1000);
    expect(await runDailyLanCheckIfDue()).toMatchObject({ trigger: 'daily' });
  });

  it('asks again at once when the record of the last check is from the future (a wrong clock)', async () => {
    await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now() + 5 * DAILY_CHECK_INTERVAL_MS, address: LAN, outcome: 'reachable', ms: 1, trigger: 'daily' }));
    expect(await runDailyLanCheckIfDue()).not.toBeNull();
  });

  it('asks again when the address is not the one last checked', async () => {
    await checkLanNow('manual');
    setLanContext({ canonical: PUBLIC, lan: 'http://192.168.1.77:8080', instanceId: 'instance-0001' });
    expect(await runDailyLanCheckIfDue()).toMatchObject({ address: 'http://192.168.1.77:8080' });
  });

  it.each([
    ['on mobile data', () => net('cellular', true, true)],
    ['with no connection', () => net('none', false, false)],
    ['with the internet not reaching the server', () => net('wifi', true, false)],
    ['while that is still being found out', () => net('wifi', true, null)],
  ])('does not run %s', async (_name, arrange) => {
    arrange();
    expect(await runDailyLanCheckIfDue()).toBeNull();
    expect(asked).toEqual([]);
  });

  it('does not run when NetInfo cannot be read', async () => {
    jest.mocked(NetInfo.fetch).mockRejectedValue(new Error('no native module'));
    expect(await runDailyLanCheckIfDue()).toBeNull();
  });

  it('does not run during an outage, when the warehouse network is already in use', async () => {
    publicUp = false;
    await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true });
    asked = [];
    expect(await runDailyLanCheckIfDue()).toBeNull();
    expect(asked).toEqual([]);
  });

  it('does not run when the server offers no address', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: 'instance-0001' });
    expect(await runDailyLanCheckIfDue()).toBeNull();
  });
});

describe('startDailyLanCheck', () => {
  let appStateListener: (state: string) => void;
  const remove = jest.fn();
  let stop: (() => void) | undefined;
  const lanChecks = () => asked.filter(url => url.endsWith('/hello') && url.startsWith(LAN)).length;

  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove };
    }) as never);
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    remove.mockClear();
    jest.restoreAllMocks();
  });

  it('looks a little after the start, and that is the day\'s check', async () => {
    stop = startDailyLanCheck();
    await jest.advanceTimersByTimeAsync(DAILY_CHECK_START_DELAY_MS - 1);
    expect(lanChecks()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(lanChecks()).toBe(1);
    expect(await readLastLanCheck()).toMatchObject({ trigger: 'daily' });
  });

  it('looks every hour and on every return to the foreground, and asks only when a day has passed', async () => {
    stop = startDailyLanCheck();
    await jest.advanceTimersByTimeAsync(DAILY_CHECK_START_DELAY_MS);
    expect(lanChecks()).toBe(1);
    await jest.advanceTimersByTimeAsync(DAILY_CHECK_POLL_MS * 5);
    appStateListener('background');
    appStateListener('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(lanChecks()).toBe(1);
    await jest.advanceTimersByTimeAsync(DAILY_CHECK_INTERVAL_MS);
    expect(lanChecks()).toBe(2);
  });

  it('looks when the address arrives after the start (the first sign-in on this phone)', async () => {
    setLanContext({ canonical: PUBLIC, lan: null, instanceId: 'instance-0001' });
    stop = startDailyLanCheck();
    expect(lanChecks()).toBe(0);
    setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: 'instance-0001' });
    await jest.advanceTimersByTimeAsync(0);
    expect(lanChecks()).toBe(1);
  });

  it('is one at a time, and stops completely', async () => {
    stop = startDailyLanCheck();
    expect(startDailyLanCheck()).toBe(stop);
    stop();
    stop = undefined;
    expect(remove).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(DAILY_CHECK_START_DELAY_MS + DAILY_CHECK_POLL_MS);
    expect(lanChecks()).toBe(0);
  });
});
