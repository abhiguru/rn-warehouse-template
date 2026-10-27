import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  clearOperatorServer,
  compareVersions,
  discoverOperator,
  getActiveOperatorServer,
  lanAddressOf,
  loadOperatorServer,
  onOperatorServerChange,
  parseOperatorOrigin,
  recordServerLanAddress,
  saveOperatorServer,
  setTypedLanAddress,
} from '../operatorServer';
import { getLanContext, resetLanTransport } from '../lanTransport';
import { AppTooOldError, isAppTooOld } from '../appTooOld';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const origin = 'https://warehouse.example.test';
const anonKey = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const config = (instanceId = 'instance-0001') => ({
  success: true,
  data: {
    supabaseUrl: origin, anonKey, environment: 'production', version: '1.0.0',
    maintenanceMode: false, instanceId, displayName: 'Warehouse One',
    companyName: 'Example Operator', canonicalOrigin: origin,
    supportedApiVersions: ['1'], minimumClientVersion: '0.1.0', capabilities: {},
    urls: { publicConfig: `${origin}/functions/v1/get-public-config`, fullConfig: `${origin}/functions/v1/get-config` },
  },
});
const originalFetch = global.fetch;
beforeEach(async () => { await AsyncStorage.clear(); global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

it('accepts only a bare HTTPS origin from manual input or QR', () => {
  expect(parseOperatorOrigin(` ${origin} `)).toBe(origin);
  for (const value of ['http://warehouse.example.test', `${origin}/join`, `${origin}?token=x`, 'https://user:pass@warehouse.example.test'])
    expect(() => parseOperatorOrigin(value)).toThrow();
});

it('discovers a compatible server and persists only its public identity', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => config() } as Response);
  const result = await discoverOperator(origin);
  expect(result.server).toEqual({ origin, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' });
  await saveOperatorServer(result.server);
  expect(await loadOperatorServer()).toEqual(result.server);
  expect(getActiveOperatorServer()).toEqual(result.server);
  expect(await AsyncStorage.getItem('operator_server_v1')).not.toContain(anonKey);
});

it('rejects a substituted origin, unsupported API, or too-new minimum client', async () => {
  for (const change of [
    { canonicalOrigin: 'https://other.example.test' },
    { supportedApiVersions: ['2'] },
    { minimumClientVersion: '0.2.0' },
  ]) {
    jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ...config(), data: { ...config().data, ...change } }) } as Response);
    await expect(discoverOperator(origin)).rejects.toThrow();
  }
  expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
});

it('bounds discovery even when a server stalls while sending its JSON body', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    } as unknown as Response);
    const pending = discoverOperator(origin);
    const rejected = expect(pending).rejects.toThrow('Server discovery timed out.');
    await jest.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('names a discovery answer that came from another origin after a redirect (M1-12)', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true, url: 'https://other.example.test/functions/v1/get-public-config', json: async () => config(),
  } as Response);
  await expect(discoverOperator(origin)).rejects.toThrow('This address forwards to another server.');
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true, url: `${origin}/functions/v1/get-public-config`, json: async () => config(),
  } as Response);
  expect((await discoverOperator(origin)).server.origin).toBe(origin);
});

// ---------------------------------------------------------------------------
// The address on the warehouse network (WS-L)
// ---------------------------------------------------------------------------
describe('the warehouse network address', () => {
  const server = { origin, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' };
  const LAN = 'http://192.168.1.20:8080';
  const saved = async () => JSON.parse((await AsyncStorage.getItem('operator_server_v1')) as string);

  beforeEach(() => resetLanTransport());
  afterAll(() => resetLanTransport());

  it('is saved from the server\'s answer and handed to the transport, without announcing a server change', async () => {
    await saveOperatorServer(server, false);
    const changed = jest.fn();
    const stop = onOperatorServerChange(changed);
    expect(getLanContext()).toEqual({ canonical: origin, lan: null, instanceId: 'instance-0001' });
    await recordServerLanAddress(origin, LAN);
    expect(getActiveOperatorServer()?.lan).toBe(LAN);
    expect((await saved()).lan).toBe(LAN);
    expect(getLanContext()?.lan).toBe(LAN);
    expect(changed).not.toHaveBeenCalled();
    stop();
  });

  it('ignores a value that is not a private http address, and an answer about another server', async () => {
    await saveOperatorServer(server, false);
    for (const value of ['https://192.168.1.20:8080', 'http://8.8.8.8:8080', 'http://warehouse.local:8080', 42, null, undefined])
      await recordServerLanAddress(origin, value);
    await recordServerLanAddress('https://other.example.test', LAN);
    expect(getActiveOperatorServer()?.lan).toBeUndefined();
    expect(getLanContext()?.lan).toBeNull();
  });

  it('is replaced when the server sends another and removed when the server stops sending one', async () => {
    await saveOperatorServer({ ...server, lan: LAN }, false);
    await recordServerLanAddress(origin, 'http://192.168.1.30:8080');
    expect(lanAddressOf(getActiveOperatorServer())).toBe('http://192.168.1.30:8080');
    await recordServerLanAddress(origin, undefined);
    expect(getActiveOperatorServer()).toEqual(server);
    expect(lanAddressOf(getActiveOperatorServer())).toBeNull();
    expect(getLanContext()?.lan).toBeNull();
  });

  it('survives the save of a discovery answer for the same server, but not a change of server', async () => {
    await saveOperatorServer({ ...server, lan: LAN }, false);
    await saveOperatorServer(server, false);
    expect(getActiveOperatorServer()?.lan).toBe(LAN);
    await saveOperatorServer({ ...server, instanceId: 'instance-0002' }, false);
    expect(getActiveOperatorServer()?.lan).toBeUndefined();
    await saveOperatorServer({ ...server, lan: LAN }, false);
    await saveOperatorServer({ ...server, origin: 'https://other.example.test' }, false);
    expect(getActiveOperatorServer()?.lan).toBeUndefined();
  });

  it('is read again at start, and a damaged saved value is dropped', async () => {
    await AsyncStorage.setItem('operator_server_v1', JSON.stringify({ ...server, lan: 'http://8.8.8.8:80', lanTyped: { address: 'nonsense', serverValue: null } }));
    expect(await loadOperatorServer()).toEqual(server);
    await AsyncStorage.setItem('operator_server_v1', JSON.stringify({ ...server, lan: LAN }));
    expect((await loadOperatorServer())?.lan).toBe(LAN);
    expect(getLanContext()?.lan).toBe(LAN);
  });

  it('is forgotten with the server', async () => {
    await saveOperatorServer({ ...server, lan: LAN }, false);
    await clearOperatorServer();
    expect(getLanContext()).toBeNull();
  });

  describe('typed in Help', () => {
    it('is validated, used instead of the saved one, and kept while the server\'s value does not change', async () => {
      await saveOperatorServer({ ...server, lan: LAN }, false);
      expect(await setTypedLanAddress('http://8.8.8.8:80')).toBe(false);
      expect(await setTypedLanAddress('192.168.1.99')).toBe(false);
      expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
      expect(await setTypedLanAddress(' http://192.168.1.99:8080/ ')).toBe(true);
      expect(lanAddressOf(getActiveOperatorServer())).toBe('http://192.168.1.99:8080');
      expect(getLanContext()?.lan).toBe('http://192.168.1.99:8080');
      // The server says the same thing again: the typed address stays.
      await recordServerLanAddress(origin, LAN);
      expect(lanAddressOf(getActiveOperatorServer())).toBe('http://192.168.1.99:8080');
      expect((await saved()).lanTyped).toEqual({ address: 'http://192.168.1.99:8080', serverValue: LAN });
    });

    it('changes the host part of the server\'s address and nothing else: not another subnet, not a network or broadcast address', async () => {
      await saveOperatorServer({ ...server, lan: LAN }, false);
      for (const typed of ['http://192.168.2.20:8080', 'http://10.0.0.5:8080', 'http://192.168.1.0:8080', 'http://192.168.1.255:8080'])
        expect(await setTypedLanAddress(typed)).toBe(false);
      expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
      expect(await setTypedLanAddress('http://192.168.1.99:9090')).toBe(true);
    });

    it('is possible only while the server sends an address: the operator cannot be made to use an invented one', async () => {
      await clearOperatorServer(); // a discovery save of the same server would keep the address it had
      await saveOperatorServer(server, false);
      expect(await setTypedLanAddress('http://192.168.1.99:8080')).toBe(false);
      expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
      expect(getLanContext()?.lan).toBeNull();
      // Clearing is always possible.
      expect(await setTypedLanAddress('')).toBe(true);
    });

    it('is dropped with the server\'s address when the server stops sending one (the operator turned the fallback off)', async () => {
      await saveOperatorServer({ ...server, lan: LAN }, false);
      await setTypedLanAddress('http://192.168.1.99:8080');
      await recordServerLanAddress(origin, undefined);
      expect(getActiveOperatorServer()).toEqual(server);
      expect(lanAddressOf(getActiveOperatorServer())).toBeNull();
      expect(getLanContext()?.lan).toBeNull();
      expect(await saved()).toEqual(server);
      // The fallback comes back: the server's own value, never the old typed one.
      await recordServerLanAddress(origin, LAN);
      expect(lanAddressOf(getActiveOperatorServer())).toBe(LAN);
      expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    });

    it('is dropped when the server sends a different value', async () => {
      await saveOperatorServer({ ...server, lan: LAN }, false);
      await setTypedLanAddress('http://192.168.1.99:8080');
      await recordServerLanAddress(origin, 'http://192.168.1.30:8080');
      expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
      expect(lanAddressOf(getActiveOperatorServer())).toBe('http://192.168.1.30:8080');
    });

    it('does not survive a saved copy that has it without the server\'s address, or that is not a host-part change', async () => {
      await AsyncStorage.setItem(
        'operator_server_v1',
        JSON.stringify({ ...server, lanTyped: { address: 'http://192.168.1.99:8080', serverValue: null } })
      );
      expect((await loadOperatorServer())?.lanTyped).toBeUndefined();
      await AsyncStorage.setItem(
        'operator_server_v1',
        JSON.stringify({ ...server, lan: LAN, lanTyped: { address: 'http://10.0.0.9:8080', serverValue: LAN } })
      );
      expect((await loadOperatorServer())?.lanTyped).toBeUndefined();
      await AsyncStorage.setItem(
        'operator_server_v1',
        JSON.stringify({ ...server, lan: LAN, lanTyped: { address: 'http://192.168.1.99:8080', serverValue: 'http://192.168.1.21:8080' } })
      );
      expect((await loadOperatorServer())?.lanTyped).toBeUndefined();
      await AsyncStorage.setItem(
        'operator_server_v1',
        JSON.stringify({ ...server, lan: LAN, lanTyped: { address: 'http://192.168.1.99:8080', serverValue: LAN } })
      );
      expect((await loadOperatorServer())?.lanTyped).toEqual({ address: 'http://192.168.1.99:8080', serverValue: LAN });
    });

    it('is cleared by an empty field, back to the server\'s own', async () => {
      await saveOperatorServer({ ...server, lan: LAN }, false);
      await setTypedLanAddress('http://192.168.1.99:8080');
      expect(await setTypedLanAddress('   ')).toBe(true);
      expect(lanAddressOf(getActiveOperatorServer())).toBe(LAN);
    });

    it('has no server to attach to when none is selected', async () => {
      await clearOperatorServer();
      expect(await setTypedLanAddress('http://192.168.1.99:8080')).toBe(false);
    });
  });
});

describe('a facility that needs a newer app', () => {
  const answer = (data: Record<string, unknown>) =>
    jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ...config(), data: { ...config().data, ...data } }) } as Response);

  const onAndroid = (id: string | undefined, run: () => Promise<void>) => async () => {
    const before = { os: Platform.OS, id: process.env.EXPO_PUBLIC_ANDROID_PACKAGE };
    Platform.OS = 'android';
    if (id === undefined) delete process.env.EXPO_PUBLIC_ANDROID_PACKAGE; else process.env.EXPO_PUBLIC_ANDROID_PACKAGE = id;
    try { await run(); } finally {
      Platform.OS = before.os;
      if (before.id === undefined) delete process.env.EXPO_PUBLIC_ANDROID_PACKAGE; else process.env.EXPO_PUBLIC_ANDROID_PACKAGE = before.id;
    }
  };

  it('is refused with the typed error: code app_too_old, both versions, and the public Play listing of the real application id', onAndroid('org.example.coldstore', async () => {
    answer({ minimumClientVersion: '0.2.0' });
    const error = await discoverOperator(origin).catch(e => e);
    expect(error).toBeInstanceOf(AppTooOldError);
    expect(isAppTooOld(error)).toBe(true);
    expect(error).toMatchObject({
      code: 'app_too_old', minimum: '0.2.0', current: '0.1.0',
      updateUrl: 'https://play.google.com/store/apps/details?id=org.example.coldstore',
    });
  }));

  it.each([
    ['the placeholder com.example id', 'com.example.warehousemanager'],
    ['no id', undefined],
    ['a malformed id', 'Not An Id'],
  ])('carries no link for %s', (_name, id) => onAndroid(id, async () => {
    answer({ minimumClientVersion: '0.2.0' });
    const error = await discoverOperator(origin).catch(e => e);
    expect(error.updateUrl).toBeUndefined();
  })());

  it('carries no link on a phone that is not an Android one, even with a real id', async () => {
    const before = process.env.EXPO_PUBLIC_ANDROID_PACKAGE;
    process.env.EXPO_PUBLIC_ANDROID_PACKAGE = 'org.example.coldstore';
    try {
      answer({ minimumClientVersion: '0.2.0' });
      expect((await discoverOperator(origin).catch(e => e)).updateUrl).toBeUndefined();
    } finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_ANDROID_PACKAGE; else process.env.EXPO_PUBLIC_ANDROID_PACKAGE = before;
    }
  });

  it.each([
    ['the build\'s own real id wins over a different environment value', 'org.example.built', 'org.example.stale', 'org.example.built'],
    ['the environment value is used when the build has the placeholder id', 'com.example.warehousemanager', 'org.example.coldstore', 'org.example.coldstore'],
    ['the environment value is used when the build has no id', undefined, 'org.example.coldstore', 'org.example.coldstore'],
  ])('the link: %s', (_name, built, env, expected) => onAndroid(env, async () => {
    const config = Constants.expoConfig as { android?: { package?: string } };
    const before = config.android;
    config.android = built === undefined ? undefined : { package: built };
    try {
      answer({ minimumClientVersion: '0.2.0' });
      expect((await discoverOperator(origin).catch(e => e)).updateUrl).toBe(`https://play.google.com/store/apps/details?id=${expected}`);
    } finally {
      config.android = before;
    }
  })());

  it('is not told apart from an unreachable facility when the answer is merely incompatible', async () => {
    answer({ supportedApiVersions: ['2'] });
    const error = await discoverOperator(origin).catch(e => e);
    expect(isAppTooOld(error)).toBe(false);
  });
});

describe('discovery answered with an HTTP error', () => {
  const answerWith = (status: number, body: unknown) =>
    jest.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status, json: async () => body } as Response);

  it('503 with the code "upgrading" says the server is being updated, not "HTTP 503"', async () => {
    answerWith(503, { code: 'upgrading', message: "The facility's server is being updated. Try again in a few minutes." });
    await expect(discoverOperator(origin)).rejects.toThrow("The facility's server is being updated. Try again in a few minutes.");
  });

  it('503 "upgrading" and 429 carry a code, so a caller does not have to read the words', async () => {
    answerWith(503, { code: 'upgrading', message: 'x' });
    await expect(discoverOperator(origin)).rejects.toMatchObject({ code: 'upgrading' });
    answerWith(429, { message: 'Too many requests' });
    await expect(discoverOperator(origin)).rejects.toMatchObject({ code: 'discovery_busy' });
    answerWith(503, { message: 'The upstream server is unavailable' });
    await expect(discoverOperator(origin)).rejects.not.toHaveProperty('code');
  });

  it('another 503 keeps the HTTP text', async () => {
    answerWith(503, { message: 'The upstream server is unavailable' });
    await expect(discoverOperator(origin)).rejects.toThrow('Server discovery failed (HTTP 503).');
  });

  it('429 says the server is busy (it answered), and the identity the phone holds is kept', async () => {
    await saveOperatorServer({ origin, instanceId: 'instance-0001', displayName: 'Warehouse One', companyName: 'Example Operator' }, false);
    answerWith(429, { message: 'Too many requests' });
    await expect(discoverOperator(origin)).rejects.toThrow("The facility's server is busy. Try again in a moment.");
    expect(await loadOperatorServer()).toMatchObject({ origin, instanceId: 'instance-0001' });
  });
});
