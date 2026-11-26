/**
 * Waits for the outcome of a quick change that Save has just stored (WH-302, contract section 5.2): up to
 * `QUICK_CHANGE_WAIT_MS` for this item to be sent or refused. Nothing is waited for when older unsent items are in front of
 * it, or when the phone is offline.
 */
import { refusalCodeOf } from '@/features/unsent/refusalTags';
import { loadedUnsentRows, ownUnsentRows, subscribeUnsent } from '@/features/unsent/unsentStore';
import { t } from '@/i18n';

/** How long Save waits for the server before it closes on "Saved on this phone". */
export const QUICK_CHANGE_WAIT_MS = 8_000;

export type QuickChangeOutcome = { kind: 'sent' } | { kind: 'refused'; reason: string | null } | { kind: 'later' };

/** The words of a refusal this screen already has; null when it has none for the code. */
function reasonOf(code: string | null): string | null {
  if (code === 'RACK_TOO_LONG') return t('grn.validation.rackMax');
  if (code === 'MARK_TOO_LONG') return t('grn.validation.packageMarkMax');
  return null;
}

function parseResult(text: string | null): unknown {
  try {
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

const rowOf = (id: string) => loadedUnsentRows().find(row => row.id === id);

/** True when an older item of this person is still to be sent: this one waits behind it. */
export function waitsBehindOlder(id: string): boolean {
  const mine = rowOf(id);
  if (!mine) return false;
  return ownUnsentRows().some(row => row.id !== id && row.seq < mine.seq && row.state !== 'refused');
}

export function waitForOutcome(id: string, ms: number = QUICK_CHANGE_WAIT_MS): Promise<QuickChangeOutcome> {
  return new Promise(resolve => {
    let finished = false;
    let stop: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (outcome: QuickChangeOutcome) => {
      if (finished) return;
      finished = true;
      stop?.();
      if (timer !== null) clearTimeout(timer);
      resolve(outcome);
    };
    const check = () => {
      const row = rowOf(id);
      // Not loaded yet (the store reads the file again after a save): the next change of the store asks again.
      if (!row) return;
      if (row.state === 'sent') return finish({ kind: 'sent' });
      // Older unsent items go first: this one is not waited for.
      if (row.state === 'saved' && waitsBehindOlder(id)) return finish({ kind: 'later' });
      if (row.state === 'refused') {
        return finish({ kind: 'refused', reason: reasonOf(refusalCodeOf(parseResult(row.result))) });
      }
    };
    stop = subscribeUnsent(check);
    timer = setTimeout(() => finish({ kind: 'later' }), ms);
    check();
  });
}
