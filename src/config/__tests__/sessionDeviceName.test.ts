/**
 * WH-411: a session made without the phone's name is given it with `set_session_device_name`, once per session, only when the
 * backend has it, with every failure ignored. The names in the four sign-in bodies are in centralExchange, breakGlassSignIn,
 * customSession and localPairing tests; that the call asks for no sync is in afterWriteSync.test.ts.
 *
 * Real: sessionDeviceName, phoneDisplayName, backendFeatures, the session generation and registry, connectionHistory's
 * signed-in moment. Faked at the edge: the facility client's `rpc`, `Platform`, AsyncStorage.
 */
import type { PhoneKind } from '@/tests/helpers/phoneKind';

// Loaded after each module reset, so it fakes the same storage the modules under test read.
const asPhone = (kind: PhoneKind) => (require('@/tests/helpers/phoneKind') as typeof import('@/tests/helpers/phoneKind')).asPhone(kind);

const mockRpc = jest.fn(async (_name: string, _args: unknown): Promise<unknown> => ({ data: { success: true }, error: null }));
const mockClient = jest.fn(async () => ({ rpc: mockRpc }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: () => mockClient() }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const NAME = /^Samsung SM-A156E \([0-9A-F]{4}\)$/;

let restore: () => void = () => undefined;
const naming = () => require('@/config/sessionDeviceName') as typeof import('@/config/sessionDeviceName');
const lifecycle = () => require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle');
const release = (migration: number) =>
  (require('@/config/backendFeatures') as typeof import('@/config/backendFeatures')).setFacilityRelease(SERVER, { schemaHead: `00000000000${migration}_topic` });

beforeEach(async () => {
  jest.resetModules();
  mockRpc.mockClear();
  mockClient.mockClear();
  const storage = require('@react-native-async-storage/async-storage') as { default?: { clear(): Promise<void> }; clear(): Promise<void> };
  await (storage.default ?? storage).clear();
  restore = asPhone('android');
  // The facility the release is read for.
  jest.doMock('@/config/operatorServer', () => ({ ...jest.requireActual('@/config/operatorServer'), getActiveOperatorServer: () => SERVER }));
});
afterEach(() => restore());

describe('ensureSessionDeviceName', () => {
  it('names the session with the phone\'s name', async () => {
    release(248);
    await naming().ensureSessionDeviceName();
    expect(mockRpc.mock.calls).toEqual([['set_session_device_name', { p_device_name: expect.stringMatching(NAME) }]]);
  });

  it('calls nothing on a server older than 248, and names the session once the server has it', async () => {
    release(247);
    await naming().ensureSessionDeviceName();
    expect(mockRpc).not.toHaveBeenCalled();
    release(248);
    await naming().ensureSessionDeviceName();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('asks once in a session, also when asked twice at the same moment, and again in the next session', async () => {
    release(248);
    const { ensureSessionDeviceName } = naming();
    await Promise.all([ensureSessionDeviceName(), ensureSessionDeviceName()]);
    await ensureSessionDeviceName();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    lifecycle().advanceSessionGeneration();
    await ensureSessionDeviceName();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('the session registry clears what was tried', async () => {
    release(248);
    const { ensureSessionDeviceName } = naming();
    await ensureSessionDeviceName();
    await (require('@/config/sessionScopedRegistry') as typeof import('@/config/sessionScopedRegistry')).runSessionScopedClears({ dispatch: () => undefined });
    await ensureSessionDeviceName();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the call fails', () => mockRpc.mockRejectedValueOnce(new Error('Network request failed'))],
    ['there is no client', () => mockClient.mockRejectedValueOnce(new Error('Sign in required'))],
  ])('%s: it resolves, and is not retried in this session', async (_what, arrange) => {
    release(248);
    arrange();
    await expect(naming().ensureSessionDeviceName()).resolves.toBeUndefined();
    const calls = mockRpc.mock.calls.length;
    await naming().ensureSessionDeviceName();
    expect(mockRpc).toHaveBeenCalledTimes(calls);
    expect(mockClient).toHaveBeenCalledTimes(1);
  });

  it('a session that changes while the client is fetched is not named', async () => {
    release(248);
    mockClient.mockImplementationOnce(async () => {
      lifecycle().advanceSessionGeneration();
      return { rpc: mockRpc };
    });
    await naming().ensureSessionDeviceName();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a phone with no name (iOS) calls nothing', async () => {
    restore();
    restore = asPhone('ios');
    release(248);
    await naming().ensureSessionDeviceName();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('deviceNameField', () => {
  it('is the name on an Android phone and nothing on iOS', async () => {
    expect(await naming().deviceNameField()).toEqual({ device_name: expect.stringMatching(NAME) });
    restore();
    restore = asPhone('ios');
    expect(await naming().deviceNameField()).toEqual({});
  });

  it('a storage failure still names the phone, without the mark', async () => {
    restore();
    restore = asPhone('android, no mark kept');
    expect(await naming().deviceNameField()).toEqual({ device_name: 'Samsung SM-A156E' });
  });

  it('never throws: a phone whose constants cannot be read sends nothing', async () => {
    const { Platform } = require('react-native') as typeof import('react-native');
    Object.defineProperty(Platform, 'constants', { configurable: true, get: () => { throw new Error('no constants'); } });
    await expect(naming().deviceNameField()).resolves.toEqual({});
  });
});
