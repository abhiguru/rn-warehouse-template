/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md sections 5 and 6: schema version 2 of the phone copy: the
 * columns copied out of the server's rows, the new tables and indexes, feed format 2, and the one reload at the update.
 *
 * Real: the engine, the schema, the driver, over SQLite with FTS5. Faked at the edge: the server and the phone's native
 * modules.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - `SCHEMA_VERSION` and `SYNC_FORMATS` are read from `copySchema` (where they are today; the contract's file list also
 *    names syncApi.ts for SYNC_FORMATS).
 *  - `mobile_digits` is the mobile with everything but digits removed; `mobile_key` follows `utils.mobile_key`.
 *  - "Lower-cased" columns hold the server text lower-cased, as the WH-298 ones do.
 * ==================================
 */
import { bootPhone, env, eraseEverything, idsOf, metaOf, resetEnv, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { grnNamed, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { documentNumberSortKey } from '@/utils/documentNumber';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  const rpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
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

async function loaded(): Promise<Phone> {
  const phone = bootPhone();
  await phone.engine.startPhoneCopy();
  expect(await phone.engine.syncNow('open')).toBe('done');
  return phone;
}
async function query<T>(phone: Phone, sql: string, params: (string | number)[] = []): Promise<T[]> {
  const db = await phone.copyDb.openCopy((await phone.scope())!);
  return db.all<T>(sql, params);
}
const one = async (phone: Phone, table: string, columns: string, id: string) =>
  (await query<Record<string, unknown>>(phone, `SELECT ${columns} FROM ${table} WHERE id = ?`, [id]))[0];
async function syncChanges(phone: Phone, changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  expect(await phone.engine.syncNow('pull-to-refresh')).toBe('done');
}
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });

describe('the version and the feed format', () => {
  // Later cards raise the version (WH-303: 4); this card needs at least 3, and the stored version follows the build's.
  it('the schema is version 3 or later, and a copy of version 1 is erased and loaded again', async () => {
    const schema = require('@/features/phone-copy/copySchema') as typeof import('@/features/phone-copy/copySchema');
    expect(schema.SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
    const phone = await loaded();
    const db = await phone.copyDb.openCopy((await phone.scope())!);
    await db.run("UPDATE meta SET v = '1' WHERE k = 'schema_version'");
    await phone.engine.stopPhoneCopy();
    const updated = bootPhone();
    await updated.engine.startPhoneCopy();
    expect(updated.syncStore.getSyncSnapshot().phase).toBe('empty');
    expect(await idsOf(updated, 'goodsreceived')).toEqual([]);
    expect(await metaOf(updated, 'schema_version')).toBe(String(schema.SCHEMA_VERSION));
    expect(await updated.engine.syncNow('open')).toBe('done');
    expect((await idsOf(updated, 'goodsreceived')).length).toBe(7);
  });

  it.each([1, 2, 3])('a format-%i feed is loaded', async format => {
    env.feed.format = format;
    const phone = await loaded();
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready' });
    expect(await metaOf(phone, 'format')).toBe(String(format));
  });

  it('a format this build does not know (one above its newest) turns the feature off', async () => {
    const schema = require('@/features/phone-copy/copySchema') as typeof import('@/features/phone-copy/copySchema');
    env.feed.format = Math.max(...schema.SYNC_FORMATS) + 1;
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    expect(await phone.engine.syncNow('open')).toBe('off');
  });
});

describe('columns copied out of the rows', () => {
  it('goodsreceived: the date in microseconds, the number\'s sort key, imported, invoiced, out of stock', async () => {
    const phone = await loaded();
    const columns = 'date_us, gr_no_sk, imported, invoiced, out_of_stock';
    expect(await one(phone, 'goodsreceived', columns, 'g-X1')).toEqual({
      date_us: Date.parse('2026-11-18T05:00:00Z') * 1000, gr_no_sk: documentNumberSortKey('X1'), imported: 1, invoiced: 1, out_of_stock: 0,
    });
    expect(await one(phone, 'goodsreceived', 'date_us, imported', 'g-GR-1'))
      .toEqual({ date_us: Date.parse('2026-11-22T05:00:00Z') * 1000 + 2, imported: 0 });
  });

  it('goodsreceived_trl: weight, packaging and the time the lot was emptied (none: NULL)', async () => {
    const phone = await loaded();
    expect(await one(phone, 'goodsreceived_trl', 'weight, packaging, emptied_us', 'l02'))
      .toEqual({ weight: 25, packaging: 'Bag', emptied_us: Date.parse('2026-11-23T05:00:00Z') * 1000 });
    expect(await one(phone, 'goodsreceived_trl', 'weight, emptied_us', 'l05')).toEqual({ weight: null, emptied_us: null });
  });

  it('goodsreceived_trl: a lot row with no emptied_at at all (an older feed) holds NULL', async () => {
    const { emptied_at: _absent, ...row } = lotNamed('l02');
    env.feed.rows.goodsreceived_trl = env.feed.rows.goodsreceived_trl.map(r => (r.id === 'l02' ? { id: 'l02', row } : r));
    const phone = await loaded();
    expect(await one(phone, 'goodsreceived_trl', 'emptied_us', 'l02')).toEqual({ emptied_us: null });
  });

  it('grn_lock: the invoice state the server sent', async () => {
    const phone = await loaded();
    expect(await query(phone, 'SELECT id, invoice_state FROM grn_lock WHERE id IN (?, ?, ?) ORDER BY id', ['g-A2', 'g-B1', 'g-X1'])).toEqual([
      { id: 'g-A2', invoice_state: 'partly_invoiced' }, { id: 'g-B1', invoice_state: 'not_invoiced' }, { id: 'g-X1', invoice_state: 'invoiced' },
    ]);
  });

  it('customers: the name, the mobile\'s digits and its key (91 and a leading 0 dropped); items: the lower-cased texts', async () => {
    const phone = await loaded();
    const columns = 'name_lc, mobile_digits, mobile_key';
    expect(await one(phone, 'customers', columns, 'c1')).toEqual({ name_lc: 'asha traders', mobile_digits: '919000000001', mobile_key: '9000000001' });
    expect(await one(phone, 'customers', columns, 'c2')).toEqual({ name_lc: 'bhavin foods', mobile_digits: '09000000002', mobile_key: '9000000002' });
    expect((await one(phone, 'customers', 'mobile_digits', 'c3')).mobile_digits || '').toBe('');
    expect(await one(phone, 'items', 'name_lc, packaging_lc, description_lc', 'i1'))
      .toEqual({ name_lc: 'peas', packaging_lc: 'bag', description_lc: 'fictional produce' });
  });

  it('a change after the first load rewrites the copied columns', async () => {
    const phone = await loaded();
    await syncChanges(phone, [
      upsert('goodsreceived', 'g-B1', { ...grnNamed('B1'), gr_no: 'C9', date: '2026-11-24T05:00:00+00:00' }),
      upsert('goodsreceived_trl', 'l02', { ...lotNamed('l02'), weight: 33, emptied_at: null }),
      upsert('grn_lock', 'g-B1', { grn_id: 'g-B1', invoice_state: 'invoiced' }),
    ]);
    expect(await one(phone, 'goodsreceived', 'date_us, gr_no_sk', 'g-B1'))
      .toEqual({ date_us: Date.parse('2026-11-24T05:00:00Z') * 1000, gr_no_sk: documentNumberSortKey('C9') });
    expect(await one(phone, 'goodsreceived_trl', 'weight, emptied_us', 'l02')).toEqual({ weight: 33, emptied_us: null });
    expect(await one(phone, 'grn_lock', 'invoice_state', 'g-B1')).toEqual({ invoice_state: 'invoiced' });
  });
});

describe('new tables and indexes', () => {
  it.each([
    ['text_rank', ['kind', 'value', 'rank']],
    ['photo_files', ['storage_path', 'file', 'bytes', 'kept_at']],
  ])('%s exists with its columns', async (table, columns) => {
    const phone = await loaded();
    expect((await query<{ name: string }>(phone, `PRAGMA table_info(${table})`)).map(c => c.name)).toEqual(columns);
  });

  it.each([
    ['goodsreceived', 'date_us'], ['goodsreceived', 'gr_no_sk'], ['goodsreceived_trl', 'stock'],
    ['customers', 'name_lc'], ['items', 'name_lc'],
  ])('%s is indexed on %s', async (table, column) => {
    const phone = await loaded();
    const indexes = await query<{ name: string }>(phone, `PRAGMA index_list(${table})`);
    const leading: string[] = [];
    for (const index of indexes) leading.push((await query<{ name: string }>(phone, `PRAGMA index_info(${index.name})`))[0]?.name);
    expect(leading).toContain(column);
  });

  it('WH-381: dispatch, dispatch_search and dispatch_fts tables are absent in schema 5', async () => {
    const phone = await loaded();
    const tables = (await query<{ name: string }>(phone, "SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
    for (const dropped of ['dispatch', 'dispatch_trl', 'dispatch_images', 'dispatch_search', 'dispatch_fts']) {
      expect(tables).not.toContain(dropped);
    }
  });
});
