/**
 * The check at app start of the creates that were in flight when the app closed (src/services/unfinishedSaveCheck.ts):
 * the server is asked about each request code once, and the person is told "Earlier save" with [OK | Open] when it was
 * saved, "Earlier save" with [OK] when no saved record was found, or nothing (the entry waits for the next start). A note
 * the server has not had time to settle (younger than the lost-answer wait plus 20 s) is not asked about yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react-test-renderer';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';
import { ASK_AFTER_MS, checkUnfinishedSaves, savedIdOf } from '../unfinishedSaveCheck';
import { UNFINISHED_SAVE_MAX_AGE_MS, readUnfinishedSaves, rememberUnfinishedSave, resetUnfinishedSavesForTests } from '../unfinishedSaves';

jest.mock('@/utils/cacheManager', () => ({ getSessionCacheScope: jest.fn() }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: jest.fn(), onSessionChange: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The real question goes to the server; this test gives the answers.
jest.mock('@/utils/lostAnswer', () => ({ ...jest.requireActual('@/utils/lostAnswer'), askSubmission: jest.fn() }));

const SCOPE = JSON.stringify(['https://alpha.invalid', 'inst-a', 'user-ana']);
const grn = { kind: 'grn' as const, requestKey: 'warehouse-grn-key-1', number: 'Z0010', customerName: 'Hilltop Fresh Mart' };
const dispatch = { kind: 'dispatch' as const, requestKey: 'warehouse-dispatch-key-1', number: 'D0042', customerName: 'Green Valley Traders' };

/** An entry from an earlier run of the app (the start-up check leaves the entries of this run to their screens). */
async function fromEarlierRun(entry: typeof grn | typeof dispatch, startedAt = Date.now() - 5 * 60_000) {
  await rememberUnfinishedSave({ ...entry, startedAt });
  resetUnfinishedSavesForTests();
}
const keys = async () => (await readUnfinishedSaves()).map((entry) => entry.requestKey);
const alerts = () => jest.mocked(showAlert).mock.calls;

let ask: jest.Mock;
let open: jest.Mock;
let generation: number;

beforeEach(async () => {
  await AsyncStorage.clear();
  resetUnfinishedSavesForTests();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.mocked(getSessionCacheScope).mockResolvedValue(SCOPE);
  generation = 1;
  jest.mocked(getSessionGeneration).mockImplementation(() => generation);
  jest.mocked(onSessionChange).mockImplementation(() => () => {});
  ask = jest.fn();
  open = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe('a create the server saved', () => {
  it('a GRN: says so with OK and Open (Open is the main action, on the right), and Open shows the GRN', async () => {
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: true, response: { success: true, data: { grn_id: 'grn-id-1', gr_no: 'Z0010' } } });

    await checkUnfinishedSaves({ ask, open });

    expect(ask).toHaveBeenCalledWith(grn.requestKey);
    expect(alerts()).toHaveLength(1);
    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Earlier save');
    expect(message).toBe('GRN Z0010 for Hilltop Fresh Mart was saved.');
    expect(buttons?.map((button) => [button.text, button.style])).toEqual([['OK', 'cancel'], ['Open', undefined]]);
    expect(open).not.toHaveBeenCalled();
    buttons?.[1].onPress?.();
    expect(open).toHaveBeenCalledWith('grn', 'grn-id-1');
    // Told, so it is not asked about again.
    expect(await keys()).toEqual([]);
  });

  it('a dispatch: the same, with the dispatch wording and its id', async () => {
    await fromEarlierRun(dispatch);
    ask.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'disp-id-1' } });

    await checkUnfinishedSaves({ ask, open });

    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Earlier save');
    expect(message).toBe('Dispatch D0042 for Green Valley Traders was saved.');
    buttons?.[1].onPress?.();
    expect(open).toHaveBeenCalledWith('dispatch', 'disp-id-1');
    expect(await keys()).toEqual([]);
  });

  it('an answer without the document id has OK alone', async () => {
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: true, response: { success: true } });

    await checkUnfinishedSaves({ ask, open });

    expect(alerts()[0][2]?.map((button) => button.text)).toEqual(['OK']);
    expect(await keys()).toEqual([]);
  });

  it('reads the id from the shapes the server stores', () => {
    expect(savedIdOf('grn', { success: true, data: { grn_id: 'g1' } })).toBe('g1');
    expect(savedIdOf('grn', { dispatch_id: 'd1' })).toBeUndefined();
    expect(savedIdOf('dispatch', { dispatch_id: 'd1' })).toBe('d1');
    expect(savedIdOf('dispatch', { data: { dispatch_id: 'd2' } })).toBe('d2');
    expect(savedIdOf('dispatch', null)).toBeUndefined();
    expect(savedIdOf('grn', 'text')).toBeUndefined();
  });
});

describe('a create for which the server found no saved record', () => {
  it.each([
    [grn, 'No saved GRN Z0010 for Hilltop Fresh Mart was found. Enter it again if you still need it.'],
    [dispatch, 'No saved dispatch D0042 for Green Valley Traders was found. Enter it again if you still need it.'],
  ])('says so with OK alone (never that the app closed, or that nothing was saved), and does not ask again', async (entry, sentence) => {
    await fromEarlierRun(entry);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Earlier save');
    expect(message).toBe(sentence);
    expect(message).not.toMatch(/closed|not saved/i);
    expect(buttons?.map((button) => button.text)).toEqual(['OK']);
    expect(await keys()).toEqual([]);
  });
});

describe('a question the server does not answer', () => {
  it('says nothing and keeps the entry for the next start (no answer, an error, a throw)', async () => {
    await fromEarlierRun(grn);
    await fromEarlierRun(dispatch);
    ask.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));

    await checkUnfinishedSaves({ ask, open });

    expect(ask).toHaveBeenCalledTimes(2);
    expect(alerts()).toHaveLength(0);
    expect((await keys()).sort()).toEqual([dispatch.requestKey, grn.requestKey].sort());

    // The next start: the server answers.
    ask.mockReset();
    ask.mockResolvedValue({ found: false });
    await checkUnfinishedSaves({ ask, open });
    expect(alerts()).toHaveLength(2);
    expect(await keys()).toEqual([]);
  });

  it('settles the entries that were answered and keeps the one that was not', async () => {
    await fromEarlierRun(grn, Date.now() - 10 * 60_000);
    await fromEarlierRun(dispatch, Date.now() - 5 * 60_000);
    ask.mockResolvedValueOnce({ found: false }).mockResolvedValueOnce(undefined);

    await checkUnfinishedSaves({ ask, open });

    expect(alerts()).toHaveLength(1);
    expect(await keys()).toEqual([dispatch.requestKey]);
  });
});

describe('which entries are asked about', () => {
  it('drops an entry older than 7 days without asking', async () => {
    await fromEarlierRun(grn, Date.now() - UNFINISHED_SAVE_MAX_AGE_MS - 60_000);

    await checkUnfinishedSaves({ ask, open });

    expect(ask).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
    expect(await keys()).toEqual([]);
  });

  it('leaves a save written down in this run of the app to the screen that is saving', async () => {
    await rememberUnfinishedSave(grn);

    await checkUnfinishedSaves({ ask, open });

    expect(ask).not.toHaveBeenCalled();
    expect(await keys()).toEqual([grn.requestKey]);
  });

  it('asks nothing without a session', async () => {
    await fromEarlierRun(grn);
    jest.mocked(getSessionCacheScope).mockResolvedValue(null);

    await checkUnfinishedSaves({ ask, open });

    expect(ask).not.toHaveBeenCalled();
  });

  it('asks about the entries of the signed-in person only', async () => {
    await fromEarlierRun(grn);
    jest.mocked(getSessionCacheScope).mockResolvedValue(JSON.stringify(['https://alpha.invalid', 'inst-a', 'user-ben']));

    await checkUnfinishedSaves({ ask, open });

    expect(ask).not.toHaveBeenCalled();
    jest.mocked(getSessionCacheScope).mockResolvedValue(SCOPE);
    expect(await keys()).toEqual([grn.requestKey]);
  });

  it('asks about each entry once, oldest first', async () => {
    await fromEarlierRun(dispatch, Date.now() - 5 * 60_000);
    await fromEarlierRun(grn, Date.now() - 10 * 60_000);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    expect(ask.mock.calls.map(([key]) => key)).toEqual([grn.requestKey, dispatch.requestKey]);
  });
});

describe('a session that ends while the server is asked', () => {
  it('tells nothing and keeps the entry', async () => {
    await fromEarlierRun(grn);
    ask.mockImplementation(async () => {
      generation = 2;
      return { found: true, response: { success: true, data: { grn_id: 'g1' } } };
    });

    await checkUnfinishedSaves({ ask, open });

    expect(alerts()).toHaveLength(0);
    generation = 2;
    expect(await keys()).toEqual([grn.requestKey]);
  });
});

describe('one check at a time', () => {
  it('a second start-up signal while the check runs does not ask or tell twice', async () => {
    await fromEarlierRun(grn);
    let answer!: (value: unknown) => void;
    ask.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));

    const first = checkUnfinishedSaves({ ask, open });
    const second = checkUnfinishedSaves({ ask, open });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    answer({ found: false });
    await Promise.all([first, second]);

    expect(ask).toHaveBeenCalledTimes(1);
    expect(alerts()).toHaveLength(1);
  });
});

describe('the words', () => {
  it('are the app\'s own, in Gujarati too, with the typed names and numbers as typed', async () => {
    setLanguage('gu');
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('અગાઉ સાચવેલું');
    expect(message).toContain('Hilltop Fresh Mart');
    expect(message).toContain('Z0010');
    expect(message).not.toMatch(/saved|GRN/);
    expect(buttons?.[0].text).toBe('ઓકે');
  });
});


describe('a note the server has not had time to settle', () => {
  // setImmediate stays real so the storage promises can be flushed while the clock is fake.
  beforeEach(() => jest.useFakeTimers({ now: 1_800_000_000_000, doNotFake: ['setImmediate', 'nextTick'] }));
  afterEach(() => jest.useRealTimers());
  const flush = async () => { for (let n = 0; n < 5; n += 1) await new Promise((resolve) => setImmediate(resolve)); };

  it('a note started 2 s ago is not asked about, not told and stays stored; after the wait it is asked', async () => {
    await fromEarlierRun(grn, Date.now() - 2_000);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    expect(ask).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
    expect(await keys()).toEqual([grn.requestKey]);
    // One timer will run the check again.
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(ASK_AFTER_MS - 2_000 - 1);
    await flush();
    expect(ask).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(grn.requestKey);
    expect(alerts()).toHaveLength(1);
    expect(await keys()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('is old enough at the lost-answer wait plus 20 s, not before', async () => {
    expect(ASK_AFTER_MS).toBe(30_000);
    await fromEarlierRun(grn, Date.now() - (ASK_AFTER_MS - 1));
    await checkUnfinishedSaves({ ask, open });
    expect(ask).not.toHaveBeenCalled();
    jest.clearAllTimers();

    await fromEarlierRun(dispatch, Date.now() - ASK_AFTER_MS);
    ask.mockResolvedValue({ found: false });
    await checkUnfinishedSaves({ ask, open });
    expect(ask.mock.calls.map(([key]) => key)).toEqual([dispatch.requestKey]);
  });

  it('asks the old notes at once, and the young one when it is old enough, with one timer', async () => {
    await fromEarlierRun(grn, Date.now() - 5 * 60_000);
    await fromEarlierRun(dispatch, Date.now() - 5_000);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    expect(ask.mock.calls.map(([key]) => key)).toEqual([grn.requestKey]);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(ASK_AFTER_MS);
    await flush();
    expect(ask.mock.calls.map(([key]) => key)).toEqual([grn.requestKey, dispatch.requestKey]);
    expect(await keys()).toEqual([]);
  });

  it('the timer is cancelled when the session changes, and does nothing for a session that is gone', async () => {
    let sessionChanged: () => void = () => {};
    const stopWatching = jest.fn();
    jest.mocked(onSessionChange).mockImplementation((listener) => { sessionChanged = listener; return stopWatching; });
    await fromEarlierRun(grn, Date.now() - 2_000);

    await checkUnfinishedSaves({ ask, open });
    expect(jest.getTimerCount()).toBe(1);

    generation = 2;
    sessionChanged();
    expect(jest.getTimerCount()).toBe(0);
    expect(stopWatching).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(ASK_AFTER_MS);
    await flush();
    expect(ask).not.toHaveBeenCalled();
  });

  it('a timer that fires after the session changed without being told does nothing', async () => {
    await fromEarlierRun(grn, Date.now() - 2_000);
    await checkUnfinishedSaves({ ask, open });

    generation = 2;
    await jest.advanceTimersByTimeAsync(ASK_AFTER_MS);
    await flush();

    expect(ask).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(0);
  });
});

describe('the session changing under a check', () => {
  it('a signal for the new session waits for the old run and then runs for itself', async () => {
    await fromEarlierRun(grn);
    let answerOld!: (value: unknown) => void;
    ask.mockImplementationOnce(() => new Promise((resolve) => { answerOld = resolve; }));
    ask.mockResolvedValue({ found: false });

    const old = checkUnfinishedSaves({ ask, open });
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    generation = 2;
    const next = checkUnfinishedSaves({ ask, open });
    expect(next).not.toBe(old);

    await act(async () => { answerOld({ found: false }); });
    await Promise.all([old, next]);

    // The old run told nobody (its session had ended); the new one asked again and told once.
    expect(ask).toHaveBeenCalledTimes(2);
    expect(alerts()).toHaveLength(1);
    expect(await keys()).toEqual([]);
  });

  it('a second signal for the SAME session still returns the run that is going', async () => {
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: false });
    const first = checkUnfinishedSaves({ ask, open });
    expect(checkUnfinishedSaves({ ask, open })).toBe(first);
    await first;
  });

  it('tells nobody when the session ends while the note is being removed', async () => {
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: false });
    const remove = AsyncStorage.removeItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'removeItem').mockImplementation(async (key: string) => {
      generation = 2;
      return remove(key);
    });

    await checkUnfinishedSaves({ ask, open });

    expect(alerts()).toHaveLength(0);
  });
});
