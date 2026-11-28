/**
 * The administrators' side of the replaced entries (WH-303; product/tech/app-offline-edit-grn.md section 5.4): marking the
 * entries a GRN's strip showed as checked. It needs the server; the strip says so while the phone is offline.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { RpcGrnReplacement } from '@/types/rpc-canonical.types';
import { createLogger, loggableError } from '@/utils/logger';

const logger = createLogger('[replaced-entries]');

/** Marks exactly the entries the screen showed as checked. True when the server did (repeating it is a success). */
export async function markGrnReplacementsChecked(grnId: string, ids: readonly string[]): Promise<boolean> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = (await client.rpc('mark_grn_replacements_checked', { p_grn_id: grnId, p_ids: ids })) as { data: unknown; error: unknown };
    if (error) {
      logger.warn('Replaced entries could not be marked checked', loggableError(error));
      return false;
    }
    return (data as { success?: unknown } | null)?.success === true;
  } catch (error) {
    logger.warn('Replaced entries could not be marked checked', loggableError(error));
    return false;
  }
}

/** One row of `get_grn_replacements`: the entry, with its GRN and its checked state. */
export interface ReplacedEntryRow extends RpcGrnReplacement {
  grn_id: string;
  gr_no: string;
  customer_name: string | null;
  checked_by_name: string | null;
  checked_at: string | null;
}

export interface ReplacedEntriesPage {
  rows: ReplacedEntryRow[];
  total: number;
}

/** The entries of a period, newest first (administrators only; the screen asks the last 120 days and older on request). */
export async function getReplacedEntries(from: string, to: string, limit: number, offset: number): Promise<ReplacedEntriesPage | null> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = (await client.rpc('get_grn_replacements', { p_from: from, p_to: to, p_state: null, p_limit: limit, p_offset: offset })) as { data: unknown; error: unknown };
    const answer = data as { success?: unknown; rows?: unknown; total?: unknown } | null;
    if (error || answer?.success !== true || !Array.isArray(answer.rows)) return null;
    return { rows: answer.rows as ReplacedEntryRow[], total: typeof answer.total === 'number' ? answer.total : answer.rows.length };
  } catch (error) {
    logger.warn('The replaced entries could not be read', loggableError(error));
    return null;
  }
}
