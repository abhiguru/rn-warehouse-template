/**
 * The phone copy's tables (WH-298, contract section 5). One table per entity the server lists, holding the server's
 * row unchanged as JSON plus a few columns copied out of it for indexes and search. The app never makes a table from
 * a name the server sends: an entity not listed here means the server's format is not this app's.
 */
import type { CopyDriver, SqlValue } from './copyDriver';

export const SCHEMA_VERSION = 1;
/** The payload formats of the change-log feed this build reads. */
export const SYNC_FORMATS: readonly number[] = [1];

export type EntityName =
  | 'customers' | 'items' | 'settings' | 'people' | 'goodsreceived' | 'goodsreceived_trl' | 'grn_images'
  | 'dispatch' | 'dispatch_trl' | 'dispatch_images' | 'invoice' | 'invoice_trl' | 'grn_lock' | 'user_profiles'
  | 'users_customers_new';

/** A column copied out of the row: `from` are the row keys tried in order; `lower` keeps it lower-cased for search. */
interface Extracted {
  name: string;
  from: readonly string[];
  lower?: boolean;
}
interface EntitySpec {
  columns: readonly Extracted[];
  indexes: readonly string[];
}

const col = (name: string, ...from: string[]): Extracted => ({ name, from: from.length ? from : [name] });
const lower = (name: string, key: string): Extracted => ({ name, from: [key], lower: true });

export const ENTITY_SPECS: Readonly<Record<EntityName, EntitySpec>> = {
  customers: { columns: [col('name'), col('active'), col('deleted_at')], indexes: [] },
  items: { columns: [col('name'), col('active')], indexes: [] },
  settings: { columns: [], indexes: [] },
  people: { columns: [], indexes: [] },
  user_profiles: { columns: [], indexes: [] },
  users_customers_new: { columns: [], indexes: [] },
  goodsreceived: {
    columns: [col('gr_no'), col('date'), col('customer_id'), col('deleted_at'), lower('gr_no_lc', 'gr_no'),
      lower('customer_name_lc', 'customer_name'), lower('registration_lc', 'registration')],
    indexes: ['customer_id', 'date', 'gr_no'],
  },
  goodsreceived_trl: {
    columns: [col('gr_id', 'gr_id', 'grn_id'), col('item_id'), col('qty'), col('stock'), lower('item_name_lc', 'item_name'),
      lower('package_mark_lc', 'package_mark'), lower('rack_lc', 'rack')],
    indexes: ['gr_id', 'item_id'],
  },
  grn_images: { columns: [col('grn_id', 'grn_id', 'gr_id'), col('grn_item_id')], indexes: ['grn_id'] },
  dispatch: { columns: [col('disp_no'), col('disp_date'), col('customer_id'), col('deleted_at')], indexes: ['customer_id', 'disp_date'] },
  dispatch_trl: { columns: [col('disp_id'), col('gr_id'), col('gr_trl_id'), col('disp_qty')], indexes: ['disp_id', 'gr_trl_id', 'gr_id'] },
  dispatch_images: { columns: [col('dispatch_id')], indexes: ['dispatch_id'] },
  invoice: { columns: [col('customer_id'), col('gr_id'), col('deleted_at')], indexes: ['customer_id', 'gr_id'] },
  invoice_trl: { columns: [col('invoice_id')], indexes: ['invoice_id'] },
  grn_lock: { columns: [], indexes: [] },
};

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

/** Tables of a new copy: bookkeeping, every entity, the search table and its FTS index (filled at the stage switch). */
export async function createSchema(tx: CopyDriver): Promise<void> {
  await tx.exec([
    'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS stage_rows (entity TEXT NOT NULL, id TEXT NOT NULL, v TEXT NOT NULL, v_hi INTEGER NOT NULL, v_lo INTEGER NOT NULL, row TEXT NOT NULL, PRIMARY KEY (entity, id));',
    'CREATE TABLE IF NOT EXISTS money_stale (customer_id TEXT PRIMARY KEY);',
    ...ENTITY_NAMES.map(entityTableSql),
    'CREATE TABLE IF NOT EXISTS lot_search (rowid INTEGER PRIMARY KEY, lot_id TEXT NOT NULL UNIQUE, gr_id TEXT NOT NULL, haystack TEXT NOT NULL);',
    "CREATE VIRTUAL TABLE IF NOT EXISTS lot_fts USING fts5(haystack, content='lot_search', content_rowid='rowid', tokenize='trigram');",
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

const FTS_TRIGGERS = [
  'CREATE TRIGGER IF NOT EXISTS lot_search_ai AFTER INSERT ON lot_search BEGIN INSERT INTO lot_fts(rowid, haystack) VALUES (new.rowid, new.haystack); END;',
  "CREATE TRIGGER IF NOT EXISTS lot_search_ad AFTER DELETE ON lot_search BEGIN INSERT INTO lot_fts(lot_fts, rowid, haystack) VALUES ('delete', old.rowid, old.haystack); END;",
  "CREATE TRIGGER IF NOT EXISTS lot_search_au AFTER UPDATE ON lot_search BEGIN INSERT INTO lot_fts(lot_fts, rowid, haystack) VALUES ('delete', old.rowid, old.haystack); INSERT INTO lot_fts(rowid, haystack) VALUES (new.rowid, new.haystack); END;",
].join('\n');

/** Builds the whole search table and its index from the lots held (stage switch, full reloads). */
export async function rebuildAllSearch(tx: CopyDriver): Promise<void> {
  await tx.exec('DROP TRIGGER IF EXISTS lot_search_ai; DROP TRIGGER IF EXISTS lot_search_ad; DROP TRIGGER IF EXISTS lot_search_au; DELETE FROM lot_search;');
  await tx.run(`INSERT INTO lot_search (lot_id, gr_id, haystack) ${HAYSTACK_SELECT}`);
  await tx.run("INSERT INTO lot_fts(lot_fts) VALUES ('rebuild')");
  await tx.exec(FTS_TRIGGERS);
}

/** Rebuilds the search rows of the given lots and of every lot of the given GRNs (the FTS triggers follow). */
export async function rebuildSearchFor(tx: CopyDriver, lotIds: readonly string[], grnIds: readonly string[]): Promise<void> {
  for (let i = 0; i < lotIds.length; i += 500) {
    const ids = lotIds.slice(i, i + 500);
    const marks = ids.map(() => '?').join(', ');
    await tx.run(`DELETE FROM lot_search WHERE lot_id IN (${marks})`, ids);
    await tx.run(`INSERT INTO lot_search (lot_id, gr_id, haystack) ${HAYSTACK_SELECT} WHERE t.id IN (${marks})`, ids);
  }
  for (let i = 0; i < grnIds.length; i += 500) {
    const ids = grnIds.slice(i, i + 500);
    const marks = ids.map(() => '?').join(', ');
    await tx.run(`DELETE FROM lot_search WHERE gr_id IN (${marks})`, ids);
    await tx.run(`INSERT INTO lot_search (lot_id, gr_id, haystack) ${HAYSTACK_SELECT} WHERE t.gr_id IN (${marks})`, ids);
  }
}

export const ALL_ENTITIES: readonly EntityName[] = ENTITY_NAMES;
