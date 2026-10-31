/**
 * The creates in flight, kept on the phone (src/services/unfinishedSaves.ts): written down before the request is
 * sent, per facility and per person, dropped after 7 days, and never in the way of a save.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionCacheScope } from '@/utils/cacheManager';
import {
  UNFINISHED_SAVE_MAX_AGE_MS,
  forgetUnfinishedSave,
  readUnfinishedSaves,
  releaseUnfinishedSave,
  rememberUnfinishedSave,
  resetUnfinishedSavesForTests,
  wasStartedThisRun,
} from '../unfinishedSaves';

jest.mock('@/utils/cacheManager', () => ({ getSessionCacheScope: jest.fn() }));

const STORAGE_KEY = 'unfinished_saves_v1';
const ANA_AT_ALPHA = JSON.stringify(['https://alpha.invalid', 'inst-a', 'user-ana']);
const BEN_AT_ALPHA = JSON.stringify(['https://alpha.invalid', 'inst-a', 'user-ben']);
const ANA_AT_BETA = JSON.stringify(['https://beta.invalid', 'inst-b', 'user-ana']);

const grn = { kind: 'grn' as const, requestKey: 'warehouse-grn-key-1', number: 'Z0010', customerName: 'Hilltop Fresh Mart' };
const dispatch = { kind: 'dispatch' as const, requestKey: 'warehouse-dispatch-key-1', number: 'D0042', customerName: 'Green Valley Traders' };

const signInAs = (scope: string | null) => jest.mocked(getSessionCacheScope).mockResolvedValue(scope);
const stored = async () => JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');

beforeEach(async () => {
  await AsyncStorage.clear();
  resetUnfinishedSavesForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  signInAs(ANA_AT_ALPHA);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('writing a create down', () => {
  it('keeps kind, request code, number, customer and the time, under the session scope', async () => {
    const before = Date.now();
    await rememberUnfinishedSave(grn);

    const table = await stored();
    expect(Object.keys(table)).toEqual([ANA_AT_ALPHA]);
    expect(table[ANA_AT_ALPHA]).toEqual([{ ...grn, startedAt: expect.any(Number) }]);
    expect(table[ANA_AT_ALPHA][0].startedAt).toBeGreaterThanOrEqual(before);
    expect(wasStartedThisRun(grn.requestKey)).toBe(true);
  });

  it('keeps an invoice like any other create', async () => {
    const invoice = { kind: 'invoice' as const, requestKey: 'warehouse-invoice-create-1', number: '12', customerName: 'Hilltop Fresh Mart' };
    await rememberUnfinishedSave(invoice);
    expect(await readUnfinishedSaves()).toEqual([{ ...invoice, startedAt: expect.any(Number) }]);
  });

  it('keeps a GRN and a dispatch side by side, oldest first when read', async () => {
    await rememberUnfinishedSave({ ...grn, startedAt: Date.now() - 5_000 });
    await rememberUnfinishedSave({ ...dispatch, startedAt: Date.now() - 9_000 });

    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([dispatch.requestKey, grn.requestKey]);
  });

  it('replaces the entry of the same request code instead of adding a second', async () => {
    await rememberUnfinishedSave(grn);
    await rememberUnfinishedSave({ ...grn, number: 'Z0011' });

    const entries = await readUnfinishedSaves();
    expect(entries).toHaveLength(1);
    expect(entries[0].number).toBe('Z0011');
  });

  it('keeps only the newest 20 of a person at a facility', async () => {
    for (let n = 0; n < 23; n += 1) await rememberUnfinishedSave({ ...grn, requestKey: `key-${n}`, startedAt: Date.now() - (30 - n) * 1000 });

    const keys = (await readUnfinishedSaves()).map((entry) => entry.requestKey);
    expect(keys).toHaveLength(20);
    expect(keys[0]).toBe('key-3');
    expect(keys[19]).toBe('key-22');
  });

  it('writes nothing without a session', async () => {
    signInAs(null);
    await rememberUnfinishedSave(grn);

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await readUnfinishedSaves()).toEqual([]);
  });

  it('two saves written down together are both kept', async () => {
    await Promise.all([rememberUnfinishedSave(grn), rememberUnfinishedSave(dispatch)]);

    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey).sort()).toEqual([dispatch.requestKey, grn.requestKey].sort());
  });
});

describe('a screen that gives its save up', () => {
  it('hands the note back: it stays stored, and is no longer this run\'s', async () => {
    await rememberUnfinishedSave(grn);
    expect(wasStartedThisRun(grn.requestKey)).toBe(true);

    releaseUnfinishedSave(grn.requestKey);

    expect(wasStartedThisRun(grn.requestKey)).toBe(false);
    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([grn.requestKey]);
  });

  it('ignores a code that was never written down', () => {
    expect(() => releaseUnfinishedSave('never-written')).not.toThrow();
  });
});

describe('per facility and per person', () => {
  it('shows a person only their own saves at the facility they are signed in to', async () => {
    await rememberUnfinishedSave(grn);
    signInAs(BEN_AT_ALPHA);
    await rememberUnfinishedSave(dispatch);

    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([dispatch.requestKey]);
    signInAs(ANA_AT_ALPHA);
    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([grn.requestKey]);
    signInAs(ANA_AT_BETA);
    expect(await readUnfinishedSaves()).toEqual([]);
  });

  it('keeps the note of a facility while the person works at another, and finds it again on return', async () => {
    await rememberUnfinishedSave(grn);
    signInAs(ANA_AT_BETA);
    await rememberUnfinishedSave(dispatch);
    signInAs(ANA_AT_ALPHA);

    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([grn.requestKey]);
  });
});

describe('removing a create whose answer is known', () => {
  it('removes the entry, in whichever scope it is, and the storage item with the last one', async () => {
    await rememberUnfinishedSave(grn);
    signInAs(ANA_AT_BETA);
    await rememberUnfinishedSave(dispatch);

    await forgetUnfinishedSave(grn.requestKey);
    expect(Object.keys(await stored())).toEqual([ANA_AT_BETA]);
    await forgetUnfinishedSave(dispatch.requestKey);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores a code that is not written down', async () => {
    await rememberUnfinishedSave(grn);
    await forgetUnfinishedSave('some-other-key');
    await forgetUnfinishedSave('some-other-key');

    expect(await readUnfinishedSaves()).toHaveLength(1);
  });
});

describe('the 7 days', () => {
  it('drops an entry older than 7 days when it is read, and removes it from storage', async () => {
    const day = 24 * 60 * 60 * 1000;
    await rememberUnfinishedSave({ ...grn, startedAt: Date.now() - 7 * day - 60_000 });
    await rememberUnfinishedSave({ ...dispatch, startedAt: Date.now() - 6 * day });

    const entries = await readUnfinishedSaves();

    expect(entries.map((entry) => entry.requestKey)).toEqual([dispatch.requestKey]);
    expect((await stored())[ANA_AT_ALPHA]).toHaveLength(1);
  });

  it('keeps an entry of exactly 7 days and drops it a moment later', async () => {
    jest.useFakeTimers({ now: 1_800_000_000_000 });
    await rememberUnfinishedSave(grn);

    jest.setSystemTime(1_800_000_000_000 + UNFINISHED_SAVE_MAX_AGE_MS);
    expect(await readUnfinishedSaves()).toHaveLength(1);
    jest.setSystemTime(1_800_000_000_000 + UNFINISHED_SAVE_MAX_AGE_MS + 1);
    expect(await readUnfinishedSaves()).toEqual([]);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('drops the old entries of another person too, so none lingers on the phone', async () => {
    const day = 24 * 60 * 60 * 1000;
    signInAs(BEN_AT_ALPHA);
    await rememberUnfinishedSave({ ...grn, startedAt: Date.now() - 8 * day });
    signInAs(ANA_AT_ALPHA);

    expect(await readUnfinishedSaves()).toEqual([]);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('never in the way of a save', () => {
  it('reads nothing from unreadable storage and recovers on the next write', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    expect(await readUnfinishedSaves()).toEqual([]);

    await rememberUnfinishedSave(grn);
    expect(await readUnfinishedSaves()).toHaveLength(1);
  });

  it('skips entries that are not well formed', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [ANA_AT_ALPHA]: [{ kind: 'order', requestKey: 'x', number: '1', customerName: 'c', startedAt: Date.now() }, { ...grn, startedAt: Date.now() }, 'text', null] })
    );

    expect((await readUnfinishedSaves()).map((entry) => entry.requestKey)).toEqual([grn.requestKey]);
  });

  it('resolves, and does not reject, when storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('disk full'));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('disk full'));

    await expect(rememberUnfinishedSave(grn)).resolves.toBeUndefined();
    await expect(forgetUnfinishedSave(grn.requestKey)).resolves.toBeUndefined();
    await expect(readUnfinishedSaves()).resolves.toEqual([]);
  });

  it('resolves when the session scope cannot be read', async () => {
    jest.mocked(getSessionCacheScope).mockRejectedValue(new Error('no keychain'));

    await expect(rememberUnfinishedSave(grn)).resolves.toBeUndefined();
    await expect(readUnfinishedSaves()).resolves.toEqual([]);
  });
});
