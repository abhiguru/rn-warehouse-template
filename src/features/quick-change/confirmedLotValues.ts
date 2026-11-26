/**
 * What the server is expected to hold for a lot's rack and mark, with no unsent work applied (WH-302, contract section 3:
 * `copy` is never the overlay's). From the phone copy's row; on a page read from the server, from what the server answered.
 */
import { readVia } from '@/features/phone-copy/readRoute';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import type { LotValues } from './lotChangeService';

const fromServer = new Map<string, LotValues>();
registerSessionScoped('quick-change-server-lot-values', () => fromServer.clear());

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The server's values of a lot, kept when a details page is read from the server (before the overlay is applied). */
export function rememberServerLotValues(lotId: string, values: { rack?: unknown; package_mark?: unknown }): void {
  fromServer.set(lotId, { rack: textOrNull(values.rack), package_mark: textOrNull(values.package_mark) });
}

/** The confirmed values of a lot, or `fallback` when neither the copy nor a server read has them. */
export async function confirmedLotValues(lotId: string, fallback: LotValues): Promise<LotValues> {
  try {
    const copy = await readVia('all', async q => {
      const found = await q.get<{ row: string }>('SELECT row FROM goodsreceived_trl WHERE id = ?', [lotId]);
      if (!found) return null;
      const row = JSON.parse(found.row) as { rack?: unknown; package_mark?: unknown };
      return { rack: textOrNull(row.rack), package_mark: textOrNull(row.package_mark) } satisfies LotValues;
    });
    if (copy && 'value' in copy && copy.value) return copy.value;
  } catch {
    // The copy could not answer: the server's values, if a page read them.
  }
  return fromServer.get(lotId) ?? fallback;
}
