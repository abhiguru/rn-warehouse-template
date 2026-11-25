/**
 * Writing the server's rows into the copy (WH-298, contract 6.2 to 6.4). Every function here runs inside one local
 * transaction that its caller opened, so a page is stored whole or not at all.
 */
import type { CopyDriver, SqlValue } from './copyDriver';
import { extractValues, extractedColumns, rebuildAllSearch, rebuildSearchFor, vParts, type EntityName } from './copySchema';
import type { Change, FeedRow } from './syncApi';

/** Rows per INSERT statement. */
const ROWS_PER_STATEMENT = 100;

/** Inserts or replaces rows (the same id twice ends with the last one). */
export async function writeRows(tx: CopyDriver, entity: EntityName, rows: readonly FeedRow[]): Promise<void> {
  const columns = ['id', 'v', 'v_hi', 'v_lo', 'row', ...extractedColumns(entity)];
  const marks = `(${columns.map(() => '?').join(', ')})`;
  const update = columns.slice(1).map(name => `${name} = excluded.${name}`).join(', ');
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
    const params: SqlValue[] = [];
    for (const r of chunk) params.push(r.id, r.v, ...vParts(r.v), JSON.stringify(r.row), ...extractValues(entity, r.row));
    await tx.run(
      `INSERT INTO ${entity} (${columns.join(', ')}) VALUES ${chunk.map(() => marks).join(', ')} ON CONFLICT(id) DO UPDATE SET ${update}`,
      params
    );
  }
}

/** Removes a row with what hangs under it on the phone (server contract, "Delete cascade on the phone"). */
export async function deleteWithCascade(tx: CopyDriver, entity: EntityName, id: string): Promise<void> {
  if (entity === 'goodsreceived') {
    await tx.run('DELETE FROM lot_search WHERE gr_id = ?', [id]);
    await tx.run('DELETE FROM goodsreceived_trl WHERE gr_id = ?', [id]);
    await tx.run('DELETE FROM grn_images WHERE grn_id = ?', [id]);
    await tx.run('DELETE FROM grn_lock WHERE id = ?', [id]);
  } else if (entity === 'goodsreceived_trl') {
    await tx.run('DELETE FROM lot_search WHERE lot_id = ?', [id]);
  } else if (entity === 'dispatch') {
    await tx.run('DELETE FROM dispatch_trl WHERE disp_id = ?', [id]);
    await tx.run('DELETE FROM dispatch_images WHERE dispatch_id = ?', [id]);
  } else if (entity === 'invoice') {
    await tx.run('DELETE FROM invoice_trl WHERE invoice_id = ?', [id]);
  }
  await tx.run(`DELETE FROM ${entity} WHERE id = ?`, [id]);
}

/** Applies one page of changes in array order; then the search rows of the lots and GRNs it wrote. */
export async function applyChanges(tx: CopyDriver, changes: readonly Change[], searchBuilt: boolean): Promise<void> {
  const lots = new Set<string>();
  const grns = new Set<string>();
  // Consecutive upserts of one entity go in one statement; anything else ends the run first, so the order holds.
  const batch: { entity: EntityName | null; rows: FeedRow[] } = { entity: null, rows: [] };
  const flush = async () => {
    if (batch.entity && batch.rows.length) await writeRows(tx, batch.entity, batch.rows);
    batch.entity = null;
    batch.rows = [];
  };
  for (const entry of changes) {
    if (entry.op === 'upsert') {
      if (batch.entity !== entry.e) {
        await flush();
        batch.entity = entry.e;
      }
      batch.rows.push({ id: entry.id, v: entry.v, row: entry.row });
      if (entry.e === 'goodsreceived_trl') lots.add(entry.id);
      if (entry.e === 'goodsreceived') grns.add(entry.id);
      continue;
    }
    await flush();
    if (entry.op === 'stale') await tx.run('INSERT OR IGNORE INTO money_stale (customer_id) VALUES (?)', [entry.id]);
    else await deleteWithCascade(tx, entry.e, entry.id);
  }
  await flush();
  if (searchBuilt && (lots.size || grns.size)) await rebuildSearchFor(tx, [...lots], [...grns]);
}

/** Keeps a page of a reload aside; the copy's own rows stay as they are until the reload ends. */
export async function stageRows(tx: CopyDriver, entity: EntityName, rows: readonly FeedRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
    const params: SqlValue[] = [];
    for (const r of chunk) params.push(entity, r.id, r.v, ...vParts(r.v), JSON.stringify(r.row));
    await tx.run(
      `INSERT OR REPLACE INTO stage_rows (entity, id, v, v_hi, v_lo, row) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      params
    );
  }
}

/**
 * Ends a reload: for each entity, rows the reload did not bring are removed (with their cascade), the rest replaced
 * by what it brought; then the search rows. `whole` is a reload of every entity (the old copy kept meanwhile).
 */
export async function finishReload(tx: CopyDriver, entities: readonly EntityName[], whole: boolean): Promise<void> {
  for (const entity of entities) {
    if (whole) {
      await tx.run(`DELETE FROM ${entity}`);
    } else {
      const gone = await tx.all<{ id: string }>(
        `SELECT id FROM ${entity} WHERE id NOT IN (SELECT id FROM stage_rows WHERE entity = ?)`,
        [entity]
      );
      for (const { id } of gone) await deleteWithCascade(tx, entity, id);
    }
    for (let offset = 0; ; offset += 2000) {
      const kept = await tx.all<{ id: string; v: string; row: string }>(
        'SELECT id, v, row FROM stage_rows WHERE entity = ? ORDER BY id LIMIT 2000 OFFSET ?',
        [entity, offset]
      );
      if (!kept.length) break;
      await writeRows(tx, entity, kept.map(r => ({ id: r.id, v: r.v, row: JSON.parse(r.row) as Record<string, unknown> })));
    }
  }
  if (whole) await tx.run('DELETE FROM money_stale');
  if (entities.includes('invoice') || whole) await tx.run('INSERT OR IGNORE INTO money_stale (customer_id) SELECT id FROM customers');
  if (whole || entities.includes('goodsreceived') || entities.includes('goodsreceived_trl')) await rebuildAllSearch(tx);
  await tx.run('DELETE FROM stage_rows');
}
