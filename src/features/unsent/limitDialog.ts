/**
 * The 2-hour rule at the places new work starts (WH-301, contract section 5; Design 4.3): the + on GRN and Dispatch, Edit
 * on a GRN, and Save of a form. Reading and search are never asked, nor changes that need the server anyway (Product PQ3).
 */
import { router } from 'expo-router';
import { t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { flushFormDraft } from './useFormDraft';
import { canStartWork } from './workGate';

/** "2 h 15 min", in the language's digits (Design 4.4). */
export function formatAge(ms: number): string {
  const minutesTotal = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  if (hours === 0) return t('offline.duration.minutes', { minutes });
  if (minutes === 0) return t('offline.duration.hours', { hours });
  return t('offline.duration.hoursMinutes', { hours, minutes });
}

/**
 * True when no new record or change may start, after telling the person why: "Send your unsent items first" with the count
 * and the oldest age, and a way to the list. `formOpen` is a Save with the form on screen: the dialog adds that the form is
 * kept. The caller stops when this returns true.
 */
export function refuseAtLimit(options: { formOpen?: boolean } = {}): boolean {
  const gate = canStartWork();
  if (gate.ok) return false;
  const message = t('offline.limit.message', { count: gate.count, age: formatAge(gate.oldestAgeMs ?? 0) });
  // "Your form is kept": it is saved now, as an unfinished form, whatever the person does next.
  if (options.formOpen) void flushFormDraft();
  showAlert(t('offline.limit.title'), options.formOpen ? `${message} ${t('offline.limit.formKept')}` : message, [
    { text: t('offline.unsent.title'), onPress: () => router.push('/unsent-items') },
    { text: t('common.close'), style: 'cancel' },
  ]);
  return true;
}
