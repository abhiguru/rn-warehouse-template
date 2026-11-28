/**
 * WH-298, spec A steps 2 and 4 and the edge case "first load interrupted" (contract 6.1, 6.2, 6.6 "offline at open", 6.5;
 * T15 to T20, T37): the first load in two stages, the phone usable after stage one, search saying older records are still
 * loading until stage two ends, a kill resuming, and an offline open reading the file.
 *
 * Real: the engine, the store, the schema, the driver, the queries. Faked at the edge: the server's answers (fakeFeed.ts,
 * contract section 3 of product/tech/server-change-log-feed.md) and the phone's native modules (phoneEnv.ts).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - `@/features/phone-copy/syncEngine`: `startPhoneCopy()`, `syncNow(trigger)` answering 'done' | 'offline' | 'failed' |
 *    'busy-queued' | 'off' | 'stopped', `isCopyReadable()`.
 *  - `@/features/phone-copy/syncStore`: `getSyncSnapshot()` with `feature`, `phase`, `running`, `asOf`, `lastRunFailed`.
 *  - `@/features/phone-copy/copyQueries`: `searchLots(query)` answering `{ rows, next, olderLoading }`.
 *  - Tables are named as the server's entities (`goodsreceived`, `goodsreceived_trl`, ...), with columns `id`, `v`, `row`;
 *    `meta(k, v)` has `position`, `copy`, `format`, `phase`, `load_cursor`; `lot_search` and `lot_fts` as contract 5.3.
 *  - Staff and customers are not told apart here: the fake server lists the entities of contract 3.1 for any caller.
 * ===========================================================================================
 */
import { bootPhone, env, eraseEverything, idsOf, metaOf, resetEnv, rowsOf, setReachable, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { failStatement, holdStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { ENTITIES, defaultV, grnRow, hex, lotRow } from '@/tests/phoneCopy/fakeFeed';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);
const KEPT_ENTITIES = ENTITIES.filter(e => !DROPPED.has(e));

beforeEach(() => {
  resetEnv();
  const f = env.feed;
  for (let i = 1; i <= 3; i++) f.rows.customers.push({ id: `c${i}`, row: { id: `c${i}`, name: `Fictional Customer ${i}` } });
  f.rows.items.push({ id: 'it1', row: { id: 'it1', name: 'Fictional Peas' } });
  f.rows.goodsreceived.push(
    grnRow('g1', { gr_no: 'G-001', customer_id: 'c1', customer_name: 'Fictional Customer 1', date: '2026-11-20', registration: 'GJ01AB1234' }),
    grnRow('g2', { gr_no: 'G-002', customer_id: 'c2', customer_name: 'Fictional Customer 2', date: '2026-11-21' }),
  );
  f.rows.goodsreceived_trl.push(
    lotRow('l1', 'g1', { gr_id: 'g1', item_name: 'Fictional Peas', package_mark: 'PK-77', rack: 'A-1', stock: 10 }),
    lotRow('l2', 'g2', { gr_id: 'g2', item_name: 'Fictional Peas', package_mark: 'PK-88', rack: 'B-2', stock: 5 }),
  );
  f.rows.grn_lock.push({ id: 'g1', row: { grn_id: 'g1', invoice_state: 'not_invoiced' } });
  const rpc = f.rpc;
  f.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED.has(e)) } };
    }
    if (name === 'get_sync_checksums') {
      return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED.has(e.e)) } };
    }
    return answer;
  };
});
afterEach(async () => { await eraseEverything(); });

async function start(phone: Phone) {
  await phone.engine.startPhoneCopy();
  return phone.engine.syncNow('open');
}
const pagesAsked = () => env.feed.calls.filter(c => c.name === 'get_sync_page').map(c => String(c.args.p_entity));

describe('T15: the order of the first load', () => {
  it('get_sync_start first, then the pages in the order the server named, then the catch-up from the start position', async () => {
    const phone = bootPhone();
    expect(await start(phone)).toBe('done');
    const names = env.feed.calls.map(c => c.name);
    expect(names[0]).toBe('get_sync_start');
    expect([...new Set(pagesAsked())]).toEqual([...KEPT_ENTITIES]);
    expect(names.lastIndexOf('get_sync_page')).toBeLessThan(names.indexOf('get_sync_changes'));
    expect(env.feed.named('get_sync_changes')[0].args).toMatchObject({ p_position: env.feed.startPosition, p_copy: env.feed.copy });
  });

  it('asks for at most 2000 rows on every call (criterion 13)', async () => {
    const phone = bootPhone();
    await start(phone);
    // get_sync_checksums takes no p_limit (server contract 3.4); every page and changes call carries it
    for (const call of env.feed.calls.filter(c => c.name === 'get_sync_page' || c.name === 'get_sync_changes')) expect(call.args.p_limit).toBe(2000);
    expect(env.feed.calls.some(c => c.name === 'get_sync_page')).toBe(true);
  });

  it('reads an entity bigger than a page in several pages, each after the last id of the one before', async () => {
    for (let i = 0; i < 4500; i++) env.feed.rows.goodsreceived.push(grnRow(`big-${String(i).padStart(5, '0')}`));
    const phone = bootPhone();
    await start(phone);
    const pages = env.feed.pagesOf('goodsreceived');
    expect(pages).toHaveLength(3);
    expect(pages.map(p => p.args.p_after ?? null)).toEqual([null, expect.any(String), expect.any(String)]);
    expect((await idsOf(phone, 'goodsreceived')).length).toBe(4502);
  });

  it('stores what the server sent: the id, v and the row unchanged as JSON', async () => {
    const phone = bootPhone();
    await start(phone);
    const [g1] = (await rowsOf(phone, 'goodsreceived')).filter(r => r.id === 'g1');
    expect(g1.v).toBe(defaultV('g1'));
    expect(JSON.parse(g1.row)).toMatchObject({ gr_no: 'G-001', customer_id: 'c1' });
    expect(await metaOf(phone, 'copy')).toBe(env.feed.copy);
  });
});

describe('single-stage initial load (spec step 2, WH-381)', () => {
  it('is in stage one while the first entities load: not readable yet', async () => {
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'goodsreceived');
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await gate.opened;
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ phase: 'stage1', running: 'first-load' });
    expect(phone.engine.isCopyReadable()).toBe(false);
    gate.release();
    await run;
  });

  it('loads all kept entities in one pass straight to ready (never enters stage2) and search has no olderLoading', async () => {
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    const seenPhases: string[] = [];
    const unsubscribe = phone.syncStore.subscribeSync(() => { seenPhases.push(phone.syncStore.getSyncSnapshot().phase); });
    try {
      await phone.engine.startPhoneCopy();
      const run = phone.engine.syncNow('open');
      await gate.opened;
      expect(phone.syncStore.getSyncSnapshot().phase).toBe('stage1');
      expect(phone.engine.isCopyReadable()).toBe(false);
      gate.release();
      await run;
    } finally {
      unsubscribe();
    }
    expect(seenPhases).not.toContain('stage2');
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ phase: 'ready', running: null });
    expect(phone.engine.isCopyReadable()).toBe(true);
    const found = await phone.queries.searchLots('pk-77');
    expect(found.rows.map(r => r.lotId)).toEqual(['l1']);
    expect((found as { olderLoading?: boolean }).olderLoading).toBeFalsy();
    expect(await idsOf(phone, 'grn_lock')).toEqual(['g1']);
  });

  it('T17: when the single-stage load finishes, indexes, the search table and the FTS index are built, and phase moves to ready', async () => {
    const phone = bootPhone();
    expect(await start(phone)).toBe('done');
    const db = await phone.copyDb.openCopy((await phone.scope())!);
    expect((await db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'goodsreceived_trl'")).length).toBeGreaterThan(0);
    expect(await db.all('SELECT lot_id FROM lot_search ORDER BY lot_id')).toEqual([{ lot_id: 'l1' }, { lot_id: 'l2' }]);
    expect(await db.all("SELECT rowid FROM lot_fts WHERE lot_fts MATCH '\"fictional peas\"'")).toHaveLength(2);
    expect(await metaOf(phone, 'phase')).toBe('ready');
  });

  it('the position is stored only when the load has ended, from the start answer, then moved by the catch-up', async () => {
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await gate.opened;
    expect(await metaOf(phone, 'position')).toBeNull();
    gate.release();
    await run;
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
  });

  it('T19: a change that came while loading is applied by the catch-up, after the last entity', async () => {
    env.feed.changeAnswers.push({
      position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
      changes: [{ e: 'goodsreceived', id: 'g1', op: 'upsert', v: hex('v-new'), row: { id: 'g1', gr_no: 'G-001', rack: 'R-9' } }],
    });
    // The server's rows now hold that change too (it happened on the server during the load), so the later checksum agrees.
    env.feed.hold(c => {
      if (c.name === 'get_sync_changes' && !env.feed.rows.goodsreceived[0].row.rack) {
        env.feed.rows.goodsreceived[0] = { id: 'g1', row: { id: 'g1', gr_no: 'G-001', rack: 'R-9' }, v: hex('v-new') };
      }
      return false;
    });
    const phone = bootPhone();
    await start(phone);
    expect(JSON.parse((await rowsOf(phone, 'goodsreceived')).find(r => r.id === 'g1')!.row)).toMatchObject({ rack: 'R-9' });
    expect(await metaOf(phone, 'position')).toBe('1048600');
  });

  it('T20: the next page is requested while the current page is still being written', async () => {
    for (let i = 0; i < 2500; i++) env.feed.rows.goodsreceived.push(grnRow(`big-${String(i).padStart(5, '0')}`));
    const slowWrite = holdStatement(/INSERT[\s\S]*INTO\s+goodsreceived\s*\(/i);
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    const run = phone.engine.syncNow('open');
    await slowWrite.opened;                       // page 1 is being written, and not finished
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(env.feed.pagesOf('goodsreceived').length).toBeGreaterThanOrEqual(2);
    slowWrite.release();
    await run;
  });
});

describe('T16, T36: a load that does not finish', () => {
  it('a page is one transaction: a failure inside its rows leaves none of them, and not the cursor either', async () => {
    for (let i = 0; i < 250; i++) env.feed.rows.goodsreceived.push(grnRow(`big-${String(i).padStart(5, '0')}`));
    failStatement(/INSERT[\s\S]*INTO\s+goodsreceived\s*\(/i, new Error('disk I/O error'), 1);
    const phone = bootPhone();
    expect(await start(phone)).toBe('failed');
    expect(await idsOf(phone, 'goodsreceived')).toEqual([]);
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ lastRunFailed: true, running: null });
  });

  it('a kill between pages resumes at the next page: nothing already stored is asked for again, and the copy ends equal to the server', async () => {
    env.feed.failWhen = c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock';
    const first = bootPhone();
    expect(await start(first)).toBe('failed');
    const customerPages = env.feed.pagesOf('customers').length;
    env.feed.failWhen = null;

    const second = bootPhone();                   // the app is killed and opened again, the server answering
    expect(await start(second)).toBe('done');
    expect(env.feed.pagesOf('customers')).toHaveLength(customerPages);
    expect(env.feed.pagesOf('goodsreceived')).toHaveLength(1);
    for (const entity of KEPT_ENTITIES) expect(await idsOf(second, entity)).toEqual(env.feed.ids(entity));
    expect(await metaOf(second, 'load_cursor')).toBeNull();
  });

  it('a first load that fails with nothing stored leaves the phone "empty" and failed; Try again (retry) goes on to the end', async () => {
    env.feed.failWhen = c => c.name === 'get_sync_start';
    const phone = bootPhone();
    expect(await start(phone)).toBe('failed');
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ phase: 'empty', lastRunFailed: true });
    env.feed.failWhen = null;
    expect(await phone.engine.syncNow('retry')).toBe('done');
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ phase: 'ready', lastRunFailed: false });
  });

  it('T18: a page answering another copy key (access changed mid-load) restarts at get_sync_start and keeps no rows of the first try', async () => {
    env.feed.pageCopy = '1.other-log.access-changed';
    env.feed.hold(c => {
      if (c.name === 'get_sync_start' && env.feed.named('get_sync_start').length === 2) env.feed.pageCopy = null;
      return false;
    });
    const phone = bootPhone();
    expect(await start(phone)).toBe('done');
    expect(env.feed.named('get_sync_start')).toHaveLength(2);
    expect(await idsOf(phone, 'customers')).toEqual(['c1', 'c2', 'c3']);
  });

  it('a page that answers SYNC_UNKNOWN_ENTITY (the caller no longer loads it) restarts at get_sync_start', async () => {
    let refused = false;
    const original = env.feed.rpc;
    env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'get_sync_page' && args.p_entity === 'goodsreceived' && !refused) {
        refused = true;
        return { data: { success: false, error_code: 'WH409', reason: 'SYNC_UNKNOWN_ENTITY', entity: 'goodsreceived', error: 'x', message: 'x' }, error: null };
      }
      return original(name, args);
    };
    const phone = bootPhone();
    expect(await start(phone)).toBe('done');
    expect(env.feed.named('get_sync_start')).toHaveLength(2);
  });
});

describe('the feature is off when the server\'s format is not the app\'s (criterion 14)', () => {
  it('an unknown format: nothing is stored, the snapshot says off, and syncNow answers off', async () => {
    env.feed.format = 99;
    const phone = bootPhone();
    expect(await start(phone)).toBe('off');
    expect(phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(env.feed.named('get_sync_page')).toHaveLength(0);
    expect(phone.engine.isCopyReadable()).toBe(false);
  });

  it('an entity name the app does not know in get_sync_start: off, no table made from a server name', async () => {
    const original = env.feed.rpc;
    env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const answer = await original(name, args);
      if (name === 'get_sync_start') (answer.data as { entities: string[] }).entities.push('surprise_table');
      return answer;
    };
    const phone = bootPhone();
    expect(await start(phone)).toBe('off');
    const db = await phone.copyDb.openCopy((await phone.scope())!);
    expect(await db.all("SELECT name FROM sqlite_master WHERE name = 'surprise_table'")).toEqual([]);
  });
});

describe('T37: opening with no connection reads the file', () => {
  it('makes no request, and the phase and the time come from what is on the phone', async () => {
    const first = bootPhone();
    await start(first);
    const asOf = first.syncStore.getSyncSnapshot().asOf;
    expect(asOf).toBeTruthy();

    await setReachable(false);
    env.feed.calls.length = 0;
    const second = bootPhone();
    await second.engine.startPhoneCopy();
    expect(await second.engine.syncNow('open')).toBe('offline');
    expect(env.feed.calls).toHaveLength(0);
    expect(second.syncStore.getSyncSnapshot()).toMatchObject({ phase: 'ready', asOf, current: false });
    expect(second.engine.isCopyReadable()).toBe(true);
    expect((await second.queries.searchLots('g-002')).rows.map(r => r.lotId)).toEqual(['l2']);
  });

  it('with nothing loaded yet, an offline open says so: phase empty, no request, not readable', async () => {
    await setReachable(false);
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    expect(await phone.engine.syncNow('open')).toBe('offline');
    expect(env.feed.calls).toHaveLength(0);
    expect(phone.syncStore.getSyncSnapshot().phase).toBe('empty');
    expect(phone.engine.isCopyReadable()).toBe(false);
  });
});
