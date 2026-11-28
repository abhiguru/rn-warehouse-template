/**
 * Reports of photos the phone could not send (WH-385, product/tech/app-missing-photo-note.md section 4). When a photo of a
 * GRN sent from the unsent queue is marked missing, the server is told through `mark_grn_photo_missing`, so the saved GRN shows
 * that a photo taken with it could not be sent. The report is its own row in the unsent file (`photo_reports`), written before
 * any upload of the item starts and never swept with the item: it goes at once, and again at the end of each sync run, until the
 * server has taken it or refused it for good. The server is idempotent by GRN and client photo id, so a repeat is safe.
 *
 * A report waits (and nothing is called) offline, on a server older than `grnPhotoMissing`, and under another person's or
 * facility's session: only the rows of the current scope go.
 */
import { backendHasFeature } from '@/config/backendFeatures';
import { noteFacilityWrite } from '@/config/facilityWrite';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { PassWriteOptions } from '@/features/holding/heldPhotos';
import { isCopyOffline, subscribeSyncRunEnd } from '@/features/phone-copy/syncEngine';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { classify } from './sendEngine';
import { getUnsentDb } from './unsentDb';

const logger = createLogger('[photo-reports]');

/** The reason the phone gives for a photo whose file is gone. */
const FILE_MISSING = 'file_missing';

/** Refusals that can never succeed: the report ends. Any other failure keeps it. */
const SETTLED_CODES: ReadonlySet<string> = new Set(['GRN_NOT_FOUND', 'GRN_PHOTO_LINE_GONE', 'GRN_PHOTO_INVALID']);

interface ReportRow {
  scope: string;
  grn_id: string;
  client_photo_id: string;
  role: string;
  grn_item_id: string | null;
  reason: string;
}

/**
 * Writes one report for each photo of the item that is marked missing and not yet reported, and marks it queued, in one
 * transaction. `lineOf` gives the GRN item id of a photo's line (null for none; undefined when it cannot be told, which is
 * sent as no line: the photo still counts on the GRN).
 */
export async function queuePhotoReports(
  itemId: string,
  scope: string,
  grnId: string,
  lineOf: (lineRef: string | null) => string | null | undefined
): Promise<void> {
  const db = await getUnsentDb();
  await db.transaction(async tx => {
    const photos = await tx.all<{ client_photo_id: string; role: string; line_ref: string | null }>(
      'SELECT client_photo_id, role, line_ref FROM item_photos WHERE item_id = ? AND missing = 1 AND report_queued = 0 ORDER BY rowid',
      [itemId]
    );
    for (const photo of photos) {
      await tx.run(
        'INSERT OR IGNORE INTO photo_reports (scope, grn_id, client_photo_id, role, grn_item_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [scope, grnId, photo.client_photo_id, photo.role, lineOf(photo.line_ref) ?? null, FILE_MISSING, Date.now()]
      );
      await tx.run('UPDATE item_photos SET report_queued = 1 WHERE item_id = ? AND client_photo_id = ?', [itemId, photo.client_photo_id]);
    }
  });
}

/** What one call to the server ended in: `sent` was taken, `settled` was refused for good. Both end the report. */
type ReportEnd = 'sent' | 'settled' | 'kept' | 'stop';

async function sendOne(row: ReportRow): Promise<ReportEnd> {
  let answer: { data: unknown; error: unknown; status?: number };
  try {
    // Quiet: the sync is asked for only once the report is removed from the phone (WH-422).
    const client = await getAuthenticatedClient({ quietWrite: true });
    answer = (await client.rpc('mark_grn_photo_missing', {
      p_grn_id: row.grn_id,
      p_client_photo_id: row.client_photo_id,
      p_role: row.role,
      p_grn_item_id: row.grn_item_id,
      p_reason: row.reason,
    })) as typeof answer;
  } catch (error) {
    answer = { data: null, error };
  }
  const failure = answer.error ? withHttpStatus(answer.error, answer.status) : emptyAnswerAsError(answer);
  const outcome = classify(answer.data, failure);
  if (outcome.kind === 'sent') return 'sent';
  if (outcome.kind === 'refused') return outcome.code !== undefined && SETTLED_CODES.has(outcome.code) ? 'settled' : 'kept';
  return outcome.kind === 'stop' ? 'stop' : 'kept';
}

const run: { current: Promise<void> | null; again: boolean } = { current: null, again: false };
registerSessionScoped('photo-reports-run', () => {
  run.current = null;
  run.again = false;
});

async function sendWaiting(options?: PassWriteOptions): Promise<void> {
  if (!backendHasFeature('grnPhotoMissing') || isCopyOffline()) return;
  const scope = await getSessionCacheScope();
  if (!scope) return;
  const db = await getUnsentDb();
  const rows = await db.all<ReportRow>('SELECT scope, grn_id, client_photo_id, role, grn_item_id, reason FROM photo_reports WHERE scope = ? ORDER BY created_at', [scope]);
  for (const row of rows) {
    // Still the same person and still connected: the answer to either may have changed during an earlier call.
    if (isCopyOffline() || (await getSessionCacheScope()) !== scope) return;
    const end = await sendOne(row);
    if (end === 'stop') return;
    if (end === 'kept') continue;
    await db.run('DELETE FROM photo_reports WHERE scope = ? AND grn_id = ? AND client_photo_id = ?', [row.scope, row.grn_id, row.client_photo_id]);
    // Only a report the server took, and only once it is gone: a store that keeps failing asks for no sync, so the
    // end of that sync cannot send the same report again with no wait (WH-422).
    if (end !== 'sent') continue;
    if (options) options.onWrite?.();
    else noteFacilityWrite();
  }
}

/**
 * Sends the waiting reports of the current person and facility. One run at a time; a call during a run asks for one more pass. Always
 * resolves. A send pass gives its `options`, so a report taken in it asks for no sync of its own (WH-393); a run started without them
 * (the end of a sync run) asks for a sync for each report taken. Either asks only once the report is removed from the phone (WH-422).
 * A joining call keeps the running one's options.
 */
export function sendPhotoReports(options?: PassWriteOptions): Promise<void> {
  if (run.current) {
    run.again = true;
    return run.current;
  }
  const started = (async () => {
    try {
      do {
        run.again = false;
        await sendWaiting(options);
      } while (run.again);
    } catch (error) {
      logger.warn('Photo reports could not be sent', loggableError(error));
    } finally {
      run.current = null;
    }
  })();
  run.current = started;
  return started;
}

const listening: { stop: (() => void) | null } = { stop: null };

/** Sends the waiting reports at the end of each sync run. Idempotent; nothing listens at import. */
export function startPhotoReports(): void {
  if (listening.stop) return;
  listening.stop = subscribeSyncRunEnd(() => sendPhotoReports());
}

/** Stops listening. Idempotent. */
export function stopPhotoReports(): void {
  listening.stop?.();
  listening.stop = null;
}
