/**
 * WH-298, spec A step 1 (contract section 3; T1 to T4, T6): the app opens with no connection, after a kill or a
 * reboot, into the facility last signed in to, with the server settings it last received. A facility never opened on
 * this phone still needs the server. "Update the app" and "being upgraded" still apply when the server answers.
 *
 * The real `verifySelectedOperator`, `verifyForegroundOperator` and `offlineStart` run; faked are the network
 * (`fetch`), the phone's storage (the async-storage mock), and the two reads of the signed-in state that decide whether
 * a person is signed in on this phone (`getStoredToken`, `getCachedUserProfile` of supabaseConfig).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - `@/config/offlineStart`: `rememberOfflineStart(server, config)`, `readOfflineStart(server)` (null unless origin AND
 *    instance match), `forgetOfflineStart()`, `isNoAnswer(error)`; AsyncStorage key `offline_start_v1`.
 *  - `verifySelectedOperator` answers `{ kind: 'offline', server, config }` under the conditions of contract 3.2.
 *  - It reads the token with `getStoredToken()` and the profile with `getCachedUserProfile()` of `@/config/supabaseConfig`
 *    (the existing names). If the build reads them through other functions, change the mock below.
 *  - `capabilities.sync` is a boolean of the public config, false when absent.
 * ===========================================================================================
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySelectedOperator, verifyForegroundOperator } from '../operatorBootstrap';
import { loadOperatorServer, saveOperatorServer, getActiveOperatorServer } from '../operatorServer';
import { clearAppTooOld } from '../appTooOld';
import { resetUpgradeNotice } from '../upgradeNotice';
import { resetFacilityCapabilities, getFacilityCapabilities } from '../facilityCapabilities';
import { RequestTimeoutError } from '@/config/supabaseConfig';
import { forgetOfflineStart, isNoAnswer, readOfflineStart, rememberOfflineStart } from '../offlineStart';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
let mockToken: { authToken?: string; isValid: boolean } = { isValid: false };
let mockProfile: unknown = null;
jest.mock('@/config/supabaseConfig', () => ({
  getStoredToken: jest.fn(async () => mockToken),
  getCachedUserProfile: jest.fn(async () => mockProfile),
  RequestTimeoutError: class RequestTimeoutError extends Error {},
  initializeSupabase: jest.fn(),
}));

const selected = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Company' };
const anon = `header.${btoa(JSON.stringify({ role: 'anon', exp: 9999999999 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
type Over = { instanceId?: string; displayName?: string; minimumClientVersion?: string; capabilities?: Record<string, boolean>; status?: number; body?: object };
const answer = (over: Over = {}) => {
  if (over.status) return { ok: false, status: over.status, json: async () => over.body ?? {} } as Response;
  return {
    ok: true, status: 200,
    json: async () => ({ success: true, data: {
      supabaseUrl: selected.origin, anonKey: anon, environment: 'production', version: '0.1.0', maintenanceMode: false,
      instanceId: over.instanceId ?? selected.instanceId, displayName: over.displayName ?? selected.displayName,
      companyName: selected.companyName, canonicalOrigin: selected.origin, supportedApiVersions: ['1'],
      minimumClientVersion: over.minimumClientVersion ?? '0.1.0', capabilities: over.capabilities ?? { sync: true },
      urls: { publicConfig: `${selected.origin}/functions/v1/get-public-config`, fullConfig: `${selected.origin}/functions/v1/get-config` },
    } }),
  } as Response;
};
const noConnection = () => jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));
const oldFetch = global.fetch;
const never = () => { throw new Error('no cleanup expected here'); };
const signedIn = () => { mockToken = { authToken: 'header.payload.sig', isValid: true }; mockProfile = { id: 'profile-1', role: 'staff', name: 'Asha Fictional' }; };

beforeEach(async () => {
  await AsyncStorage.clear();
  clearAppTooOld(); resetUpgradeNotice(); resetFacilityCapabilities();
  await loadOperatorServer();
  await saveOperatorServer(selected);
  mockToken = { isValid: false }; mockProfile = null;
  global.fetch = jest.fn().mockResolvedValue(answer());
});
afterAll(() => { global.fetch = oldFetch; });

/** One online start that leaves the phone with the facility's last settings. */
async function openedOnline(over: Over = {}) {
  jest.mocked(global.fetch).mockResolvedValue(answer(over));
  expect((await verifySelectedOperator(() => true, never)).kind).toBe('verified');
}

describe('T1: opening with no connection', () => {
  it('opens offline into the facility with the last settings when the person is signed in on this phone', async () => {
    await openedOnline({ displayName: 'Fictional Cold Store (renamed)' });
    signedIn();
    noConnection();
    const result = await verifySelectedOperator(() => true, never);
    expect(result.kind).toBe('offline');
    if (result.kind !== 'offline') return;
    expect(result.server).toMatchObject({ origin: selected.origin, instanceId: selected.instanceId });
    expect(result.config).toMatchObject({ supabaseUrl: selected.origin, displayName: 'Fictional Cold Store (renamed)', capabilities: { sync: true } });
  });

  it('works after a kill: the record is in storage, not in memory', async () => {
    await openedOnline();
    signedIn();
    // A kill reloads every module but not the phone's storage: the reloaded app gets the same stored files.
    const storage = jest.requireMock('@react-native-async-storage/async-storage');
    jest.resetModules();
    jest.doMock('@react-native-async-storage/async-storage', () => storage);
    const fresh = require('../operatorBootstrap') as typeof import('../operatorBootstrap');
    const server = require('../operatorServer') as typeof import('../operatorServer');
    await server.loadOperatorServer();
    noConnection();
    expect((await fresh.verifySelectedOperator(() => true, never)).kind).toBe('offline');
  });

  it('opens offline on every cold start, not just the first (the record is kept, not used up)', async () => {
    await openedOnline();
    signedIn();
    noConnection();
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
  });

  it('uses any stored token, expired or not (the first request will find out)', async () => {
    await openedOnline();
    signedIn();
    mockToken = { authToken: 'header.payload.sig', isValid: false };
    noConnection();
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
  });

  it('a no-answer timeout opens offline like a lost connection', async () => {
    await openedOnline();
    signedIn();
    jest.mocked(global.fetch).mockRejectedValue(new RequestTimeoutError());
    expect((await verifySelectedOperator(() => true, never)).kind).toBe('offline');
  });
});

describe('T2: when the server is still needed (the error is thrown as today)', () => {
  it('a facility never opened on this phone (no record)', async () => {
    signedIn();
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('no record for this instance (the record is another facility\'s)', async () => {
    await openedOnline();
    signedIn();
    await rememberOfflineStart({ ...selected, origin: 'https://other.example.test', instanceId: 'instance-b' }, (await readOfflineStart(selected))!);
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('the record says sync is off', async () => {
    await openedOnline({ capabilities: { sync: false } });
    signedIn();
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('no stored token (the person is signed out)', async () => {
    await openedOnline();
    mockToken = { isValid: false }; mockProfile = { id: 'profile-1', role: 'staff' };
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('no cached profile', async () => {
    await openedOnline();
    mockToken = { authToken: 'header.payload.sig', isValid: true }; mockProfile = null;
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('the chosen server is not the one in the record (instance changed on the phone)', async () => {
    await openedOnline();
    signedIn();
    await saveOperatorServer({ ...selected, instanceId: 'instance-other' });
    noConnection();
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('with no facility chosen at all it asks for the selection and does not try the network', async () => {
    await AsyncStorage.clear();
    await loadOperatorServer();
    global.fetch = jest.fn();
    expect(await verifySelectedOperator(() => true, never)).toEqual({ kind: 'selection' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('T3: an answer from the server is never "no connection"', () => {
  it('"Update the app" still shows when the server answers with a minimum above this build', async () => {
    await openedOnline();
    signedIn();
    jest.mocked(global.fetch).mockResolvedValue(answer({ minimumClientVersion: '9.0.0' }));
    await expect(verifySelectedOperator(() => true, never)).rejects.toMatchObject({ code: 'app_too_old' });
  });

  it('"being upgraded" still shows when the server answers 503 with the upgrade code', async () => {
    await openedOnline();
    signedIn();
    jest.mocked(global.fetch).mockResolvedValue(answer({ status: 503, body: { code: 'upgrading' } }));
    await expect(verifySelectedOperator(() => true, never)).rejects.toMatchObject({ code: 'upgrading' });
  });

  it('an error status such as 500 does not open the stored copy as if offline', async () => {
    await openedOnline();
    signedIn();
    jest.mocked(global.fetch).mockResolvedValue(answer({ status: 500 }));
    await expect(verifySelectedOperator(() => true, never)).rejects.toThrow();
  });

  it('a server that has become another facility (new instance id) is cleaned up as today, never opened from the old record', async () => {
    await openedOnline();
    signedIn();
    jest.mocked(global.fetch).mockResolvedValue(answer({ instanceId: 'instance-replacement' }));
    const clear = jest.fn(async () => {});
    expect((await verifySelectedOperator(() => true, clear)).kind).toBe('verified');
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('a start that is no longer current when the failure arrives is superseded, not opened', async () => {
    await openedOnline();
    signedIn();
    let current = true;
    jest.mocked(global.fetch).mockImplementation(async () => { current = false; throw new TypeError('Network request failed'); });
    expect(await verifySelectedOperator(() => current, never)).toEqual({ kind: 'superseded' });
  });

  it('isNoAnswer: a lost connection is a no-answer; an error answered by the server is not', () => {
    expect(isNoAnswer(new TypeError('Network request failed'))).toBe(true);
    expect(isNoAnswer(Object.assign(new Error('Discovery failed with HTTP 500'), { status: 500 }))).toBe(false);
    expect(isNoAnswer(Object.assign(new Error('upgrading'), { code: 'upgrading' }))).toBe(false);
    expect(isNoAnswer(Object.assign(new Error('too old'), { code: 'app_too_old' }))).toBe(false);
  });
});

describe('T4: what is kept', () => {
  it('a verified discovery with sync on writes the record: origin, instance, the public config', async () => {
    await openedOnline({ displayName: 'Name One' });
    const kept = await readOfflineStart(selected);
    expect(kept).toMatchObject({ displayName: 'Name One', capabilities: { sync: true } });
    expect(JSON.parse((await AsyncStorage.getItem('offline_start_v1'))!)).toMatchObject({ origin: selected.origin, instanceId: selected.instanceId });
  });

  it('the newest answer replaces the record', async () => {
    await openedOnline({ displayName: 'Name One' });
    await openedOnline({ displayName: 'Name Two' });
    expect((await readOfflineStart(selected))?.displayName).toBe('Name Two');
  });

  it('a verified discovery with sync off removes the record', async () => {
    await openedOnline();
    expect(await readOfflineStart(selected)).not.toBeNull();
    await openedOnline({ capabilities: { sync: false } });
    expect(await readOfflineStart(selected)).toBeNull();
  });

  it('readOfflineStart answers null unless origin AND instance match', async () => {
    await openedOnline();
    expect(await readOfflineStart({ ...selected, instanceId: 'instance-x' })).toBeNull();
    expect(await readOfflineStart({ ...selected, origin: 'https://other.example.test' })).toBeNull();
  });

  it('forgetOfflineStart removes it', async () => {
    await openedOnline();
    await forgetOfflineStart();
    expect(await readOfflineStart(selected)).toBeNull();
  });

  it('keeps no token, key or credential in the record (only what any caller can fetch without signing in)', async () => {
    signedIn();
    await openedOnline();
    const raw = (await AsyncStorage.getItem('offline_start_v1'))!;
    expect(raw).not.toContain('header.payload.sig');
    expect(raw).not.toMatch(/refresh|secret|password/i);
  });
});

describe('T6: returning to the foreground with no answer', () => {
  it('is not verified, whatever the record: the gate stays required and the next request tries again', async () => {
    await openedOnline();
    signedIn();
    noConnection();
    const clear = jest.fn(), initialize = jest.fn();
    expect(await verifyForegroundOperator(() => true, clear, initialize)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    expect(getActiveOperatorServer()).toMatchObject({ instanceId: selected.instanceId });
  });

  it('the capabilities of the last answer stay in force after an offline start', async () => {
    await openedOnline({ capabilities: { sync: true, payments: true } });
    signedIn();
    resetFacilityCapabilities();
    noConnection();
    const result = await verifySelectedOperator(() => true, never);
    expect(result.kind).toBe('offline');
    expect(getFacilityCapabilities().payments).toBe(true);
  });
});
