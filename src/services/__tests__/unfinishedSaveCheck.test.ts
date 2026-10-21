/**
 * The check at app start of the creates that were in flight when the app closed (src/services/unfinishedSaveCheck.ts):
 * the server is asked about each request code once, and the person is told "Saved before the app closed" [Open | OK],
 * "Not saved" [OK], or nothing (the entry waits for the next start).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react-test-renderer';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';
import { checkUnfinishedSaves, savedIdOf } from '../unfinishedSaveCheck';
import { UNFINISHED_SAVE_MAX_AGE_MS, readUnfinishedSaves, rememberUnfinishedSave, resetUnfinishedSavesForTests } from '../unfinishedSaves';

jest.mock('@/utils/cacheManager', () => ({ getSessionCacheScope: jest.fn() }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The real question goes to the server; this test gives the answers.
jest.mock('@/utils/lostAnswer', () => ({ askSubmission: jest.fn() }));

const SCOPE = JSON.stringify(['https://alpha.invalid', 'inst-a', 'user-ana']);
const grn = { kind: 'grn' as const, requestKey: 'warehouse-grn-key-1', number: 'Z0010', customerName: 'Hilltop Fresh Mart' };
const dispatch = { kind: 'dispatch' as const, requestKey: 'warehouse-dispatch-key-1', number: 'D0042', customerName: 'Green Valley Traders' };

/** An entry from an earlier run of the app (the start-up check leaves the entries of this run to their screens). */
async function fromEarlierRun(entry: typeof grn | typeof dispatch, startedAt = Date.now() - 60_000) {
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
  ask = jest.fn();
  open = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  setLanguage('en');
});

describe('a create the server saved', () => {
  it('a GRN: says so with Open and OK, and Open shows the GRN', async () => {
    await fromEarlierRun(grn);
    ask.mockResolvedValue({ found: true, response: { success: true, data: { grn_id: 'grn-id-1', gr_no: 'Z0010' } } });

    await checkUnfinishedSaves({ ask, open });

    expect(ask).toHaveBeenCalledWith(grn.requestKey);
    expect(alerts()).toHaveLength(1);
    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Saved before the app closed');
    expect(message).toBe('GRN Z0010 for Hilltop Fresh Mart was saved.');
    expect(buttons?.map((button) => button.text)).toEqual(['Open', 'OK']);
    expect(open).not.toHaveBeenCalled();
    buttons?.[0].onPress?.();
    expect(open).toHaveBeenCalledWith('grn', 'grn-id-1');
    // Told, so it is not asked about again.
    expect(await keys()).toEqual([]);
  });

  it('a dispatch: the same, with the dispatch wording and its id', async () => {
    await fromEarlierRun(dispatch);
    ask.mockResolvedValue({ found: true, response: { success: true, dispatch_id: 'disp-id-1' } });

    await checkUnfinishedSaves({ ask, open });

    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Saved before the app closed');
    expect(message).toBe('Dispatch D0042 for Green Valley Traders was saved.');
    buttons?.[0].onPress?.();
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

describe('a create the server did not save', () => {
  it.each([
    [grn, 'GRN Z0010 for Hilltop Fresh Mart was not saved before the app closed. Enter it again if you still need it.'],
    [dispatch, 'Dispatch D0042 for Green Valley Traders was not saved before the app closed. Enter it again if you still need it.'],
  ])('says so with OK alone, and does not ask again', async (entry, sentence) => {
    await fromEarlierRun(entry);
    ask.mockResolvedValue({ found: false });

    await checkUnfinishedSaves({ ask, open });

    const [title, message, buttons] = alerts()[0];
    expect(title).toBe('Not saved');
    expect(message).toBe(sentence);
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
    await fromEarlierRun(grn, Date.now() - 120_000);
    await fromEarlierRun(dispatch, Date.now() - 60_000);
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
    await fromEarlierRun(dispatch, Date.now() - 60_000);
    await fromEarlierRun(grn, Date.now() - 120_000);
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
    expect(title).toBe('સચવાયું નથી');
    expect(message).toContain('Hilltop Fresh Mart');
    expect(message).toContain('Z0010');
    expect(message).not.toMatch(/not saved|GRN/);
    expect(buttons?.[0].text).toBe('ઓકે');
  });
});

