/**
 * The question a screen asks when the server refuses a save with STALE_RECORD (wave B, D1): someone else
 * changed the record after this screen read it. Nothing was saved.
 *
 * `keep` leaves the form as it is (what was typed stays, nothing is reset) and is also the answer when the
 * dialog is closed without a choice. `reload` means the screen reads the record again from the server, forced
 * (past its "already loaded this id" skip), and replaces the form with it.
 */
import { askAlert } from '@/utils/alert';
import { t } from '@/i18n';

/** The record a refused save was for. The order line card has its own text and does not ask this question. */
export type StaleRecordKind = 'dispatch' | 'grn' | 'invoice' | 'orderLine';

export type StaleRecordChoice = 'keep' | 'reload';

/** The name of the record in the title, in the app's language. */
function recordWord(what: StaleRecordKind): string {
  switch (what) {
    case 'dispatch':
      return t('errors.refusal.stale.what.dispatch');
    case 'grn':
      return t('errors.refusal.stale.what.grn');
    case 'invoice':
      return t('errors.refusal.stale.what.invoice');
    case 'orderLine':
      return t('errors.refusal.stale.what.orderLine');
  }
}

export function askStaleRecord(what: StaleRecordKind): Promise<StaleRecordChoice> {
  return askAlert<StaleRecordChoice>(
    t('errors.refusal.stale.title', { what: recordWord(what) }),
    t('errors.refusal.stale.message'),
    [
      { text: t('errors.refusal.stale.keep'), style: 'cancel', value: 'keep' },
      // Destructive: it replaces the form with the record as it is now, so what was typed is lost (style guide 13.9).
      { text: t('errors.refusal.stale.reload'), style: 'destructive', value: 'reload' },
    ],
    'keep'
  );
}
