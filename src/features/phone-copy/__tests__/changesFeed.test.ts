/**
 * WH-298, spec A step 3 and its edge cases (contract 6.3, 6.4, 6.5; T21 to T33): the feed is fetched by position, a page
 * of changes is applied whole in one local transaction, the position is stored with it, and the server's reload signals,
 * refusals and bad answers are handled. Product's answer to P1 is in: BULK_IMPORT and LOG_PURGED keep the old copy
 * readable until the new one is complete; every other reason erases first; and whenever space is short, erase first.
 *
 * Real: the engine, the apply code, the schema, the store. Faked at the edge: the server's answers (fakeFeed.ts, the
 * answers to get_sync_changes scripted by the test) and the phone's native modules (phoneEnv.ts).
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives; the open points are marked) =====
 *  - as in firstLoad.test.ts, plus tables `money_stale(customer_id)` and `stage_rows`, and `meta` keys `position`, `as_of`,
 *    `pending_reload`.
 *  - Extracted columns as contract 5.2: `goodsreceived.gr_no_lc`, `customer_name_lc`, `goodsreceived_trl.gr_id`, `grn_images.grn_id`,
 *    `dispatch_trl.disp_id`, `dispatch_images.dispatch_id`; `invoice_trl` has a parent column that the build reads from the
 *    payload: the fixture below gives its rows `invoice_id` (change here if the WH-297 payload names it differently).
 *  - A server answer with an error object `{ code: 'PGRST202' }` is "the function does not exist" (contract 6.5).
 *  - "Space is short" is `Paths.availableDiskSpace` below 500 000 000 bytes (P2).
 *  - SQLITE_FULL is an error whose message contains "disk is full".
 * ===========================================================================================
 */
import { bootPhone, env, eraseEverything, idsOf, metaOf, resetEnv, rowsOf, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { SYNC_FORMATS } from '@/features/phone-copy/copySchema';
import { failStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { ENTITIES, grnRow, hex, lotRow, type Change } from '@/tests/phoneCopy/fakeFeed';

const upsert = (e: string, id: string, row: Record<string, unknown>, v = `v-${id}-new`): Change => ({ e, id, op: 'upsert', v: v === 'not-hex' ? v : hex(v), row: { id, ...row } });
const page = (position: string, changes: Change[], more = false, extra: Record<string, unknown> = {}) => ({
  position, as_of: '2026-11-25T05:30:00.000+00:00', more, reload_all: null, reload: [] as string[], changes, ...extra,
}) as never;

beforeEach(() => {
  resetEnv();
  const f = env.feed;
  f.rows.customers.push({ id: 'c1', row: { id: 'c1', name: 'Fictional Customer 1' } }, { id: 'c2', row: { id: 'c2', name: 'Fictional Customer 2' } });
  f.rows.goodsreceived.push(
    grnRow('g1', { gr_no: 'G-001', customer_id: 'c1', customer_name: 'Fictional Customer 1', date: '2026-11-20' }),
    grnRow('g2', { gr_no: 'G-002', customer_id: 'c2', customer_name: 'Fictional Customer 2', date: '2026-11-21' }),
  );
  f.rows.goodsreceived_trl.push(
    lotRow('l1', 'g1', { gr_id: 'g1', item_name: 'Fictional Peas', package_mark: 'PK-77', rack: 'A-1' }),
    lotRow('l2', 'g1', { gr_id: 'g1', item_name: 'Fictional Beans', package_mark: 'PK-78', rack: 'A-2' }),
    lotRow('l3', 'g2', { gr_id: 'g2', item_name: 'Fictional Peas', package_mark: 'PK-88', rack: 'B-2' }),
  );
  f.rows.grn_images.push({ id: 'im1', row: { id: 'im1', grn_id: 'g1' } });
  f.rows.grn_lock.push({ id: 'g1', row: { grn_id: 'g1' } });
  f.rows.dispatch.push({ id: 'd1', row: { id: 'd1', disp_no: 'D-1', customer_id: 'c1' } });
  f.rows.dispatch_trl.push({ id: 'dl1', row: { id: 'dl1', disp_id: 'd1', gr_id: 'g1', gr_trl_id: 'l1', disp_qty: 2 } });
  f.rows.dispatch_images.push({ id: 'dim1', row: { id: 'dim1', dispatch_id: 'd1' } });
  f.rows.invoice.push({ id: 'i1', row: { id: 'i1', customer_id: 'c1' } });
  f.rows.invoice_trl.push({ id: 'il1', row: { id: 'il1', invoice_id: 'i1' } });
});
afterEach(async () => { await eraseEverything(); });

async function loaded() {
  const phone = bootPhone();
  await phone.engine.startPhoneCopy();
  expect(await phone.engine.syncNow('open')).toBe('done');
  env.feed.calls.length = 0;
  return phone;
}
const rowOf = async (phone: Phone, entity: string, id: string) => (await rowsOf(phone, entity)).find(r => r.id === id);
const parsed = async (phone: Phone, entity: string, id: string) => JSON.parse((await rowOf(phone, entity, id))!.row) as Record<string, unknown>;
const sql = async <T>(phone: Phone, text: string, params: Array<string | number | null> = []) =>
  (await phone.copyDb.openCopy((await phone.scope())!)).all<T>(text, params);

describe('T21 to T27: applying a page of changes', () => {
  it('T21: upsert inserts and replaces; the same id twice ends with the last row; extracted columns follow the row', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [
      upsert('goodsreceived', 'g1', { gr_no: 'G-001', customer_name: 'Zed Traders', registration: 'GJ05XY9999' }, 'v-a'),
      upsert('goodsreceived', 'g1', { gr_no: 'G-001', customer_name: 'Zed Traders', registration: 'GJ05XY9999', rack: 'Z' }, 'v-b'),
      upsert('goodsreceived', 'g3', { gr_no: 'G-003' }, 'v-g3'),
    ]));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(await rowOf(phone, 'goodsreceived', 'g1')).toMatchObject({ v: hex('v-b') });
    expect(await parsed(phone, 'goodsreceived', 'g1')).toMatchObject({ rack: 'Z' });
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2', 'g3']);
    expect(await sql(phone, "SELECT gr_no_lc, customer_name_lc, registration_lc FROM goodsreceived WHERE id = 'g1'"))
      .toEqual([{ gr_no_lc: 'g-001', customer_name_lc: 'zed traders', registration_lc: 'gj05xy9999' }]);
  });

  it('T22: deleting a GRN removes its lots, photos, lock and search rows, and no other GRN\'s', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [{ e: 'goodsreceived', id: 'g1', op: 'delete' }]));
    await phone.engine.syncNow('pull-to-refresh');
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g2']);
    expect(await idsOf(phone, 'goodsreceived_trl')).toEqual(['l3']);
    expect(await idsOf(phone, 'grn_images')).toEqual([]);
    expect(await idsOf(phone, 'grn_lock')).toEqual([]);
    expect((await sql<{ lot_id: string }>(phone, 'SELECT lot_id FROM lot_search')).map(r => r.lot_id)).toEqual(['l3']);
  });

  it('T22: deleting a dispatch removes its lines and photos; deleting an invoice its lines', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [{ e: 'dispatch', id: 'd1', op: 'delete' }, { e: 'invoice', id: 'i1', op: 'delete' }]));
    await phone.engine.syncNow('pull-to-refresh');
    for (const entity of ['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl']) expect(await idsOf(phone, entity)).toEqual([]);
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2']);
  });

  it('T22: a delete for a row the phone does not hold is ignored, and the rest of the page still applies', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [{ e: 'goodsreceived', id: 'nowhere', op: 'delete' }, upsert('goodsreceived', 'g2', { gr_no: 'G-002', rack: 'Q' })]));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(await parsed(phone, 'goodsreceived', 'g2')).toMatchObject({ rack: 'Q' });
  });

  it('T23: a GRN upsert rebuilds the search rows of all its lots (a changed customer name is found)', async () => {
    const phone = await loaded();
    expect((await phone.queries.searchLots('zed')).rows).toEqual([]);
    env.feed.changeAnswers.push(page('1048600', [upsert('goodsreceived', 'g1', { gr_no: 'G-001', customer_id: 'c1', customer_name: 'Zed Traders', date: '2026-11-20' })]));
    await phone.engine.syncNow('pull-to-refresh');
    expect((await phone.queries.searchLots('zed')).rows.map(r => r.lotId).sort()).toEqual(['l1', 'l2']);
    expect((await phone.queries.searchLots('Fictional Customer 1')).rows).toEqual([]);
  });

  it('T24: a "stale" mark for a customer is stored in money_stale, with no figure', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [{ e: 'money', id: 'c1', op: 'stale' }]));
    await phone.engine.syncNow('pull-to-refresh');
    expect(await sql(phone, 'SELECT customer_id FROM money_stale')).toEqual([{ customer_id: 'c1' }]);
  });

  it('T25: more:true is asked again at once, each time from the position of the page before; the last page\'s position and time are stored', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(
      page('1048600', [upsert('goodsreceived', 'g1', { gr_no: 'G-001', rack: 'A' })], true),
      page('1048650', [upsert('goodsreceived', 'g2', { gr_no: 'G-002', rack: 'B' })], true),
      page('1048700', []),
    );
    await phone.engine.syncNow('pull-to-refresh');
    expect(env.feed.named('get_sync_changes').map(c => c.args.p_position)).toEqual([env.feed.startPosition, '1048600', '1048650']);
    expect(await metaOf(phone, 'position')).toBe('1048700');
    expect(phone.syncStore.getSyncSnapshot().asOf).toBe('2026-11-25T05:30:00.000+00:00');
  });

  it('T25: a page whose rows cannot all be stored leaves the rows AND the position as they were (never half a transaction)', async () => {
    const phone = await loaded();
    failStatement(/INSERT[\s\S]*INTO\s+goodsreceived\s*\(/i, new Error('disk I/O error'));
    env.feed.changeAnswers.push(page('1048700', [upsert('goodsreceived', 'g1', { gr_no: 'G-001', rack: 'HALF' }), upsert('goodsreceived', 'g9', { gr_no: 'G-009' })]));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2']);
    expect(await parsed(phone, 'goodsreceived', 'g1')).not.toHaveProperty('rack');
    expect(phone.syncStore.getSyncSnapshot().lastRunFailed).toBe(true);
  });

  it('T25: a first page that was stored stays stored when the second cannot be fetched; the next run goes on after it', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(page('1048600', [upsert('goodsreceived', 'g1', { gr_no: 'G-001', rack: 'A' })], true), { error: { message: 'Network request failed' } });
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(await metaOf(phone, 'position')).toBe('1048600');
    env.feed.calls.length = 0;
    expect(await phone.engine.syncNow('retry')).toBe('done');
    expect(env.feed.named('get_sync_changes')[0].args.p_position).toBe('1048600');
  });

  it('T26: applying the same changes page twice leaves the same copy', async () => {
    const phone = await loaded();
    const change = upsert('goodsreceived', 'g1', { gr_no: 'G-001', rack: 'A' }, 'v-same');
    env.feed.changeAnswers.push(page('1048600', [change]), page('1048700', [change]));
    await phone.engine.syncNow('pull-to-refresh');
    const once = await rowsOf(phone, 'goodsreceived');
    await phone.engine.syncNow('pull-to-refresh');
    expect(await rowsOf(phone, 'goodsreceived')).toEqual(once);
  });

  it('T27: after a history of inserts, edits, moves between customers and deletes the copy equals a fresh first load', async () => {
    const phone = await loaded();
    const f = env.feed;
    // The server\'s history: g1 edited and moved to c2, a lot added to g1, g2 deleted with its lot, a new GRN g3.
    f.rows.goodsreceived = [grnRow('g1', { gr_no: 'G-001', customer_id: 'c2', customer_name: 'Fictional Customer 2', date: '2026-11-20' }),
      grnRow('g3', { gr_no: 'G-003', customer_id: 'c1', customer_name: 'Fictional Customer 1', date: '2026-11-24' })];
    f.rows.goodsreceived_trl = [f.rows.goodsreceived_trl[0], f.rows.goodsreceived_trl[1], lotRow('l4', 'g1', { gr_id: 'g1', item_name: 'Fictional Rice', package_mark: 'PK-99', rack: 'C-1' }),
      lotRow('l5', 'g3', { gr_id: 'g3', item_name: 'Fictional Peas', package_mark: 'PK-55', rack: 'D-1' })];
    f.changeAnswers.push(page('1048900', [
      upsert('goodsreceived', 'g1', f.rows.goodsreceived[0].row, 'v-g1-moved'),
      upsert('goodsreceived_trl', 'l4', f.rows.goodsreceived_trl[2].row, 'v-l4'),
      { e: 'goodsreceived', id: 'g2', op: 'delete' },
      upsert('goodsreceived', 'g3', f.rows.goodsreceived[1].row, 'v-g3'),
      upsert('goodsreceived_trl', 'l5', f.rows.goodsreceived_trl[3].row, 'v-l5'),
    ]));
    f.rows.goodsreceived[0].v = hex('v-g1-moved'); f.rows.goodsreceived[1].v = hex('v-g3');
    f.rows.goodsreceived_trl[2].v = hex('v-l4'); f.rows.goodsreceived_trl[3].v = hex('v-l5');
    await phone.engine.syncNow('pull-to-refresh');
    const afterChanges: Record<string, Array<{ id: string; v: string }>> = {};
    for (const entity of ENTITIES) afterChanges[entity] = (await rowsOf(phone, entity)).map(r => ({ id: r.id, v: r.v }));

    env.subject = 'user-2';                      // another person's phone: a fresh first load of the same server
    const fresh = bootPhone();
    await fresh.engine.startPhoneCopy();
    expect(await fresh.engine.syncNow('open')).toBe('done');
    for (const entity of ENTITIES) expect((await rowsOf(fresh, entity)).map(r => ({ id: r.id, v: r.v }))).toEqual(afterChanges[entity]);
  });
});

describe('T28: "reload" of named entities', () => {
  it('keeps the old rows readable until the new set is complete, then replaces them, moves the position, and marks money stale', async () => {
    const phone = await loaded();
    env.feed.rows.invoice = [{ id: 'i2', row: { id: 'i2', customer_id: 'c2' } }];
    env.feed.rows.invoice_trl = [];
    env.feed.changeAnswers.push(page('1048800', [], false, { reload: ['invoice', 'invoice_trl'] }));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'invoice');
    const run = phone.engine.syncNow('pull-to-refresh');
    await gate.opened;
    expect(await idsOf(phone, 'invoice')).toEqual(['i1']);                 // the old set is still shown
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);  // and the position has not moved
    expect(await metaOf(phone, 'pending_reload')).not.toBeNull();
    gate.release();
    await run;
    expect(await idsOf(phone, 'invoice')).toEqual(['i2']);
    expect(await idsOf(phone, 'invoice_trl')).toEqual([]);
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2']);     // other tables untouched
    expect(await metaOf(phone, 'position')).toBe('1048800');
    expect(await metaOf(phone, 'pending_reload')).toBeNull();
    expect((await sql<{ customer_id: string }>(phone, 'SELECT customer_id FROM money_stale ORDER BY customer_id')).map(r => r.customer_id)).toEqual(['c1', 'c2']);
    expect(env.feed.named('get_sync_start')).toHaveLength(0);
  });

  it('a kill in the middle of a reload resumes it; the old rows stay until it ends', async () => {
    const first = await loaded();
    env.feed.rows.invoice = [{ id: 'i2', row: { id: 'i2', customer_id: 'c2' } }];
    env.feed.changeAnswers.push(page('1048800', [], false, { reload: ['invoice'] }));
    env.feed.failWhen = c => c.name === 'get_sync_page' && c.args.p_entity === 'invoice';
    expect(await first.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(await idsOf(first, 'invoice')).toEqual(['i1']);
    env.feed.failWhen = null;
    const second = bootPhone();
    await second.engine.startPhoneCopy();
    expect(await second.engine.syncNow('open')).toBe('done');
    expect(await idsOf(second, 'invoice')).toEqual(['i2']);
    expect(await metaOf(second, 'position')).toBe('1048800');
  });

  it('rows that are no longer on the server are removed with their cascade when the reload completes', async () => {
    const phone = await loaded();
    env.feed.rows.goodsreceived_trl = env.feed.rows.goodsreceived_trl.filter(r => r.id !== 'l2');
    env.feed.changeAnswers.push(page('1048800', [], false, { reload: ['goodsreceived_trl'] }));
    await phone.engine.syncNow('pull-to-refresh');
    expect(await idsOf(phone, 'goodsreceived_trl')).toEqual(['l1', 'l3']);
    expect((await sql<{ lot_id: string }>(phone, 'SELECT lot_id FROM lot_search ORDER BY lot_id')).map(r => r.lot_id)).toEqual(['l1', 'l3']);
  });
});

describe('T29: "reload_all" (Product\'s answer to P1)', () => {
  const reloadAll = (reason: string) => page('9999999', [], false, { reload_all: { reason } });

  it.each(['ACCESS_CHANGED', 'POSITION_AHEAD', 'RESTORED', 'RESET', 'TRUNCATED'])('%s: the copy is erased first (nothing readable meanwhile), then loaded again, and the answer\'s position is not stored', async reason => {
    const phone = await loaded();
    env.feed.changeAnswers.push(reloadAll(reason));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'goodsreceived');
    const run = phone.engine.syncNow('pull-to-refresh');
    await gate.opened;
    expect(phone.engine.isCopyReadable()).toBe(false);
    expect(phone.syncStore.getSyncSnapshot().phase).toBe('stage1');
    gate.release();
    await run;
    expect(env.feed.named('get_sync_start')).toHaveLength(1);
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
    expect(await metaOf(phone, 'position')).not.toBe('9999999');
  });

  it.each(['BULK_IMPORT', 'LOG_PURGED'])('%s: the old copy stays readable, with its old time, until the new one is complete; then it is replaced', async reason => {
    const phone = await loaded();
    const oldAsOf = phone.syncStore.getSyncSnapshot().asOf;
    env.feed.rows.goodsreceived = [grnRow('g9', { gr_no: 'G-009', customer_id: 'c1', customer_name: 'Fictional Customer 1', date: '2026-11-25' })];
    env.feed.rows.goodsreceived_trl = []; env.feed.rows.grn_images = []; env.feed.rows.grn_lock = [];
    env.feed.changeAnswers.push(reloadAll(reason));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'dispatch');
    const run = phone.engine.syncNow('pull-to-refresh');
    await gate.opened;
    expect(phone.engine.isCopyReadable()).toBe(true);
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2']);
    expect(phone.syncStore.getSyncSnapshot().asOf).toBe(oldAsOf);
    gate.release();
    await run;
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g9']);
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
  });

  it.each(['BULK_IMPORT', 'LOG_PURGED'])('%s with little free space (under 500 MB) erases first, as for the other reasons', async reason => {
    const phone = await loaded();
    env.freeBytes = 400_000_000;
    env.feed.changeAnswers.push(reloadAll(reason));
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'goodsreceived');
    const run = phone.engine.syncNow('pull-to-refresh');
    await gate.opened;
    expect(phone.engine.isCopyReadable()).toBe(false);
    gate.release();
    await run;
  });

  it('a kept old copy that cannot be replaced (the load fails) stays readable with its old time', async () => {
    const phone = await loaded();
    const oldAsOf = phone.syncStore.getSyncSnapshot().asOf;
    env.feed.changeAnswers.push(reloadAll('BULK_IMPORT'));
    env.feed.failWhen = c => c.name === 'get_sync_page' && c.args.p_entity === 'dispatch';
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(phone.engine.isCopyReadable()).toBe(true);
    expect(await idsOf(phone, 'goodsreceived')).toEqual(['g1', 'g2']);
    expect(phone.syncStore.getSyncSnapshot().asOf).toBe(oldAsOf);
  });

  it('erasing for a reload makes a new key (the old key never opens the new file)', async () => {
    const phone = await loaded();
    const oldKey = (await phone.copyKey.loadCopyKey())!.keyHex;
    env.feed.changeAnswers.push(reloadAll('ACCESS_CHANGED'));
    await phone.engine.syncNow('pull-to-refresh');
    expect((await phone.copyKey.loadCopyKey())!.keyHex).not.toBe(oldKey);
  });

  it('FORMAT_CHANGED to a format the app knows: erase and reload', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push(reloadAll('FORMAT_CHANGED'));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(env.feed.named('get_sync_start')).toHaveLength(1);
  });

  it('FORMAT_CHANGED to a format the app does not know: the feature is off and the copy is erased', async () => {
    const phone = await loaded();
    env.feed.format = Math.max(...SYNC_FORMATS) + 1; // one above the newest format the app knows, read at run time
    env.feed.changeAnswers.push(reloadAll('FORMAT_CHANGED'));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('off');
    expect(phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(phone.engine.isCopyReadable()).toBe(false);
  });
});

describe('T30, T31, T32: refusals and bad answers', () => {
  it.each(['SYNC_BAD_POSITION', 'SYNC_BAD_COPY'])('%s is a reload of everything, not an error shown to the person', async reason => {
    const phone = await loaded();
    env.feed.changeAnswers.push({ refusal: reason });
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
    expect(env.feed.named('get_sync_start')).toHaveLength(1);
    expect(phone.syncStore.getSyncSnapshot().lastRunFailed).toBe(false);
  });

  it('T31: PGRST202 on a sync RPC (an older server) turns the feature off and erases the copy', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push({ error: { message: 'Could not find the function', code: 'PGRST202' } });
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('off');
    expect(phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(phone.engine.isCopyReadable()).toBe(false);
    const db = await phone.copyDb.openCopy((await phone.scope())!);
    expect(await db.all('SELECT id FROM goodsreceived')).toEqual([]);
  });

  it.each([
    ['a v that is not 16 hex digits', page('1048700', [upsert('goodsreceived', 'g1', { gr_no: 'G-001' }, 'not-hex')])],
    ['an op the app does not know', page('1048700', [{ e: 'goodsreceived', id: 'g1', op: 'rename' } as never])],
    ['an entity the app does not know', page('1048700', [upsert('surprise_table', 'x1', {})])],
    ['a position that is not digits', page('abc', [])],
    ['a row that is not an object', page('1048700', [{ e: 'goodsreceived', id: 'g1', op: 'upsert', v: 'a3f09c2b11d4e5f6', row: 'text' } as never])],
  ])('T32: %s fails the run without writing anything', async (_name, answer) => {
    const phone = await loaded();
    const before = await rowsOf(phone, 'goodsreceived');
    env.feed.changeAnswers.push(answer);
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(await rowsOf(phone, 'goodsreceived')).toEqual(before);
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
  });

  it('a lost connection leaves the copy, its time and what is readable as they were; the failure is shown, and the next success clears it', async () => {
    const phone = await loaded();
    const asOf = phone.syncStore.getSyncSnapshot().asOf;
    env.feed.failWhen = c => c.name === 'get_sync_changes';
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ lastRunFailed: true, asOf, phase: 'ready' });
    expect(phone.engine.isCopyReadable()).toBe(true);
    env.feed.failWhen = null;
    expect(await phone.engine.syncNow('retry')).toBe('done');
    expect(phone.syncStore.getSyncSnapshot().lastRunFailed).toBe(false);
  });

  it('a "Session expired or revoked" answer stops the engine (today\'s forced sign-out then erases the copy)', async () => {
    const phone = await loaded();
    env.feed.changeAnswers.push({ error: { message: 'Session expired or revoked', code: '42501' } });
    await phone.engine.syncNow('pull-to-refresh');
    env.feed.calls.length = 0;
    expect(await phone.engine.syncNow('interval')).not.toBe('done');
    expect(env.feed.calls).toHaveLength(0);
  });
});

describe('T33: no room on the phone', () => {
  it('a write that fails for lack of space rolls back, sets storageLow and fails the run; nothing half-written', async () => {
    const phone = await loaded();
    failStatement(/INSERT[\s\S]*INTO\s+goodsreceived\s*\(/i, new Error('database or disk is full'));
    env.feed.changeAnswers.push(page('1048700', [upsert('goodsreceived', 'g1', { gr_no: 'G-001', rack: 'FULL' })]));
    expect(await phone.engine.syncNow('pull-to-refresh')).toBe('failed');
    expect(phone.syncStore.getSyncSnapshot().storageLow).toBe(true);
    expect(await parsed(phone, 'goodsreceived', 'g1')).not.toHaveProperty('rack');
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
  });

  it('free space under 500 MB sets storageLow; above it, once a write has worked, clears it', async () => {
    env.freeBytes = 400_000_000;
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    await phone.engine.syncNow('open');
    expect(phone.syncStore.getSyncSnapshot().storageLow).toBe(true);
    env.freeBytes = 600_000_000;
    await phone.engine.syncNow('interval');
    expect(phone.syncStore.getSyncSnapshot().storageLow).toBe(false);
  });

  it('reports the size of the file the copy occupies', async () => {
    const phone = await loaded();
    expect(phone.syncStore.getSyncSnapshot().copyBytes).toBeGreaterThan(0);
  });
});
