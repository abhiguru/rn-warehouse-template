/**
 * WH-300, Find goods: the gate, the reader and the service, over the phone copy. Contract
 * product/tech/app-offline-find-goods.md (G1 to G3, F1 to F8, sections 2 to 5, 7 and 8); the parity expectation of
 * section 7 is the server's rows (get_all_grn_items, here its tested copy answer from WH-299), stable-partitioned
 * (stock above 0 first), plus answers worked out by hand over the warehouse of grnDataset.ts.
 *
 * Real: the sync engine, the copy, the services and readers. Faked at the edge: the server's answers, the phone's native
 * modules, and (F5 only) the phone's unsent work, which no card fills yet (WH-301 and later): a fake overlay.
 *
 * Written before the build: the modules do not exist yet, so each case fails on the import until Development builds them.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives) =====
 *  - `@/features/find-goods/findGoodsService`: `findGoods(query, offset)` -> `{ kind: 'page', page: { data, total_count, limit, offset }, source, copyId, olderLoading } | { kind: 'not-ready' } | { kind: 'failed' }`.
 *  - `@/features/find-goods/findGoodsGate`: `findGoodsState()` -> 'hidden' | 'loading' | 'ready'.
 *  - `@/features/phone-copy/readRoute`: `copyEligible()`, `readCopyOnly(fromCopy)` -> `{ kind: 'answer', answer } | { kind: 'not-ready' } | { kind: 'failed' }`.
 *  - `getUnsentOverlay()` (unsentOverlay.ts) answers an overlay with `deductions(): ReadonlyMap<lotId, number>` as well.
 * NOT NAMED BY THE CONTRACT (so not tested): how the failure is logged beyond "once, no row data" (F8: tested as a
 * single console.warn without a row's text); what `findGoods` returns for `offset` beyond the last row (an empty page is assumed).
 * ==================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { LOTS, lotNamed, seedWarehouse, serverRow } from '@/tests/phoneCopy/grnDataset';
import { statementLog } from '@/tests/phoneCopy/fakeExpoSqlite';
import { bootWarehouse, copySource, goOffline, loadCopy, loadUpTo, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const mockOverlay = {
  lessUnsent: new Map<string, number>(),
  lessHeld: new Map<string, number>(),
};
jest.mock('@/features/phone-copy/unsentOverlay', () => {
  const actual = jest.requireActual('@/features/phone-copy/unsentOverlay');
  return {
    ...actual,
    getUnsentOverlay: () => ({
      grn: () => null,
      lot: () => null,
      dispatch: () => null,
      lessUnsent: (id: string) => mockOverlay.lessUnsent.get(id) ?? 0,
      lessHeld: (id: string) => mockOverlay.lessHeld.get(id) ?? 0,
      deductions: () => {
        const sum = new Map<string, number>();
        for (const map of [mockOverlay.lessUnsent, mockOverlay.lessHeld]) {
          for (const [id, n] of map) sum.set(id, (sum.get(id) ?? 0) + n);
        }
        for (const [id, n] of [...sum]) if (n <= 0) sum.delete(id);
        return sum;
      },
    }),
  };
});

type Row = ReturnType<typeof serverRow>;
type Page = { data: Row[]; total_count: number; limit: number; offset: number };
type Answer =
  | { kind: 'page'; page: Page; source: unknown; copyId: string; olderLoading: boolean }
  | { kind: 'not-ready' }
  | { kind: 'failed' };
const service = () => require('@/features/find-goods/findGoodsService') as { findGoods(query: string, offset: number): Promise<Answer> };
const gate = () => require('@/features/find-goods/findGoodsGate') as { findGoodsState(): 'hidden' | 'loading' | 'ready' };
const route = () => require('@/features/phone-copy/readRoute') as {
  copyEligible(): boolean;
  readCopyOnly<T>(fromCopy: (q: { get<R>(sql: string): Promise<R | null> }) => Promise<T>): Promise<
    { kind: 'answer'; answer: { value: T; source: unknown } } | { kind: 'not-ready' } | { kind: 'failed' }>;
  readVia<T>(need: 'stage1' | 'all', fromCopy: (q: { get<R>(sql: string): Promise<R | null> }) => Promise<T>): Promise<unknown>;
};
type GrnService = typeof import('@/services/grn-service');
const grnService = () => require('@/services/grn-service') as GrnService;

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  mockOverlay.lessUnsent.clear();
  mockOverlay.lessHeld.clear();
});
afterEach(async () => { await eraseEverything(); });

async function ready(role: Role = 'staff') {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}
const ids = (answer: Answer): string[] => {
  expect(answer.kind).toBe('page');
  return (answer as Extract<Answer, { kind: 'page' }>).page.data.map(r => r.grn_item_id);
};
const pageOf = (answer: Answer) => (answer as Extract<Answer, { kind: 'page' }>).page;
const stockOf = (lotId: string) => lotNamed(lotId).stock;

/** Every page of a search, concatenated. */
async function allPages(query: string) {
  const rows: Row[] = [];
  let total = -1;
  for (let offset = 0; ; offset += 50) {
    const answer = await service().findGoods(query, offset);
    const page = pageOf(answer);
    total = page.total_count;
    rows.push(...page.data);
    if (page.data.length < 50) break;
  }
  return { rows, total };
}
/** The server's rows for a search (WH-299's tested copy answer), paged to the end, stable-partitioned. */
async function expectedFor(query: string) {
  const rows: Row[] = [];
  let total = 0;
  for (let offset = 0; ; offset += 50) {
    const result = await grnService().getAllGRNItems({ p_filters: { search: query }, p_sort_by: 'date', p_sort_order: 'desc', p_limit: 50, p_offset: offset });
    rows.push(...(result.data.items as unknown as Row[]));
    total = result.data.pagination.total_count;
    if (result.data.items.length < 50) break;
  }
  return { rows: [...rows.filter(r => r.stock > 0), ...rows.filter(r => !(r.stock > 0))], total };
}

describe('G: when Find goods is offered', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('G1: %s, copy complete: ready, online and offline', async role => {
    const w = await ready(role);
    expect(gate().findGoodsState()).toBe('ready');
    await goOffline(w);
    expect(gate().findGoodsState()).toBe('ready');
  });

  it('G1: ready while older records still load (stage two), online and offline', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    expect(gate().findGoodsState()).toBe('ready');
    await goOffline(w);
    expect(gate().findGoodsState()).toBe('ready');
    await load.finish();
  });

  it('G2: loading before the first load and during stage one', async () => {
    const w = await bootWarehouse();
    expect(gate().findGoodsState()).toBe('loading');
    await w.phone.engine.startPhoneCopy();
    expect(gate().findGoodsState()).toBe('loading');
    const load = await loadUpTo(w, 'goodsreceived');
    expect(gate().findGoodsState()).toBe('loading');
    await load.finish();
    expect(gate().findGoodsState()).toBe('ready');
  });

  it('G3: hidden with the capability off', async () => {
    const w = await bootWarehouse({ capability: false });
    expect(route().copyEligible()).toBe(false);
    expect(gate().findGoodsState()).toBe('hidden');
    w.setCapability(true);
    expect(route().copyEligible()).toBe(true);
  });

  it('G3: hidden for a customer account, even over a loaded copy (WH-306, PQ1)', async () => {
    const w = await ready('staff');
    expect(gate().findGoodsState()).toBe('ready');
    w.setRole('customer');
    expect(gate().findGoodsState()).toBe('hidden');
  });

  it('G3: hidden when the server sends format 1 (an older server)', async () => {
    env.feed.format = 1;
    const w = await bootWarehouse();
    await w.phone.engine.startPhoneCopy();
    await w.phone.engine.syncNow('open');
    expect(gate().findGoodsState()).toBe('hidden');
  });
});

describe('F1: nothing typed', () => {
  it.each(['', '   ', ' \t '])('"%s": an empty page and no statement run', async query => {
    await ready();
    const before = statementLog().length;
    const answer = await service().findGoods(query, 0);
    expect(answer.kind).toBe('page');
    expect(pageOf(answer).data).toEqual([]);
    expect(pageOf(answer).total_count).toBe(0);
    expect(statementLog().length).toBe(before);
  });
});

describe('F2 and F3: the rows and their order', () => {
  it('every lot matches "a": stock first, then the empty lot; newest GRN first, equal dates by GRN number', async () => {
    const w = await ready();
    const answer = await service().findGoods('a', 0);
    expect(ids(answer)).toEqual(['l08', 'l07', 'l05', 'l06', 'l04', 'l03', 'l01', 'l02']);
    expect(pageOf(answer).data).toStrictEqual(['l08', 'l07', 'l05', 'l06', 'l04', 'l03', 'l01', 'l02'].map(serverRow));
    expect(pageOf(answer)).toMatchObject({ total_count: 8, limit: 50, offset: 0 });
    expect(w.serverCalls).toEqual([]);
  });

  it('the answer says it came from the copy, with its time, and which copy', async () => {
    await ready();
    const answer = (await service().findGoods('peas', 0)) as Extract<Answer, { kind: 'page' }>;
    expect(answer.source).toEqual(copySource());
    expect(answer.copyId).toEqual(expect.any(String));
    expect(answer.copyId).not.toBe('');
    expect(answer.olderLoading).toBe(false);
  });

  it.each([
    ['an item', 'peas', ['l08', 'l06', 'l01', 'l02']],
    ['an item in capitals', 'PEAS', ['l08', 'l06', 'l01', 'l02']],
    ['another item', 'rice', ['l07', 'l05']],
    ['a rack', 'd-4', ['l06']],
    ['a rack of an empty lot: found, and counted', 'b-2', ['l02']],
    ['a mark, any case', 'pk', ['l06', 'l01', 'l02']],
    ['a customer', 'asha', ['l08', 'l06', 'l03', 'l02']],
    ['a GRN number fragment', 'a2', ['l03', 'l02']],
    ['"%" is a plain character', '%', ['l03']],
    ['"_" is a plain character', '_', ['l03']],
    ['"\\" is a plain character', '\\', ['l05']],
    ['a Gujarati mark', 'ગ', ['l07']],
    ['a word nothing has', 'zzzz', []],
    ['one word found and one not', 'peas zzzz', []],
  ])('%s: "%s"', async (_name, query, expected) => {
    await ready();
    const answer = await service().findGoods(query, 0);
    expect(ids(answer)).toEqual(expected);
    expect(pageOf(answer).total_count).toBe(expected.length);
  });

  it('the lot of a soft-deleted GRN is found, as get_all_grn_items has no deleted_at filter', async () => {
    const gone = env.feed.rows.goodsreceived.find(r => r.id === 'g-B1');
    expect(gone).toBeDefined();
    env.feed.rows.goodsreceived = env.feed.rows.goodsreceived.map(r => (r.id === 'g-B1' ? { id: r.id, row: { ...(r.row as object), deleted_at: '2026-11-24T05:00:00+00:00' } } : r));
    await ready('admin');
    expect(ids(await service().findGoods('d-4', 0))).toEqual(['l06']);
  });

  const LONG = 'peas '.repeat(30).trim();   // 149 characters, 30 words
  it.each([
    ['', '1-character'], ['a', '1-character'], ['5', 'a digit'], ['e', '1-character'], ['pk', '2 characters'], ['a1', '2 characters'],
    ['%', 'percent'], ['_', 'underscore'], ['\\', 'backslash'], ['b-3', 'a rack'], ['PK-77', 'a mark'], ['peas', 'an item word'],
    ['asha', 'a customer word'], ['gr-', 'a GRN number fragment'], ['PEAS', 'capitals'], ['ગ', 'Gujarati'], ['ગ-5', 'Gujarati mark'],
    ['peas bag 1 2 3 4 5 6 7 8 9', '9+ words'], [LONG, '121+ characters'], ['zzzz', 'matches nothing'], ['\u001f', 'the unit separator'],
  ])('F2 parity for "%s" (%s): the server\'s rows, stock first', async query => {
    for (const role of ['admin', 'supervisor', 'staff'] as const) {
      const w = await bootWarehouse({ role });
      await loadCopy(w);
      // Contract 2 and F1: nothing typed is an empty page, never every lot; the server's list for "" is not what Find goods shows.
      const expected = query === '' ? { rows: [], total: 0 } : await expectedFor(query);
      const actual = await allPages(query);
      expect(actual.rows).toEqual(expected.rows);
      expect(actual.total).toBe(expected.total);
      await eraseEverything();
      resetEnv();
      seedWarehouse();
    }
  });
});

describe('F4: pages', () => {
  /** 60 lots of one new item "Gravel" on GRN B1 (one date, one number): ordered by lot id; 10 of them empty. */
  function addGravel() {
    for (let n = 1; n <= 60; n += 1) {
      const id = `z${String(n).padStart(2, '0')}`;
      env.feed.rows.goodsreceived_trl.push({ id, row: { ...lotNamed('l06'), id, item_name: 'Gravel', stock: n % 6 === 0 ? 0 : 7, emptied_at: null } });
    }
  }
  const gravelIds = (empty: boolean) =>
    Array.from({ length: 60 }, (_x, i) => i + 1).filter(n => (n % 6 === 0) === empty).map(n => `z${String(n).padStart(2, '0')}`);

  it('pages of 50 concatenate to the whole list, with the same count on each page', async () => {
    addGravel();
    await ready();
    const first = await service().findGoods('gravel', 0);
    const second = await service().findGoods('gravel', 50);
    expect(pageOf(first).data).toHaveLength(50);
    expect(pageOf(second).data).toHaveLength(10);
    expect(pageOf(first)).toMatchObject({ total_count: 60, limit: 50, offset: 0 });
    expect(pageOf(second)).toMatchObject({ total_count: 60, limit: 50, offset: 50 });
    // with stock first, then the 10 empty ones, each group by lot id
    expect([...ids(first), ...ids(second)]).toEqual([...gravelIds(false), ...gravelIds(true)]);
  });

  it('an offset past the last row answers an empty page', async () => {
    await ready();
    const answer = await service().findGoods('a', 8);
    expect(pageOf(answer).data).toEqual([]);
  });
});

describe('F5: this phone\'s unsent dispatches and held dispatches (the overlay seam)', () => {
  it('a lot whose whole stock is deducted drops to the second group with 0; a partial deduction lowers the number and keeps the group', async () => {
    mockOverlay.lessUnsent.set('l08', 2);   // all of its 2
    mockOverlay.lessUnsent.set('l06', 4);   // 9 -> 5
    mockOverlay.lessHeld.set('l07', 3);     // 8 -> 5
    await ready();
    const answer = await service().findGoods('a', 0);
    // group 1 (stock above 0): l07, l05, l06, l04, l03, l01; group 2: l08 (newer) then l02
    expect(ids(answer)).toEqual(['l07', 'l05', 'l06', 'l04', 'l03', 'l01', 'l08', 'l02']);
    const byId = new Map(pageOf(answer).data.map(r => [r.grn_item_id, r.stock]));
    expect(byId.get('l08')).toBe(0);
    expect(byId.get('l06')).toBe(5);
    expect(byId.get('l07')).toBe(5);
    expect(byId.get('l05')).toBe(stockOf('l05'));
    expect(pageOf(answer).total_count).toBe(8);
  });

  it('unsent and held deductions of one lot add up', async () => {
    mockOverlay.lessUnsent.set('l04', 5);
    mockOverlay.lessHeld.set('l04', 15);    // 20 -> 0
    await ready();
    const answer = await service().findGoods('c-1', 0);
    expect(pageOf(answer).data.map(r => [r.grn_item_id, r.stock])).toEqual([['l04', 0]]);
    const all = await service().findGoods('a', 0);
    expect(ids(all).slice(-2)).toEqual(['l04', 'l02']);
  });
});

describe('F6: no network, whatever the connection', () => {
  it.each(['online', 'offline', 'stage two online', 'stage two offline'])('%s: nothing reaches the server', async mode => {
    const w = await bootWarehouse();
    const load = mode.startsWith('stage two') ? await loadUpTo(w, 'dispatch') : undefined;
    if (!load) await loadCopy(w);
    if (mode.endsWith('offline')) await goOffline(w);
    const answer = await service().findGoods('peas', 0);
    expect(ids(answer)).toEqual(['l08', 'l06', 'l01', 'l02']);
    expect((answer as Extract<Answer, { kind: 'page' }>).olderLoading).toBe(mode.startsWith('stage two'));
    expect(w.serverCalls).toEqual([]);
    await load?.finish();
  });

  it('not ready (no copy yet, or only stage one loaded): not-ready, and still no call to the server', async () => {
    const w = await bootWarehouse();
    expect(await service().findGoods('peas', 0)).toEqual({ kind: 'not-ready' });
    const load = await loadUpTo(w, 'goodsreceived');
    expect(await service().findGoods('peas', 0)).toEqual({ kind: 'not-ready' });
    await load.finish();
    expect(w.serverCalls).toEqual([]);
  });

  it('a customer account never reads the copy through Find goods', async () => {
    const w = await ready('staff');
    w.setRole('customer');
    const answer = await service().findGoods('peas', 0);
    expect(answer.kind).not.toBe('page');
    expect(w.serverCalls).toEqual([]);
  });
});

describe('F7: readCopyOnly', () => {
  it('in stage two, online, answers from the copy where readVia (stage one need) answers the server', async () => {
    const w = await bootWarehouse();
    const load = await loadUpTo(w, 'dispatch');
    expect(await route().readVia('stage1', async q => q.get('SELECT 1 AS n'))).toBeNull();   // today: the server path
    const result = await route().readCopyOnly(async q => q.get<{ n: number }>('SELECT 1 AS n'));
    expect(result).toEqual({ kind: 'answer', answer: { value: { n: 1 }, source: copySource() } });
    expect(w.serverCalls).toEqual([]);
    await load.finish();
  });

  it('before the first load answers not-ready, never a server path', async () => {
    const w = await bootWarehouse();
    expect(await route().readCopyOnly(async q => q.get('SELECT 1 AS n'))).toEqual({ kind: 'not-ready' });
    expect(w.serverCalls).toEqual([]);
  });
});

describe('F8: the copy cannot be read', () => {
  it('a read that fails answers failed, logs once, and the log holds no row data', async () => {
    const w = await ready();
    const copyDb = require('@/features/phone-copy/copyDb') as typeof import('@/features/phone-copy/copyDb');
    const real = copyDb.currentCopy();
    expect(real).not.toBeNull();
    // A database error that quotes a row, as SQLite's can.
    jest.spyOn(copyDb, 'currentCopy').mockReturnValue({
      ...(real as object),
      transaction: async () => { throw new Error('constraint failed near "Peas B-3 asha Traders"'); },
    } as never);
    const warn = jest.spyOn(console, 'warn');
    warn.mockClear();
    expect(await service().findGoods('peas', 0)).toEqual({ kind: 'failed' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Peas|B-3|asha/i);
    expect(w.serverCalls).toEqual([]);
  });
});

describe('F8: the copy is gone between the gate and the read (contract 14, T4)', () => {
  it('answers not-ready, and logs nothing', async () => {
    const w = await ready();
    expect(gate().findGoodsState()).toBe('ready');
    const copyDb = require('@/features/phone-copy/copyDb') as typeof import('@/features/phone-copy/copyDb');
    jest.spyOn(copyDb, 'currentCopy').mockReturnValue(null);
    const warn = jest.spyOn(console, 'warn');
    warn.mockClear();
    expect(await service().findGoods('peas', 0)).toEqual({ kind: 'not-ready' });
    expect(warn).not.toHaveBeenCalled();
    expect(w.serverCalls).toEqual([]);
  });
});

describe('F9 (service half): the answer carries the copy it came from', () => {
  it('every page of one copy has the same copy id', async () => {
    await ready();
    const first = (await service().findGoods('a', 0)) as Extract<Answer, { kind: 'page' }>;
    const second = (await service().findGoods('a', 3)) as Extract<Answer, { kind: 'page' }>;
    expect(second.copyId).toBe(first.copyId);
  });

  it('a copy loaded again gets another id', async () => {
    const w = await ready();
    const first = (await service().findGoods('a', 0)) as Extract<Answer, { kind: 'page' }>;
    await w.phone.engine.stopPhoneCopy();
    await (require('@/features/phone-copy/copyDb') as typeof import('@/features/phone-copy/copyDb')).eraseCopy();
    env.feed.copy = '1.6f1c0000-0000-4000-8000-000000000002.9e107d9d372bb6826bd81d3542a419d6';   // the server names a new copy on each start; the fake feed otherwise repeats one
    await loadCopy(w);
    const again = (await service().findGoods('a', 0)) as Extract<Answer, { kind: 'page' }>;
    expect(again.copyId).not.toBe(first.copyId);
  });
});

describe('role scoping (contract section 8)', () => {
  it.each(['admin', 'supervisor', 'staff'] as const)('%s: every lot their copy holds', async role => {
    await ready(role);
    expect(ids(await service().findGoods('a', 0)).sort()).toEqual(LOTS.map(l => l.id));
  });
});
