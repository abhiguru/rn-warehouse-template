/**
 * The daily comparison of the copy with the server (WH-298, contract 6.7 and 7.3): per entity, the number of rows and
 * the sum of the first 15 hex digits of their `v`, modulo 2^60, as the server computes them.
 */
import type { CopyDriver } from './copyDriver';
import { isEntityName, type EntityName } from './copySchema';
import type { ChecksumEntry } from './syncApi';

const MOD = 1n << 60n;

/** The phone's count and sum of one entity. */
export async function localChecksum(db: CopyDriver, entity: EntityName): Promise<{ count: number; sum: bigint }> {
  const [row] = await db.all<{ n: number; hi: number | null; lo: number | null }>(
    `SELECT count(*) AS n, sum(v_hi) AS hi, sum(v_lo) AS lo FROM ${entity}`
  );
  const hi = BigInt(row?.hi ?? 0);
  const lo = BigInt(row?.lo ?? 0);
  return { count: row?.n ?? 0, sum: ((hi << 32n) + lo) % MOD };
}

export interface ChecksumResult {
  /** Entities whose count or sum differ, with both counts (for the report: no row data). */
  mismatched: { entity: EntityName; phoneCount: number; serverCount: number }[];
  /** True when some entity was not settled yet and must be compared on a later full sync. */
  unsettled: boolean;
}

/** Compares the server's answer with the copy. Entities the app does not hold are left out. */
export async function compareChecksums(db: CopyDriver, server: readonly ChecksumEntry[]): Promise<ChecksumResult> {
  const result: ChecksumResult = { mismatched: [], unsettled: false };
  for (const entry of server) {
    if (!isEntityName(entry.e)) continue;
    if (!entry.settled) {
      result.unsettled = true;
      continue;
    }
    const local = await localChecksum(db, entry.e);
    if (local.count !== entry.count || local.sum !== BigInt(entry.sum) % MOD)
      result.mismatched.push({ entity: entry.e, phoneCount: local.count, serverCount: entry.count });
  }
  return result;
}
