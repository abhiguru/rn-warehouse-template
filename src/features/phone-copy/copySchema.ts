/**
 * The phone copy's tables (WH-298, contract section 5). One table per entity the server lists, holding the server's
 * row unchanged as JSON plus a few columns copied out of it for indexes, search and the reads of the screens (WH-299,
 * product/tech/app-offline-read-from-copy.md section 5). The app never makes a table from a name the server sends: an
 * entity not listed here means the server's format is not this app's.
 */
import { documentNumberSortKey } from '@/utils/documentNumber';
import type { CopyDriver, SqlValue } from './copyDriver';
import { mobileDigits, mobileKey, parseTimestampUs } from './pgCompat';

export const SCHEMA_VERSION = 2;
/** The payload formats of the change-log feed this build reads. */
export const SYNC_FORMATS: readonly number[] = [1, 2];
/** The format from which the screens may read the copy: it carries what their rows need (WH-299, section 6). */
export const READ_FORMAT = 2;

export type EntityName =
  | 'customers' | 'items' | 'settings' | 'people' | 'goodsreceived' | 'goodsreceived_trl' | 'grn_images'
  | 'dispatch' | 'dispatch_trl' | 'dispatch_images' | 'invoice' | 'invoice_trl' | 'grn_lock' | 'user_profiles'
  | 'users_customers_new';

/**
 * A column copied out of the row: `from` are the row keys tried in order; `lower` keeps it lower-cased for search;
 * `compute` works the value out of the whole row instead.
 */
interface Extracted {
  name: string;
  from: readonly string[];
  lower?: boolean;
  compute?: (row: Record<string, unknown>) => SqlValue;
}
interface EntitySpec {
  columns: readonly Extracted[];
  indexes: readonly string[];
}

const col = (name: string, ...from: string[]): Extracted => ({ name, from: from.length ? from : [name] });
const lower = (name: string, key: string): Extracted => ({ name, from: [key], lower: true });
const computed = (name: string, compute: (row: Record<string, unknown>) => SqlValue): Extracted => ({ name, from: [], compute });
const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** A server time in microseconds, so rows a microsecond apart keep the server's order. */
const micros = (name: string, key: string) => computed(name, row => parseTimestampUs(textOf(row[key])));
const sortKey = (name: string, key: string) => computed(name, row => documentNumberSortKey(textOf(row[key])));

export const ENTITY_SPECS: Readonly<Record<EntityName, EntitySpec>> = {
  customers: {
    columns: [col('name'), col('active'), col('deleted_at'), lower('name_lc', 'name'),
      computed('mobile_digits', row => mobileDigits(textOf(row.mobile))), computed('mobile_key', row => mobileKey(textOf(row.mobile)))],
    indexes: ['name_lc'],
  },
  items: {
    columns: [col('name'), col('active'), lower('name_lc', 'name'), lower('packaging_lc', 'packaging'), lower('description_lc', 'description')],
    indexes: ['name_lc'],
  },
  settings: { columns: [], indexes: [] },
  people: { columns: [], indexes: [] },
  user_profiles: { columns: [], indexes: [] },
  users_customers_new: { columns: [], indexes: [] },
  goodsreceived: {
    columns: [col('gr_no'), col('date'), col('customer_id'), col('deleted_at'), lower('gr_no_lc', 'gr_no'),
      lower('customer_name_lc', 'customer_name'), lower('registration_lc', 'registration'), micros('date_us', 'date'),
      sortKey('gr_no_sk', 'gr_no'), computed('imported', row => (row.import_batch_id === null || row.import_batch_id === undefined ? 0 : 1)),
      col('invoiced'), col('out_of_stock')],
    indexes: ['customer_id', 'date', 'gr_no', 'date_us', 'gr_no_sk'],
  },
  goodsreceived_trl: {
    columns: [col('gr_id', 'gr_id', 'grn_id'), col('item_id'), col('qty'), col('stock'), lower('item_name_lc', 'item_name'),
      lower('package_mark_lc', 'package_mark'), lower('rack_lc', 'rack'), col('weight'), col('packaging'), micros('emptied_us', 'emptied_at')],
    indexes: ['gr_id', 'item_id', 'stock'],
  },
  grn_images: { columns: [col('grn_id', 'grn_id', 'gr_id'), col('grn_item_id')], indexes: ['grn_id'] },
  dispatch: {
    columns: [col('disp_no'), col('disp_date'), col('customer_id'), col('deleted_at'), micros('disp_date_us', 'disp_date'),
      micros('created_at_us', 'created_at'), sortKey('disp_no_sk', 'disp_no'), lower('disp_no_lc', 'disp_no'),
      lower('customer_name_lc', 'customer_name'), lower('registration_lc', 'registration')],
    indexes: ['customer_id', 'disp_date', 'disp_date_us', 'disp_no_sk'],
  },
  dispatch_trl: { columns: [col('disp_id'), col('gr_id'), col('gr_trl_id'), col('disp_qty')], indexes: ['disp_id', 'gr_trl_id', 'gr_id'] },
  dispatch_images: { columns: [col('dispatch_id')], indexes: ['dispatch_id'] },
  invoice: { columns: [col('customer_id'), col('gr_id'), col('deleted_at')], indexes: ['customer_id', 'gr_id'] },
  invoice_trl: { columns: [col('invoice_id')], indexes: ['invoice_id'] },
  grn_lock: { columns: [col('invoice_state')], indexes: [] },
};

/** The texts a read sorts in the server's en_US order: where each comes from (reads/textRank.ts, `text_rank`). */
export const RANK_SOURCES = {
  gr_no: { entity: 'goodsreceived', key: 'gr_no' },
  customer_name: { entity: 'goodsreceived', key: 'customer_name' },
  item_name: { entity: 'goodsreceived_trl', key: 'item_name' },
  package_mark: { entity: 'goodsreceived_trl', key: 'package_mark' },
} as const satisfies Record<string, { entity: EntityName; key: string }>;
export type RankKind = keyof typeof RANK_SOURCES;
export const RANK_KINDS = Object.keys(RANK_SOURCES) as RankKind[];
/** The `meta` key that says the ranks of a kind cover every value held. */
export const rankMetaKey = (kind: RankKind): string => `rank:${kind}`;

export const isEntityName = (name: unknown): name is EntityName =>
  typeof name === 'string' && Object.prototype.hasOwnProperty.call(ENTITY_SPECS, name);

/** The last entity of the first stage: after it the phone is usable (spec step 2). */
export const LAST_STAGE_ONE_ENTITY: EntityName = 'grn_images';

/** The extracted column names of an entity, in table order. */
export const extractedColumns = (entity: EntityName): string[] => ENTITY_SPECS[entity].columns.map(c => c.name);

function sqlValue(value: unknown, lowerCase: boolean | undefined): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? (lowerCase ? String(value) : value) : null;
  if (typeof value === 'string') return lowerCase ? value.toLowerCase() : value;
  return null;
}

/** The extracted values of a row, in `extractedColumns` order. */
export function extractValues(entity: EntityName, row: Record<string, unknown>): SqlValue[] {
  return ENTITY_SPECS[entity].columns.map(column => {
    if (column.compute) return column.compute(row);
    const key = column.from.find(k => row[k] !== undefined && row[k] !== null);
    return key === undefined ? null : sqlValue(row[key], column.lower);
  });
}

/** `v` is 16 hex; the server sums its first 15 hex digits, split here so SQLite's 64-bit sum never overflows. */
export const vParts = (v: string): [number, number] => [parseInt(v.slice(0, 7), 16), parseInt(v.slice(7, 15), 16)];

const ENTITY_NAMES = Object.keys(ENTITY_SPECS) as EntityName[];

function entityTableSql(entity: EntityName): string {
  const extra = extractedColumns(entity).map(name => `, ${name}`).join('');
  return `CREATE TABLE IF NOT EXISTS ${entity} (id TEXT PRIMARY KEY, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL${extra});`;
}

/**
 * Tables of a new copy: bookkeeping, every entity, the two search tables with their FTS indexes (lots filled at the
 * stage switch, dispatches when the load ends), the text ranks and the list of photos kept on the phone.
 */
export async function createSchema(tx: CopyDriver): Promise<void> {
  await tx.exec([
    'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS stage_rows (entity TEXT NOT NULL, id TEXT NOT NULL, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, PRIMARY KEY (entity, id));',
    'CREATE TABLE IF NOT EXISTS money_stale (customer_id TEXT PRIMARY KEY);',
    ...ENTITY_NAMES.map(entityTableSql),
    'CREATE TABLE IF NOT EXISTS lot_search (rowid INTEGER PRIMARY KEY, lot_id TEXT NOT NULL UNIQUE, gr_id TEXT NOT NULL, haystack TEXT NOT NULL);',
    "CREATE VIRTUAL TABLE IF NOT EXISTS lot_fts USING fts5(haystack, content='lot_search', content_rowid='rowid', tokenize='trigram');",
    'CREATE TABLE IF NOT EXISTS dispatch_search (rowid INTEGER PRIMARY KEY, disp_id TEXT NOT NULL UNIQUE, haystack TEXT NOT NULL);',
    "CREATE VIRTUAL TABLE IF NOT EXISTS dispatch_fts USING fts5(haystack, content='dispatch_search', content_rowid='rowid', tokenize='trigram');",
    'CREATE TABLE IF NOT EXISTS text_rank (kind TEXT NOT NULL, value TEXT NOT NULL, rank INTEGER NOT NULL, PRIMARY KEY (kind, value));',
    'CREATE TABLE IF NOT EXISTS photo_files (storage_path TEXT PRIMARY KEY, file TEXT NOT NULL, bytes INTEGER NOT NULL, kept_at INTEGER NOT NULL);',
  ].join('\n'));
}

/** The indexes of the given entities (made after the stage that loads them). */
export async function createIndexes(tx: CopyDriver, entities: readonly EntityName[]): Promise<void> {
  const statements = entities.flatMap(entity =>
    ENTITY_SPECS[entity].indexes.map(column => `CREATE INDEX IF NOT EXISTS ix_${entity}_${column} ON ${entity}(${column});`));
  if (statements.length) await tx.exec(statements.join('\n'));
}

/** The search row of a lot: the six columns the server's search reads, joined by the unit separator. */
const HAYSTACK_SELECT = `SELECT t.id, t.gr_id,
  coalesce(g.gr_no_lc, '') || char(31) || coalesce(g.customer_name_lc, '') || char(31) || coalesce(t.item_name_lc, '') ||
  char(31) || coalesce(t.package_mark_lc, '') || char(31) || coalesce(t.rack_lc, '') || char(31) || coalesce(g.registration_lc, '')
  FROM goodsreceived_trl t JOIN goodsreceived g ON g.id = t.gr_id`;

/** The triggers that keep an FTS index in step with its search table. */
const ftsTriggers = (table: string, fts: string): string => [
  `CREATE TRIGGER IF NOT EXISTS ${table}_ai AFTER INSERT ON ${table} BEGIN INSERT INTO ${fts}(rowid, haystack) VALUES (new.rowid, new.haystack); END;`,
  `CREATE TRIGGER IF NOT EXISTS ${table}_ad AFTER DELETE ON ${table} BEGIN INSERT INTO ${fts}(${fts}, rowid, haystack) VALUES ('delete', old.rowid, old.haystack); END;`,
  `CREATE TRIGGER IF NOT EXISTS ${table}_au AFTER UPDATE ON ${table} BEGIN INSERT INTO ${fts}(${fts}, rowid, haystack) VALUES ('delete', old.rowid, old.haystack); INSERT INTO ${fts}(rowid, haystack) VALUES (new.rowid, new.haystack); END;`,
].join('\n');

/** Empties a search table, fills it from `select` and builds its index; the triggers keep it from then on. */
async function rebuildSearchTable(tx: CopyDriver, table: string, fts: string, insert: string): Promise<void> {
  await tx.exec(`DROP TRIGGER IF EXISTS ${table}_ai; DROP TRIGGER IF EXISTS ${table}_ad; DROP TRIGGER IF EXISTS ${table}_au; DELETE FROM ${table};`);
  await tx.run(insert);
  await tx.run(`INSERT INTO ${fts}(${fts}) VALUES ('rebuild')`);
  await tx.exec(ftsTriggers(table, fts));
}

const LOT_INSERT = `INSERT INTO lot_search (lot_id, gr_id, haystack) ${HAYSTACK_SELECT}`;

/** Builds the whole search table and its index from the lots held (stage switch, full reloads). */
export async function rebuildAllSearch(tx: CopyDriver): Promise<void> {
  await rebuildSearchTable(tx, 'lot_search', 'lot_fts', LOT_INSERT);
}

/** Rebuilds the search rows of the given lots and of every lot of the given GRNs (the FTS triggers follow). */
export async function rebuildSearchFor(tx: CopyDriver, lotIds: readonly string[], grnIds: readonly string[]): Promise<void> {
  for (let i = 0; i < lotIds.length; i += 500) {
    const ids = lotIds.slice(i, i + 500);
    const marks = ids.map(() => '?').join(', ');
    await tx.run(`DELETE FROM lot_search WHERE lot_id IN (${marks})`, ids);
    await tx.run(`${LOT_INSERT} WHERE t.id IN (${marks})`, ids);
  }
  for (let i = 0; i < grnIds.length; i += 500) {
    const ids = grnIds.slice(i, i + 500);
    const marks = ids.map(() => '?').join(', ');
    await tx.run(`DELETE FROM lot_search WHERE gr_id IN (${marks})`, ids);
    await tx.run(`${LOT_INSERT} WHERE t.gr_id IN (${marks})`, ids);
  }
}

/**
 * The search row of a dispatch: its number, customer and vehicle, then for every line its lot's item, mark and rack and
 * that lot's GRN number, as they are now (the server's search reads the lot and the GRN as they are now).
 */
const DISPATCH_INSERT = `INSERT INTO dispatch_search (disp_id, haystack) SELECT d.id,
  coalesce(d.disp_no_lc, '') || char(31) || coalesce(d.customer_name_lc, '') || char(31) || coalesce(d.registration_lc, '') ||
  coalesce((SELECT group_concat(char(31) || coalesce(t.item_name_lc, '') || char(31) || coalesce(t.package_mark_lc, '') ||
      char(31) || coalesce(t.rack_lc, '') || char(31) || coalesce(g.gr_no_lc, ''), '')
    FROM dispatch_trl dt LEFT JOIN goodsreceived_trl t ON t.id = dt.gr_trl_id LEFT JOIN goodsreceived g ON g.id = t.gr_id
    WHERE dt.disp_id = d.id), '')
  FROM dispatch d`;

/** Builds the whole dispatch search table and its index (end of the first load, full reloads). */
export async function rebuildAllDispatchSearch(tx: CopyDriver): Promise<void> {
  await rebuildSearchTable(tx, 'dispatch_search', 'dispatch_fts', DISPATCH_INSERT);
}

/** Rebuilds the search rows of the given dispatches (a deleted one loses its row). */
export async function rebuildDispatchSearchFor(tx: CopyDriver, dispatchIds: readonly string[]): Promise<void> {
  for (let i = 0; i < dispatchIds.length; i += 500) {
    const ids = dispatchIds.slice(i, i + 500);
    const marks = ids.map(() => '?').join(', ');
    await tx.run(`DELETE FROM dispatch_search WHERE disp_id IN (${marks})`, ids);
    await tx.run(`${DISPATCH_INSERT} WHERE d.id IN (${marks})`, ids);
  }
}

export const ALL_ENTITIES: readonly EntityName[] = ENTITY_NAMES;
