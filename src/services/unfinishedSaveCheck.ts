/**
 * At app start, once the facility session is ready: asks the server what became of each create that was in flight when
 * the app last closed (src/services/unfinishedSaves.ts), and tells the person.
 *
 *  - found (`get_submission_result` has the stored answer): "Earlier save" / "GRN Z0010 for Hilltop Fresh Mart was
 *    saved." [OK | Open]; Open shows the saved document. The same for a dispatch.
 *  - not found: "Earlier save" / "No saved GRN Z0010 for Hilltop Fresh Mart was found. Enter it again if you still need
 *    it." [OK]. "Not found" also covers a record that was saved and deleted since, so the wording never claims the app
 *    closed or that nothing was saved.
 *  - no answer, an error, or a server too old to know the question: the entry stays for the next start, and nothing is said.
 *
 * A note is asked about only once the server has had time to finish the original request: younger than the lost-answer wait
 * plus 20 s (`ASK_AFTER_MS`), the original may still be running and "not found" would be wrong. A young note waits; one
 * timer runs the check once more when the youngest is old enough, and it is cancelled when the session changes.
 *
 * An entry is removed once the person has been told. The server is asked once per entry, with no wait and no retry
 * (a person opening the app should not be held up). An entry that was written down in this run of the app belongs to the
 * screen that is saving, which settles it itself (a screen that gives up hands it back: `releaseUnfinishedSave`), and is
 * left alone. A check that began under one session does nothing after that session ended.
 */
import { showAlert } from '@/utils/alert';
import { LOST_ANSWER_MIN_WAIT_MS, askSubmission, type SubmissionResult } from '@/utils/lostAnswer';
import { getSessionGeneration, onSessionChange } from '@/config/sessionLifecycle';
import { t, formatIdentifier } from '@/i18n';
import { createLogger } from '@/utils/logger';
import {
  forgetUnfinishedSave,
  readUnfinishedSaves,
  wasStartedThisRun,
  type UnfinishedSave,
  type UnfinishedSaveKind,
} from './unfinishedSaves';

const log = createLogger('UnfinishedSaveCheck');

/** How old a note must be before the server is asked: the server's wait before a lost answer is checked, plus 20 s. */
export const ASK_AFTER_MS = LOST_ANSWER_MIN_WAIT_MS + 20_000;

/** The id of the saved document in the answer the server stored under the code; undefined when it holds none. */
export function savedIdOf(kind: UnfinishedSaveKind, response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const body = response as { dispatch_id?: unknown; invoice_id?: unknown; data?: { grn_id?: unknown; dispatch_id?: unknown; invoice_id?: unknown } | null };
  const id =
    kind === 'grn' ? body.data?.grn_id
    : kind === 'invoice' ? (body.invoice_id ?? body.data?.invoice_id)
    : (body.dispatch_id ?? body.data?.dispatch_id);
  return typeof id === 'string' && id !== '' ? id : undefined;
}

export interface UnfinishedSaveCheckOptions {
  /** Shows the saved document ("Open"). */
  open: (kind: UnfinishedSaveKind, id: string) => void;
  /** The one question to the server; the real one by default. */
  ask?: (requestKey: string) => Promise<SubmissionResult | undefined>;
}

// The check that is running, and for which session. A second start-up signal for the same session while it runs
// (a session restored twice) must not ask, and tell, twice; a signal for another session waits for the old run to end
// (it ends at its next step: it sees the session changed) and then runs.
let running: { generation: number; promise: Promise<void> } | null = null;

// The one timer that runs the check again when the youngest note is old enough, and what cancels it on a session change.
let retry: { timer: ReturnType<typeof setTimeout>; stopWatching: () => void } | null = null;

function cancelRetry(): void {
  if (!retry) return;
  clearTimeout(retry.timer);
  retry.stopWatching();
  retry = null;
}

function scheduleRetry(options: UnfinishedSaveCheckOptions, generation: number, afterMs: number): void {
  cancelRetry();
  const timer = setTimeout(() => {
    cancelRetry();
    if (generation === getSessionGeneration()) void checkUnfinishedSaves(options);
  }, afterMs);
  // A timer must not keep a test process (or anything else) alive.
  (timer as unknown as { unref?: () => void }).unref?.();
  retry = { timer, stopWatching: onSessionChange(cancelRetry) };
}

/** Runs the check; a call while one runs for the same session returns that one. Never rejects. */
export function checkUnfinishedSaves(options: UnfinishedSaveCheckOptions): Promise<void> {
  const generation = getSessionGeneration();
  if (running && running.generation === generation) return running.promise;
  const previous = running?.promise ?? Promise.resolve();
  const promise: Promise<void> = previous
    .then(() => run(options, generation))
    .catch((error: unknown) => {
      log.warn('The check of unfinished saves failed', { name: error instanceof Error ? error.name : undefined });
    })
    .finally(() => {
      if (running?.promise === promise) running = null;
    });
  running = { generation, promise };
  return promise;
}

async function run(options: UnfinishedSaveCheckOptions, generation: number): Promise<void> {
  const { open, ask = askSubmission } = options;
  if (generation !== getSessionGeneration()) return;
  const now = Date.now();
  const entries = (await readUnfinishedSaves()).filter(entry => !wasStartedThisRun(entry.requestKey));
  // A note the server has not had time to settle is kept, and asked about when it is old enough.
  const ripe = entries.filter(entry => now - entry.startedAt >= ASK_AFTER_MS);
  const young = entries.filter(entry => now - entry.startedAt < ASK_AFTER_MS);
  if (young.length > 0) {
    const youngest = Math.max(...young.map(entry => entry.startedAt));
    scheduleRetry(options, generation, youngest + ASK_AFTER_MS - now + 500);
  }
  for (const entry of ripe) {
    // The session ended (sign-out, another facility) while the server was asked: the answer is not for this session.
    if (generation !== getSessionGeneration()) return;
    let answer: SubmissionResult | undefined;
    try {
      answer = await ask(entry.requestKey);
    } catch {
      answer = undefined;
    }
    if (generation !== getSessionGeneration()) return;
    // No answer (offline, a server error, a server that cannot say): asked again at the next start.
    if (!answer) continue;
    await forgetUnfinishedSave(entry.requestKey);
    // The session may have ended while the note was removed: the person told is the one of this session.
    if (generation !== getSessionGeneration()) return;
    tell(entry, answer, open);
  }
}

const SAVED_TEXT = {
  grn: 'errors.unfinished.grnSaved',
  dispatch: 'errors.unfinished.dispatchSaved',
  invoice: 'errors.unfinished.invoiceSaved',
} as const;
const NOT_FOUND_TEXT = {
  grn: 'errors.unfinished.grnNotFound',
  dispatch: 'errors.unfinished.dispatchNotFound',
  invoice: 'errors.unfinished.invoiceNotFound',
} as const;

function tell(entry: UnfinishedSave, answer: SubmissionResult, open: UnfinishedSaveCheckOptions['open']): void {
  const params = { number: formatIdentifier(entry.number), customer: entry.customerName };
  if (!answer.found) {
    showAlert(
      t('errors.unfinished.title'),
      t(NOT_FOUND_TEXT[entry.kind], params),
      [{ text: t('common.ok') }]
    );
    return;
  }
  const id = savedIdOf(entry.kind, answer.response);
  showAlert(
    t('errors.unfinished.title'),
    t(SAVED_TEXT[entry.kind], params),
    // OK is the secondary button and Open the main action, on the right (docs/STYLE_GUIDE.md §13.9).
    id
      ? [{ text: t('common.ok'), style: 'cancel' }, { text: t('common.open'), onPress: () => open(entry.kind, id) }]
      : [{ text: t('common.ok') }]
  );
}
