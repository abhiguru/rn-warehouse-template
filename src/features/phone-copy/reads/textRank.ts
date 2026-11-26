/**
 * The en_US order of the texts the server sorts by, worked out on the phone and kept in `text_rank` so SQL can order by
 * it (WH-299, product/tech/app-offline-read-from-copy.md section 7.3). Rebuilt for a kind only when a read needs it and
 * a write has added a value since the last time.
 */
import type { CopyDriver, SqlValue } from '../copyDriver';
import { RANK_SOURCES, rankMetaKey, type RankKind } from '../copySchema';
import { enCompare } from '../pgCompat';

const ROWS_PER_STATEMENT = 200;

/** Call inside a transaction. */
export async function ensureRanks(tx: CopyDriver, kinds: readonly RankKind[]): Promise<void> {
  for (const kind of kinds) {
    const marker = rankMetaKey(kind);
    if ((await tx.all('SELECT 1 FROM meta WHERE k = ?', [marker])).length) continue;
    const { entity, key } = RANK_SOURCES[kind];
    const found = await tx.all<{ value: unknown }>(`SELECT DISTINCT json_extract(row, '$.${key}') AS value FROM ${entity}`);
    const values = found.map(r => r.value).filter((value): value is string => typeof value === 'string').sort(enCompare);
    await tx.run('DELETE FROM text_rank WHERE kind = ?', [kind]);
    for (let i = 0; i < values.length; i += ROWS_PER_STATEMENT) {
      const chunk = values.slice(i, i + ROWS_PER_STATEMENT);
      const params: SqlValue[] = [];
      chunk.forEach((value, index) => params.push(kind, value, i + index));
      await tx.run(`INSERT INTO text_rank (kind, value, rank) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}`, params);
    }
    await tx.run("INSERT OR REPLACE INTO meta (k, v) VALUES (?, '1')", [marker]);
  }
}
