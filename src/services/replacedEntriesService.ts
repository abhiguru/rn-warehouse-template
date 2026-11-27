/**
 * The administrators' side of the replaced entries (WH-303; product/tech/app-offline-edit-grn.md section 5.4): marking the
 * entries a GRN's strip showed as checked. It needs the server; the strip says so while the phone is offline.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { createLogger, loggableError } from '@/utils/logger';

const logger = createLogger('[replaced-entries]');

/** Marks exactly the entries the screen showed as checked. True when the server did (repeating it is a success). */
export async function markGrnReplacementsChecked(grnId: string, ids: readonly string[]): Promise<boolean> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('mark_grn_replacements_checked', { p_grn_id: grnId, p_ids: ids });
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
