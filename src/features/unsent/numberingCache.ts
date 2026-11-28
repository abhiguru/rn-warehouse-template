/**
 * The facility's `numbering` setting as the phone's copy holds it (WH-161, product/tech/app-offline-new-records.md section 4):
 * `{ grn: { scheme, server_issues }, dispatch: {...}, invoice: {...} }`, kept in memory so the number box's mode can be decided
 * without a read. Read again after every sync run; kept when the copy cannot be read now, cleared when the read gives no row.
 */
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { readSetting } from '@/features/phone-copy/copyQueries';
import { subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { createLogger, loggableError } from '@/utils/logger';

const logger = createLogger('[numbering-cache]');

type Row = Record<string, { server_issues?: unknown } | undefined>;
const cache: { row: Row | null } = { row: null };

// Back to "not known yet" at every session change and server switch, so one facility's rule never decides another's (WH-391).
registerSessionScoped('numbering-cache', () => {
  cache.row = null;
}, { onGenerationChange: true });

/** Reads the numbering row from the copy. */
export async function refreshNumbering(): Promise<void> {
  try {
    const row = await readSetting('numbering');
    // A read that gives no row means "not known yet" (WH-391): the earlier row may be another facility's.
    cache.row = typeof row === 'object' && row !== null ? (row as Row) : null;
  } catch (error) {
    logger.debug('The numbering row could not be read', loggableError(error));
  }
}

/** Whether the server issues this document's numbers (`server_issues`); null when the phone does not know. */
export function serverIssues(type: 'grn' | 'dispatch'): boolean | null {
  const entry = cache.row?.[type];
  return entry === undefined ? null : entry.server_issues === true;
}

subscribeSyncRunEnd(() => void refreshNumbering());
void refreshNumbering();
