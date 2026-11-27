/**
 * WH-381 (contract-first): offline scope cut — GRNs, stock, dues, statement, customer accounts only.
 * Spec: product/specs/offline-capture.md (steps 2, 4, 10; criteria 14, 14a).
 * Tech contract: product/tech/app-offline-scope-cut.md (Section 2 & Q2 settlement).
 *
 * Real: copySchema, copyDb, syncEngine, applyBatch, statusBarState, kept SQLite readers, and real services.
 * Faked at the edge: server RPC answers and native modules (phoneEnv / wh299Phone) plus an in-memory
 * node:sqlite DB with ONLY kept tables to prove readers never query dropped tables.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { bootPhone, env, eraseEverything, idsOf, metaOf, resetEnv, type Phone } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames, statementLog } from '@/tests/phoneCopy/fakeExpoSqlite';
import { grnNamed, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { seedCustomerAccount } from '@/tests/phoneCopy/customerAccountFeed';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf, type Role, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { deriveStatusBar, type StatusBarInput } from '@/features/phone-copy/statusBarState';
import { applyChanges } from '@/features/phone-copy/applyBatch';
import { readAllStockSummary, readCustomerStockSummary } from '@/features/phone-copy/reads/reports/stockSummary';
import { readAllStockAging, readCustomerStockAging } from '@/features/phone-copy/reads/reports/stockAging';
import { readGrnDetails } from '@/features/phone-copy/reads/grnDetails';
import { STOCK_AGING_KINDS } from '@/features/reports/reportCopyKinds';
import type { CopyDriver, SqlValue } from '@/features/phone-copy/copyDriver';
import type { CopyReader } from '@/features/phone-copy/readRoute';

const DROPPED_ENTITIES = [
  'dispatch', 'dispatch_trl', 'dispatch_images',
  'invoice', 'invoice_trl', 'payments',
  'orders', 'order_items',
] as const;

const KEPT_ENTITIES = [
  'customers', 'items', 'settings', 'people',
  'goodsreceived', 'goodsreceived_trl', 'grn_images', 'grn_lock',
  'user_profiles', 'users_customers_new',
  'grn_rates', 'item_storage_prices', 'standard_rate_tiers', 'item_price_history',
  'grn_replacements', 'held_items',
] as const;

const KEPT_CUSTOMER_ENTITIES = [
  'customers', 'items', 'goodsreceived', 'goodsreceived_trl', 'grn_images', 'grn_rates',
] as const;

/** Configures env.feed to answer as a WH-381 format-8 server listing only the kept entities. */
function useFormat8Feed(entities: readonly string[] = KEPT_ENTITIES): void {
  const feed = env.feed;
  feed.format = 8;
  for (const entity of entities) feed.rows[entity] ??= [];
  const originalRpc = feed.rpc;
  feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await originalRpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, format: feed.format, entities: [...entities] } };
    }
    if (name === 'get_sync_checksums') {
      const byName = new Map((data.entities as Array<{ e: string }>).map(e => [e.e, e]));
      return {
        ...answer,
        data: { ...data, entities: entities.map(e => byName.get(e) ?? { e, count: 0, sum: '0', settled: true }) },
      };
    }
    return answer;
  };
}

/** In-memory SQLite CopyDriver + CopyReader containing ONLY kept tables (ZERO dispatch/invoice/order/payment tables). */
function makeKeptOnlyDb() {
  const raw = new DatabaseSync(':memory:');
  const queries: string[] = [];
  raw.exec(`
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE stage_rows (entity TEXT NOT NULL, id TEXT NOT NULL, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, PRIMARY KEY (entity, id));
    CREATE TABLE money_stale (customer_id TEXT PRIMARY KEY);
    CREATE TABLE money_answers (kind TEXT NOT NULL, key TEXT NOT NULL, as_of TEXT NOT NULL, today TEXT, body TEXT NOT NULL, used_at INTEGER NOT NULL, PRIMARY KEY (kind, key));
    CREATE TABLE customers (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, name, active, deleted_at, name_lc, mobile_digits, mobile_key, city_lc);
    CREATE TABLE items (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, name, active, name_lc, packaging_lc, description_lc);
    CREATE TABLE settings (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
    CREATE TABLE people (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
    CREATE TABLE user_profiles (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, name_lc, role, active);
    CREATE TABLE users_customers_new (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
    CREATE TABLE goodsreceived (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, gr_no, date, customer_id, deleted_at, gr_no_lc, customer_name_lc, registration_lc, date_us, gr_no_sk, imported, invoiced, out_of_stock);
    CREATE TABLE goodsreceived_trl (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, gr_id, item_id, qty, stock, item_name_lc, package_mark_lc, rack_lc, weight, packaging, emptied_us);
    CREATE TABLE grn_images (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, grn_id, grn_item_id);
    CREATE TABLE grn_lock (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, invoice_state);
    CREATE TABLE grn_rates (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, gr_id);
    CREATE TABLE grn_replacements (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, grn_id, sent_at_us);
    CREATE TABLE item_storage_prices (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, item_id, customer_id, effective_from_us);
    CREATE TABLE standard_rate_tiers (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
    CREATE TABLE item_price_history (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, item_id, changed_at_us);
    CREATE TABLE held_items (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, kind, state);
    CREATE TABLE lot_search (rowid INTEGER PRIMARY KEY, lot_id TEXT NOT NULL UNIQUE, gr_id TEXT NOT NULL, haystack TEXT NOT NULL);
    CREATE VIRTUAL TABLE lot_fts USING fts5(haystack, content='lot_search', content_rowid='rowid', tokenize='trigram');
    CREATE TABLE text_rank (kind TEXT NOT NULL, value TEXT NOT NULL, rank INTEGER NOT NULL, PRIMARY KEY (kind, value));
    CREATE TABLE photo_files (storage_path TEXT PRIMARY KEY, file TEXT NOT NULL, bytes INTEGER NOT NULL, kept_at INTEGER NOT NULL);
  `);

  const driver: CopyDriver = {
    path: ':memory:',
    async exec(sql: string) { queries.push(sql); raw.exec(sql); },
    async run(sql: string, params: SqlValue[] = []) {
      queries.push(sql);
      const res = raw.prepare(sql).run(...(params as SQLInputValue[]));
      return { changes: Number(res.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      queries.push(sql);
      return raw.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
    async transaction<T>(fn: (tx: CopyDriver) => Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const result = await fn(driver);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    async close() { raw.close(); },
  };

  const reader = (role: CopyReader['role'] = 'admin', format = 8): CopyReader => ({
    all: (sql, params) => driver.all(sql, params),
    get: async <R,>(sql: string, params?: SqlValue[]) => (await driver.all<R>(sql, params))[0] ?? null,
    rank: async () => undefined,
    asOf: '2026-11-25T05:12:00.000+00:00',
    phase: 'ready',
    copyId: 'copy-wh381',
    format,
    role,
  });

  const seedBasicGrn = () => {
    const v = '0123456789abcdef';
    const customer = { id: 'c1', name: 'Asha Traders', mobile: '+91 90000 00001', active: true, deleted_at: null };
    raw.prepare('INSERT INTO customers VALUES (?, ?, 0, 0, ?, ?, 1, NULL, ?, ?, ?, NULL)').run(
      'c1', v, JSON.stringify(customer), 'Asha Traders', 'asha traders', '919000000001', '9000000001'
    );
    const item1 = { id: 'i1', name: 'Peas', packaging: 'Bag', description: 'Produce', active: true };
    const item2 = { id: 'i2', name: 'Beans', packaging: 'Bag', description: 'Produce', active: true };
    raw.prepare('INSERT INTO items VALUES (?, ?, 0, 0, ?, ?, 1, ?, ?, ?)').run('i1', v, JSON.stringify(item1), 'Peas', 'peas', 'bag', 'produce');
    raw.prepare('INSERT INTO items VALUES (?, ?, 0, 0, ?, ?, 1, ?, ?, ?)').run('i2', v, JSON.stringify(item2), 'Beans', 'beans', 'bag', 'produce');

    const grnDate = '2026-11-20T05:00:00+00:00';
    const grnDateUs = Date.parse('2026-11-20T05:00:00Z') * 1000;
    const grn = {
      id: 'g1', gr_no: 'A2', date: grnDate, customer_id: 'c1', customer_name: 'Asha Traders',
      registration: 'GJ01AB1234', supervisor_name: 'Meera Fictional', sender_id: null, sender_name: null,
      note: 'Fictional note', out_of_stock: false, invoiced: false, import_batch_id: null, deleted_at: null,
      pricing_mode: 'MONTHLY', duration_mode: 'MONTHLY', leon: false, created_at: grnDate, updated_at: grnDate,
    };
    raw.prepare('INSERT INTO goodsreceived VALUES (?, ?, 0, 0, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, 0, 0)').run(
      'g1', v, JSON.stringify(grn), 'A2', grnDate, 'c1', 'a2', 'asha traders', 'gj01ab1234', grnDateUs, 'A2'
    );
    const emptiedAt = '2026-11-23T05:00:00+00:00';
    const emptiedUs = Date.parse('2026-11-23T05:00:00Z') * 1000;
    const lot1 = { id: 'l1', gr_id: 'g1', item_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 100, stock: 0, weight: 25, rack: 'B-2', package_mark: 'PK-78', trl_img_url: null, emptied_at: emptiedAt };
    const lot2 = { id: 'l2', gr_id: 'g1', item_id: 'i2', item_name: 'Beans', packaging: 'Bag', qty: 100, stock: 19, weight: 30, rack: 'B-3', package_mark: '50%_OFF', trl_img_url: null, emptied_at: null };
    // Third lot tests MAX(0, qty - stock) clamping if stock ever exceeded qty.
    const lot3 = { id: 'l3', gr_id: 'g1', item_id: 'i2', item_name: 'Beans', packaging: 'Bag', qty: 10, stock: 12, weight: 10, rack: 'B-4', package_mark: 'CLAMP', trl_img_url: null, emptied_at: null };
    raw.prepare('INSERT INTO goodsreceived_trl VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'l1', v, JSON.stringify(lot1), 'g1', 'i1', 100, 0, 'peas', 'pk-78', 'b-2', 25, 'Bag', emptiedUs
    );
    raw.prepare('INSERT INTO goodsreceived_trl VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
      'l2', v, JSON.stringify(lot2), 'g1', 'i2', 100, 19, 'beans', '50%_off', 'b-3', 30, 'Bag'
    );
    raw.prepare('INSERT INTO goodsreceived_trl VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
      'l3', v, JSON.stringify(lot3), 'g1', 'i2', 10, 12, 'beans', 'clamp', 'b-4', 10, 'Bag'
    );
    const lock = { grn_id: 'g1', gr_no: 'A2', date: grnDate, lines: [], imported: false, invoice_state: 'partly_invoiced' };
    raw.prepare('INSERT INTO grn_lock VALUES (?, ?, 0, 0, ?, ?)').run('g1', v, JSON.stringify(lock), 'partly_invoiced');
  };

  return { raw, driver, reader, queries, seedBasicGrn };
}

beforeEach(() => {
  resetEnv();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('1. copySchema.ts: schema v5, format 8, 16 kept entities, 0 dropped entities or dispatch FTS', () => {
  it('SCHEMA_VERSION is 5 and SYNC_FORMATS includes 8', () => {
    const schema = require('@/features/phone-copy/copySchema') as typeof import('@/features/phone-copy/copySchema');
    expect(schema.SCHEMA_VERSION).toBe(5);
    expect(schema.SYNC_FORMATS).toContain(8);
  });

  it('ENTITY_SPECS and isEntityName omit all 8 dropped entities and retain all 16 kept entities', () => {
    const schema = require('@/features/phone-copy/copySchema') as typeof import('@/features/phone-copy/copySchema');
    const names = Object.keys(schema.ENTITY_SPECS).sort();
    expect(names).toEqual([...KEPT_ENTITIES].sort());
    for (const dropped of DROPPED_ENTITIES) {
      expect(schema.isEntityName(dropped)).toBe(false);
      expect(schema.ALL_ENTITIES).not.toContain(dropped);
    }
    for (const kept of KEPT_ENTITIES) {
      expect(schema.isEntityName(kept)).toBe(true);
    }
  });

  it('createSchema creates no dispatch/invoice/order/payment tables and no dispatch_search or dispatch_fts', async () => {
    const schema = require('@/features/phone-copy/copySchema') as typeof import('@/features/phone-copy/copySchema');
    const raw = new DatabaseSync(':memory:');
    const driver: CopyDriver = {
      path: ':memory:',
      async exec(sql) { raw.exec(sql); },
      async run(sql, params = []) {
        const res = raw.prepare(sql).run(...(params as SQLInputValue[]));
        return { changes: Number(res.changes) };
      },
      async all<T>(sql: string, params: SqlValue[] = []) { return raw.prepare(sql).all(...(params as SQLInputValue[])) as T[]; },
      async transaction<T>(fn: (tx: CopyDriver) => Promise<T>) { return fn(driver); },
      async close() { raw.close(); },
    };
    try {
      await schema.createSchema(driver);
      const tables = (await driver.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
      for (const forbidden of [...DROPPED_ENTITIES, 'dispatch_search', 'dispatch_fts']) {
        expect(tables).not.toContain(forbidden);
      }
      for (const required of [...KEPT_ENTITIES, 'lot_search', 'lot_fts', 'money_answers', 'money_stale', 'meta', 'stage_rows', 'text_rank', 'photo_files']) {
        expect(tables).toContain(required);
      }
    } finally {
      raw.close();
    }
  });
});

describe('2. Upgrade wipe (criterion 14a): schema-4 DB with legacy dropped tables is wiped to fresh schema-5 DB', () => {
  it('opening a schema-4 DB containing dispatch/order/invoice/payment tables recreates schema 5 at phase=empty with zero dropped tables and keeps money_answers/money_stale', async () => {
    // Prepare an existing schema-4 DB with the valid key for this scope, populated with legacy dropped tables.
    const first = bootPhone();
    const scope = (await first.scope())!;
    const oldDb = await first.copyDb.openCopy(scope);
    await oldDb.exec(`
      CREATE TABLE IF NOT EXISTS dispatch (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispatch_trl (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispatch_images (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invoice (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invoice_trl (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispatch_search (rowid INTEGER PRIMARY KEY, disp_id TEXT, haystack TEXT);
      INSERT OR REPLACE INTO dispatch (id, v, v_hi, v_lo, row) VALUES ('d-old', '0123456789abcdef', 0, 0, '{"id":"d-old"}');
      INSERT OR REPLACE INTO invoice (id, v, v_hi, v_lo, row) VALUES ('inv-old', '0123456789abcdef', 0, 0, '{"id":"inv-old"}');
      INSERT OR REPLACE INTO orders (id, v, v_hi, v_lo, row) VALUES ('ord-old', '0123456789abcdef', 0, 0, '{"id":"ord-old"}');
      INSERT OR REPLACE INTO payments (id, v, v_hi, v_lo, row) VALUES ('pay-old', '0123456789abcdef', 0, 0, '{"id":"pay-old"}');
      INSERT OR REPLACE INTO meta (k, v) VALUES ('schema_version', '4'), ('phase', 'ready'), ('load_cursor', '{"entity":"dispatch","after":null}');
    `);
    await first.engine.stopPhoneCopy();

    // Reopen on the upgraded WH-381 build.
    const upgraded = bootPhone();
    await upgraded.engine.startPhoneCopy();
    expect(upgraded.syncStore.getSyncSnapshot().phase).toBe('empty');
    expect(await metaOf(upgraded, 'schema_version')).toBe('5');
    expect(await metaOf(upgraded, 'phase')).toBe('empty');
    expect(await metaOf(upgraded, 'load_cursor')).toBeNull();

    const db = await upgraded.copyDb.openCopy(scope);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
    for (const dropped of [...DROPPED_ENTITIES, 'dispatch_search', 'dispatch_fts']) {
      expect(tables).not.toContain(dropped);
    }
    expect(tables).toContain('money_answers');
    expect(tables).toContain('money_stale');

    // A subsequent format-8 sync loads kept entities cleanly and still leaves zero dropped tables.
    seedWarehouse();
    useFormat8Feed();
    expect(await upgraded.engine.syncNow('open')).toBe('done');
    expect(upgraded.syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready', format: 8 });
    expect((await idsOf(upgraded, 'goodsreceived')).length).toBe(7);
    const tablesAfter = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(r => r.name);
    for (const dropped of DROPPED_ENTITIES) expect(tablesAfter).not.toContain(dropped);
  });
});

describe('3. Un-upgraded server compatibility (criterion 14)', () => {
  it.each([7, 3])('format %i listing dispatch in get_sync_start().entities yields off (FeatureOffError) with zero page fetches', async oldFormat => {
    seedWarehouse();
    env.feed.format = oldFormat;
    const originalRpc = env.feed.rpc;
    env.feed.rpc = async (name, args = {}) => {
      const res = await originalRpc(name, args);
      if (name === 'get_sync_start' && res.data && typeof res.data === 'object') {
        const d = res.data as { entities: string[] };
        if (!d.entities.includes('dispatch')) d.entities.push('dispatch');
      }
      return res;
    };
    const phone = bootPhone();
    await phone.engine.startPhoneCopy();
    expect(await phone.engine.syncNow('open')).toBe('off');
    expect(phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(phone.engine.isCopyReadable()).toBe(false);
    expect(env.feed.named('get_sync_page')).toHaveLength(0);
    expect(fakeDatabaseNames()).toEqual([]);
  });

  it('customer account against format-7 server listing dispatch yields off with zero copy DB', async () => {
    seedCustomerAccount(['c1'], 7);
    const w = await bootWarehouse({ role: 'customer' });
    await w.phone.engine.startPhoneCopy();
    expect(await w.phone.engine.syncNow('open')).toBe('off');
    expect(w.phone.syncStore.getSyncSnapshot().feature).toBe('off');
    expect(fakeDatabaseNames()).toEqual([]);
  });
});

describe('4. Single-stage initial load, statusBarState, and applyBatch stale marks', () => {
  it('loads all 16 kept entities in one pass straight to phase=ready and NEVER enters stage2', async () => {
    seedWarehouse();
    useFormat8Feed();
    const gate = env.feed.hold(c => c.name === 'get_sync_page' && c.args.p_entity === 'grn_lock');
    const phone = bootPhone();
    const seenPhases: string[] = [];
    const unsubscribe = phone.syncStore.subscribeSync(() => {
      seenPhases.push(phone.syncStore.getSyncSnapshot().phase);
    });
    try {
      await phone.engine.startPhoneCopy();
      const run = phone.engine.syncNow('open');
      await Promise.race([gate.opened, run]);
      // Past grn_images (formerly the stage1/stage2 boundary): still stage1, never stage2, not readable yet.
      expect(phone.syncStore.getSyncSnapshot().phase).toBe('stage1');
      expect(phone.engine.isCopyReadable()).toBe(false);
      gate.release();
      expect(await run).toBe('done');
    } finally {
      gate.release();
      unsubscribe();
    }
    expect(seenPhases).not.toContain('stage2');
    expect(phone.syncStore.getSyncSnapshot()).toMatchObject({ feature: 'on', phase: 'ready', format: 8, running: null });
    expect(phone.engine.isCopyReadable()).toBe(true);
    expect(await metaOf(phone, 'position')).toBe(env.feed.startPosition);
    expect(await metaOf(phone, 'load_cursor')).toBeNull();
    const found = await phone.queries.searchLots('pk-78');
    expect(found.rows.map(r => r.lotId)).toEqual(['l02']);
    expect((found as { olderLoading?: boolean }).olderLoading).toBeFalsy();
  });

  it('statusBarState never returns olderLoading or olderPaused (online, offline, or failed)', () => {
    const base: StatusBarInput = {
      phase: 'ready', loading: false, offline: false, current: false, lastRunFailed: false,
      asOf: Date.parse('2026-11-25T05:12:00Z'), storageLow: false, unsent: null, running: false,
    };
    const cases: Partial<StatusBarInput>[] = [
      { phase: 'empty', loading: true },
      { phase: 'stage1', loading: true },
      { phase: 'stage1', offline: true },
      { phase: 'ready', offline: false },
      { phase: 'ready', offline: true },
      { phase: 'ready', lastRunFailed: true },
      // Even if a legacy 'stage2' string were ever passed at runtime, row 6 is gone.
      { phase: 'stage2' as StatusBarInput['phase'], offline: false, running: true },
      { phase: 'stage2' as StatusBarInput['phase'], offline: true },
      { phase: 'stage2' as StatusBarInput['phase'], lastRunFailed: true },
    ];
    for (const patch of cases) {
      const v = deriveStatusBar({ ...base, ...patch });
      expect((v as { olderLoading?: boolean }).olderLoading).toBeFalsy();
      const keys = v.line1.map(l => l.key);
      expect(keys).not.toContain('olderLoading');
      expect(keys).not.toContain('olderPaused');
    }
  });

  it('applyChanges handles entry.op==="stale" (money_stale + meta.money_dues_stale) and GRN changes with zero dropped tables in SQLite', async () => {
    const { driver, seedBasicGrn, raw } = makeKeptOnlyDb();
    try {
      seedBasicGrn();
      const touched = await applyChanges(
        driver,
        [
          { e: 'money', id: 'c1', op: 'stale' },
          {
            e: 'goodsreceived_trl',
            id: 'l2',
            op: 'upsert',
            v: 'abcdef0123456789',
            row: { ...lotNamed('l03'), id: 'l2', gr_id: 'g1', rack: 'Z-9' },
          },
          { e: 'goodsreceived', id: 'g1', op: 'delete' },
        ],
        true
      );
      expect([...touched].sort()).toEqual(['goodsreceived', 'goodsreceived_trl']);
      expect(await driver.all('SELECT customer_id FROM money_stale')).toEqual([{ customer_id: 'c1' }]);
      expect(await driver.all("SELECT v FROM meta WHERE k = 'money_dues_stale'")).toEqual([{ v: '1' }]);
      expect(await driver.all('SELECT id FROM goodsreceived')).toEqual([]);
      expect(await driver.all('SELECT id FROM goodsreceived_trl')).toEqual([]);
    } finally {
      raw.close();
    }
  });
});

describe('5. Kept SQLite readers work with ZERO dispatch/invoice/order/payment tables in SQLite', () => {
  it('stockSummary: works without dispatch table, does not query dispatch, returns last_dispatch_date: null and last_dispatch_no: null', async () => {
    const { reader, queries, seedBasicGrn, raw } = makeKeptOnlyDb();
    try {
      seedBasicGrn();
      queries.length = 0;
      const answer = await readCustomerStockSummary(reader('admin'), 'c1');
      const summary = answer.summary as Record<string, unknown>;
      expect(summary.last_dispatch_date).toBeNull();
      expect(summary.last_dispatch_no).toBeNull();
      expect(summary).toMatchObject({
        total_items: 1,
        total_quantity: 31, // l2 (19) + l3 (12)
        grn_count: 1,
        last_grn_no: 'A2',
        last_grn_date: '2026-11-20',
      });
      expect(queries.some(sql => /\bdispatch\b/i.test(sql))).toBe(false);

      const all = await readAllStockSummary(reader('admin'));
      expect((all.summary as Record<string, unknown>).total_quantity).toBe(31);
    } finally {
      raw.close();
    }
  });

  it('STOCK_AGING_KINDS omits dispatch and dispatch_trl', () => {
    expect(STOCK_AGING_KINDS).not.toContain('dispatch');
    expect(STOCK_AGING_KINDS).not.toContain('dispatch_trl');
    expect([...STOCK_AGING_KINDS].sort()).toEqual(['customers', 'goodsreceived', 'goodsreceived_trl']);
  });

  it('stockAging (Q2 settled): works without dispatch/dispatch_trl tables, leaves per-lot dispatch_info undefined, sets velocity null & items_no_recent_dispatch 0', async () => {
    const { reader, queries, seedBasicGrn, raw } = makeKeptOnlyDb();
    try {
      seedBasicGrn();
      queries.length = 0;
      const answer = await readCustomerStockAging(reader('admin'), 'c1', [3, 4, 10]);
      const data = answer.data as { summary: Record<string, unknown>; items: Array<Record<string, unknown>> };
      expect(queries.some(sql => /\bdispatch(_trl)?\b/i.test(sql))).toBe(false);
      expect(data.summary).toMatchObject({
        total_items: 2,
        total_quantity: 31,
        avg_dispatch_velocity_days: null,
        items_no_recent_dispatch: 0,
      });
      expect(data.items).toHaveLength(2);
      for (const item of data.items) {
        expect(item.dispatch_info).toBeUndefined();
      }

      const all = await readAllStockAging(reader('admin'), [3, 4, 10]);
      expect((all.data as { summary: Record<string, unknown> }).summary).toMatchObject({ total_customers: 1, total_items: 2, total_quantity: 31 });
    } finally {
      raw.close();
    }
  });

  it('stock-aging-service getCustomerStockAging preserves undefined dispatch_info offline (no zero coercion)', async () => {
    seedWarehouse();
    useFormat8Feed();
    const w = await bootWarehouse({ role: 'admin' });
    await loadCopy(w);
    await goOffline(w);
    statementLog().length = 0;
    const agingService = require('@/services/reporting/stock-aging-service') as typeof import('@/services/reporting/stock-aging-service');
    const result = await agingService.getCustomerStockAging({ customerId: 'c1', agingBuckets: [3, 4, 10] });
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.success).toBe(true);
    expect(result.data!.summary).toMatchObject({
      total_items: 3,
      total_quantity: 30,
      avg_dispatch_velocity_days: null,
      items_no_recent_dispatch: 0,
    });
    expect(result.data!.items.length).toBeGreaterThan(0);
    for (const item of result.data!.items) {
      expect(item.dispatch_info).toBeUndefined();
    }
    expect(statementLog().some(sql => /\bdispatch(_trl)?\b/i.test(sql))).toBe(false);
  });

  it('grnDetails removes readItemDispatches export', () => {
    const grnDetailsMod = require('@/features/phone-copy/reads/grnDetails') as Record<string, unknown>;
    expect('readItemDispatches' in grnDetailsMod).toBe(false);
  });

  it('grnDetails: works without dispatch/invoice tables, computes total_dispatched = SUM(MAX(0, qty - stock)), keeps grn_lock.invoice_state, and returns empty dispatch/invoice summaries', async () => {
    const { reader, queries, seedBasicGrn, raw } = makeKeptOnlyDb();
    try {
      seedBasicGrn();
      queries.length = 0;
      const answer = await readGrnDetails(reader('admin'), 'g1');
      expect(queries.some(sql => /\b(dispatch|dispatch_trl|invoice|invoice_trl)\b/i.test(sql))).toBe(false);
      expect(answer.kind).toBe('found');
      if (answer.kind !== 'found') return;
      const grn = answer.grn;
      // l1: max(0, 100 - 0) = 100; l2: max(0, 100 - 19) = 81; l3: max(0, 10 - 12) = 0 -> 181
      expect(grn.statistics).toMatchObject({
        total_qty: 210,
        total_stock: 31,
        total_dispatched: 181,
        has_out_of_stock: true,
      });
      expect(grn.dispatches_summary).toEqual({ total_dispatches: 0, dispatch_numbers: [] });
      expect(grn.invoices_summary).toEqual({
        total_invoices: 0,
        invoice_state: 'partly_invoiced',
        can_create_invoice: false,
        invoices: [],
        cancelled_count: 0,
        total_amount: 0,
        invoice_labels: [],
        invoice_numbers: [],
      });

      // Customer role receives invoice_state: null (no grn_lock read).
      const customerAnswer = await readGrnDetails(reader('customer'), 'g1');
      expect(customerAnswer.kind).toBe('found');
      if (customerAnswer.kind === 'found') {
        expect((customerAnswer.grn.invoices_summary as Record<string, unknown>).invoice_state).toBeNull();
      }
    } finally {
      raw.close();
    }
  });

  it('GRN Invoicing filter works online from grn_lock and returns invoiceFilterWaiting offline over a ready copy', async () => {
    seedWarehouse();
    useFormat8Feed();
    const w = await bootWarehouse({ role: 'admin' });
    await loadCopy(w);
    const grnService = require('@/services/grn-service') as typeof import('@/services/grn-service');

    const online = await grnService.getGRNListPage({ p_limit: 20, p_offset: 0, p_filters: { invoiced: true } }, null);
    expect(online.success).toBe(true);
    expect(online.data.items.map(i => i.grn_item_id)).toEqual(['l01']);
    expect(w.serverCalls).toEqual([]);

    await goOffline(w);
    for (const invoiced of [true, false, 'partly_invoiced'] as const) {
      const offline = (await grnService.getGRNListPage({ p_limit: 20, p_offset: 0, p_filters: { invoiced } }, null)) as unknown as {
        data: { items: unknown[] }; invoiceFilterWaiting?: boolean;
      };
      expect(offline.data.items).toEqual([]);
      expect(offline.invoiceFilterWaiting).toBe(true);
    }
    expect(w.serverCalls).toEqual([]);
  });
});

describe('6. Routing: server-only services do NOT read from the phone copy offline (or online)', () => {
  const period = { fromDate: '2026-11-01', toDate: '2026-11-25' };

  async function readyOffline(role: Role = 'admin'): Promise<Warehouse> {
    seedWarehouse();
    seedDocuments();
    if (role === 'customer') {
      seedCustomerAccount(['c1', 'c2'], 8);
      useFormat8Feed(KEPT_CUSTOMER_ENTITIES);
    } else {
      useFormat8Feed(KEPT_ENTITIES);
    }
    const w = await bootWarehouse({ role });
    await loadCopy(w);
    await goOffline(w);
    w.serverCalls.length = 0;
    return w;
  }

  const SERVER_ONLY_WAREHOUSE: Array<[string, string, () => Promise<unknown>]> = [
    ['order-service getOrdersList', 'get_orders_list',
      () => (require('@/services/order-service') as typeof import('@/services/order-service')).getOrdersList({ has_items: true })],
    ['order-service getOrderWithItems', 'get_order_with_items',
      () => (require('@/services/order-service') as typeof import('@/services/order-service')).getOrderWithItems('o-1')],
    ['order-service getCustomerOrder', 'get_customer_order',
      () => (require('@/services/order-service') as typeof import('@/services/order-service')).OrderService.getCustomerOrder('c1')],
    ['order-service getOrderScreenCustomer', 'from:customers',
      () => (require('@/services/order-service') as typeof import('@/services/order-service')).getOrderScreenCustomer('c1').catch(() => null)],
    ['dispatch-service getDispatchListWithItems', 'get_dispatch_list_with_items',
      () => (require('@/services/dispatch-service') as typeof import('@/services/dispatch-service')).getDispatchListWithItems({})],
    ['dispatch-service getRecentDispatchedOrders', 'get_recent_dispatched_orders',
      () => (require('@/services/dispatch-service') as typeof import('@/services/dispatch-service')).getRecentDispatchedOrders(10, 0)],
    ['dispatch-detail-service getDispatchDetails', 'get_dispatch_details',
      () => (require('@/services/dispatch-detail-service') as typeof import('@/services/dispatch-detail-service')).getDispatchDetails('d-D2')],
    ['invoice-service getInvoicesList', 'get_invoices_list',
      () => (require('@/services/invoice-service') as typeof import('@/services/invoice-service')).getInvoicesList({ p_limit: 20, p_offset: 0 })],
    ['invoice-service getGrnInvoiceRows', 'get_invoices_list',
      () => (require('@/services/invoice-service') as typeof import('@/services/invoice-service')).getGrnInvoiceRows({ grnId: 'g-A10', grnNo: 'A10', customerId: 'c2', warehouseRole: true })],
    ['invoice-service getInvoiceDetails', 'get_invoice_data',
      () => (require('@/services/invoice-service') as typeof import('@/services/invoice-service')).getInvoiceDetails('inv1')],
    ['invoice-service getInvoiceItemsDetailed', 'get_invoice_items_detailed',
      () => (require('@/services/invoice-service') as typeof import('@/services/invoice-service')).getInvoiceItemsDetailed('inv1')],
    ['invoice-service getInvoiceReasons', 'get_invoice_detail',
      () => (require('@/services/invoice-service') as typeof import('@/services/invoice-service')).getInvoiceReasons('inv1')],
    ['paymentsService getInvoicePayments', 'get_invoice_detail',
      () => (require('@/services/paymentsService') as typeof import('@/services/paymentsService')).getInvoicePayments('inv1').catch(() => null)],
    ['dispatch-activity-service getAllDispatchActivity', 'get_all_dispatch_activity',
      () => (require('@/services/reporting/dispatch-activity-service') as typeof import('@/services/reporting/dispatch-activity-service')).getAllDispatchActivity(period)],
    ['dispatch-activity-service getCustomerDispatchActivity', 'get_dispatch_activity_report',
      () => (require('@/services/reporting/dispatch-activity-service') as typeof import('@/services/reporting/dispatch-activity-service')).getCustomerDispatchActivity({ customerId: 'c1', ...period })],
    ['grn-activity-service getAllGRNActivity', 'get_all_grn_activity',
      () => (require('@/services/reporting/grn-activity-service') as typeof import('@/services/reporting/grn-activity-service')).getAllGRNActivity(period)],
    ['grn-activity-service getCustomerGRNActivity', 'get_grn_activity_report',
      () => (require('@/services/reporting/grn-activity-service') as typeof import('@/services/reporting/grn-activity-service')).getCustomerGRNActivity({ customerId: 'c1', ...period })],
    ['grn-detail-service getGRNItemDispatches', 'get_grn_item_dispatches',
      () => (require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service')).getGRNItemDispatches('l02')],
  ];

  it.each(SERVER_ONLY_WAREHOUSE)('warehouse offline: %s calls server (%s), never the copy', async (_label, expectedRpc, run) => {
    const w = await readyOffline('admin');
    const result = await run();
    expect(sourceOf(result)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toContain(expectedRpc);
  });

  it('customer account offline: dispatches, invoices, orders, activity reports, and lot dispatches all hit the server while GRNs and stock reports stay on the copy', async () => {
    const w = await readyOffline('customer');
    const grn = require('@/services/grn-service') as typeof import('@/services/grn-service');
    const stock = require('@/services/reporting/stock-summary-service') as typeof import('@/services/reporting/stock-summary-service');
    const dispatch = require('@/services/dispatch-service') as typeof import('@/services/dispatch-service');
    const invoices = require('@/services/invoice-service') as typeof import('@/services/invoice-service');
    const grnDetail = require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');

    // Kept: GRNs & stock summary read from copy with 0 server calls.
    const keptGrn = await grn.getGRNListPage({ p_limit: 20, p_offset: 0 }, ['c1']);
    const keptStock = await stock.getCustomerStockSummary('c1');
    expect(sourceOf(keptGrn)).toEqual(copySource());
    expect(sourceOf(keptStock)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);

    // Dropped: customer dispatches, customer invoices, and lot dispatches call the server.
    const dispRes = await dispatch.getAssignedCustomerDispatchList(['c1'], { p_limit: 20 });
    const invRes = await invoices.getAssignedCustomerInvoices(['c2'], { p_limit: 20 });
    const lotDispRes = await grnDetail.getGRNItemDispatches('l02');
    for (const r of [dispRes, invRes, lotDispRes]) expect(sourceOf(r)).toBeUndefined();
    expect(w.serverCalls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('7. Customer activity kept answers (Product Q1, 2026-11-27): customer accounts only', () => {
  // The feed keeps the current format and lists only kept entities, so the copy loads on the build before and after the
  // cut, and the failure (if any) is the gate itself. AGREE WITH DEVELOPMENT: the gate is `activityMoneyOn()` in
  // src/features/phone-copy/money/moneyGate.ts, as the contract (section 5, Q1) names it.
  const dropDispatchEntities = () => {
    const rpc = env.feed.rpc;
    env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const answer = await rpc(name, args);
      const data = answer.data as { entities?: unknown[] } | null;
      if (!data?.entities) return answer;
      const dropped = new Set<string>(DROPPED_ENTITIES);
      if (name === 'get_sync_start') return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !dropped.has(e)) } };
      if (name === 'get_sync_checksums') return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !dropped.has(e.e)) } };
      return answer;
    };
  };

  it.each<[Role, boolean]>([['admin', false], ['supervisor', false], ['staff', false], ['customer', true]])(
    '%s with a ready copy: activityMoneyOn() is %s', async (role, expected) => {
      if (role === 'customer') seedCustomerAccount(['c1'], 7); else { seedWarehouse(); env.feed.format = 7; }
      dropDispatchEntities();
      const w = await bootWarehouse({ role });
      await loadCopy(w);
      const gate = require('@/features/phone-copy/money/moneyGate') as typeof import('@/features/phone-copy/money/moneyGate');
      expect(gate.activityMoneyOn()).toBe(expected);
    });
});
