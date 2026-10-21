/**
 * At app start, once the facility session is ready: asks the server what became of each create that was in flight when
 * the app last closed (src/services/unfinishedSaves.ts), and tells the person.
 *
 *  - found (`get_submission_result` has the stored answer): "Saved before the app closed" / "GRN Z0010 for Hilltop Fresh
 *    Mart was saved." [Open | OK]; Open shows the saved document. The same for a dispatch.
 *  - not found: "Not saved" / "GRN Z0010 for Hilltop Fresh Mart was not saved before the app closed. Enter it again if
 *    you still need it." [OK].
 *  - no answer, an error, or a server too old to know the question: the entry stays for the next start, and nothing is said.
 *
 * An entry is removed once the person has been told. The server is asked once per entry, with no wait and no retry
 * (a person opening the app should not be held up). An entry that was written down in this run of the app belongs to the
 * screen that is saving, which settles it itself, and is left alone. A check that began under one session does nothing
 * after that session ended.
 */
import { showAlert } from '@/utils/alert';
import { askSubmission, type SubmissionResult } from '@/utils/lostAnswer';
import { getSessionGeneration } from '@/config/sessionLifecycle';
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

/** The id of the saved document in the answer the server stored under the code; undefined when it holds none. */
export function savedIdOf(kind: UnfinishedSaveKind, response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const body = response as { dispatch_id?: unknown; data?: { grn_id?: unknown; dispatch_id?: unknown } | null };
  const id = kind === 'grn' ? body.data?.grn_id : (body.dispatch_id ?? body.data?.dispatch_id);
  return typeof id === 'string' && id !== '' ? id : undefined;
}

export interface UnfinishedSaveCheckOptions {
  /** Shows the saved document ("Open"). */
  open: (kind: UnfinishedSaveKind, id: string) => void;
  /** The one question to the server; the real one by default. */
  ask?: (requestKey: string) => Promise<SubmissionResult | undefined>;
}

// A second start-up signal while a check runs (a session restored twice) must not ask, and tell, twice.
let running: Promise<void> | null = null;

/** Runs the check; a call while one is running returns that one. Never rejects. */
export function checkUnfinishedSaves(options: UnfinishedSaveCheckOptions): Promise<void> {
  if (!running) {
    running = run(options)
      .catch((error: unknown) => {
        log.warn('The check of unfinished saves failed', { name: error instanceof Error ? error.name : undefined });
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}

async function run({ open, ask = askSubmission }: UnfinishedSaveCheckOptions): Promise<void> {
  const generation = getSessionGeneration();
  const entries = (await readUnfinishedSaves()).filter(entry => !wasStartedThisRun(entry.requestKey));
  for (const entry of entries) {
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
    tell(entry, answer, open);
  }
}

function tell(entry: UnfinishedSave, answer: SubmissionResult, open: UnfinishedSaveCheckOptions['open']): void {
  const params = { number: formatIdentifier(entry.number), customer: entry.customerName };
  if (!answer.found) {
    showAlert(
      t('errors.unfinished.notSavedTitle'),
      t(entry.kind === 'grn' ? 'errors.unfinished.grnNotSaved' : 'errors.unfinished.dispatchNotSaved', params),
      [{ text: t('common.ok') }]
    );
    return;
  }
  const id = savedIdOf(entry.kind, answer.response);
  showAlert(
    t('errors.unfinished.savedTitle'),
    t(entry.kind === 'grn' ? 'errors.unfinished.grnSaved' : 'errors.unfinished.dispatchSaved', params),
    id
      ? [{ text: t('common.open'), onPress: () => open(entry.kind, id) }, { text: t('common.ok') }]
      : [{ text: t('common.ok') }]
  );
}
