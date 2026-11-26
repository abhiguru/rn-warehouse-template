/**
 * The supervisors a GRN can be given to (`get_supervisors`): read from the phone copy when it holds them (WH-299), else
 * from the server. The answer is the function's own, as the picker reads it (`toSupervisors`).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { readVia } from '@/features/phone-copy/readRoute';
import { readSupervisors } from '@/features/phone-copy/reads/pickers';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('grn');

/** The people matching `searchQuery`; nobody when the server could not be asked. */
export async function getSupervisors(searchQuery: string): Promise<unknown> {
  const copy = await readVia('stage1', q => readSupervisors(q, searchQuery));
  if (copy) return copy.value;
  const client = await getAuthenticatedClient();
  const answer: { data: unknown; error: unknown } = await client.rpc('get_supervisors', { search_query: searchQuery });
  const { data, error } = answer;

  if (error) {
    log.error('RPC error', loggableError(error));
    return [];
  }
  return data;
}
