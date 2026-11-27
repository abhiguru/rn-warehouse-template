/**
 * The number box's mode for the GRN and dispatch form that is open (WH-161, product/tech/app-offline-new-records.md section 4,
 * Design 10.1 and 10.8): decided once when the form opens (`offlineNew.openNumberMode`) and kept here until the form is reset, so
 * a connection that comes back or an older entry that is sent meanwhile changes nothing under the person's eyes.
 */
import { useSyncExternalStore } from 'react';
import { readCopyOnly } from '@/features/phone-copy/readRoute';
import { getUnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { useCopyOffline } from '@/features/phone-copy/useCopyOffline';
import { t } from '@/i18n';
import { openNumberMode, type NumberMode } from './offlineNew';

type DocType = 'grn' | 'dispatch';

const modes: Record<DocType, NumberMode> = { grn: 'online', dispatch: 'online' };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getFormNumberMode = (type: DocType): NumberMode => modes[type];

export function setFormNumberMode(type: DocType, mode: NumberMode): void {
  if (modes[type] === mode) return;
  modes[type] = mode;
  for (const listener of [...listeners]) listener();
}

/** Decides the mode for a form that opens now, keeps it, and gives it back. */
export async function decideFormNumberMode(type: DocType): Promise<NumberMode> {
  const mode = await openNumberMode(type);
  setFormNumberMode(type, mode);
  return mode;
}

/** The mode of the open form of this kind, drawn again when it changes. */
export function useFormNumberMode(type: DocType): NumberMode {
  return useSyncExternalStore(subscribe, () => modes[type], () => modes[type]);
}

/** The helper line under the number box for the mode (Design 10.1, 10.8): null in `online` mode. */
export function useNumberModeHelp(type: DocType): string | null {
  const mode = useFormNumberMode(type);
  const offline = useCopyOffline();
  if (mode === 'typed') return t('offline.offlineNew.typedNumberHelp');
  if (mode !== 'pending') return null;
  if (type === 'grn') return t(offline ? 'offline.offlineNew.numberPendingHelpGrn' : 'offline.offlineNew.numberPendingQueuedGrn');
  return t(offline ? 'offline.offlineNew.numberPendingHelpDispatch' : 'offline.offlineNew.numberPendingQueuedDispatch');
}

/**
 * Whether a number the person typed is already used, on the phone only (Product PQ4): in the copy, or in one of this person's own
 * new documents not sent yet. Passing promises nothing: the server decides at send.
 */
export async function typedNumberUsed(type: DocType, number: string): Promise<boolean> {
  const own = getUnsentOverlay().newDocuments(type).some(doc => doc.number === number);
  if (own) return true;
  const sql = type === 'grn' ? 'SELECT id FROM goodsreceived WHERE gr_no = ? AND deleted_at IS NULL' : 'SELECT id FROM dispatch WHERE disp_no_lc = ? AND deleted_at IS NULL';
  const found = await readCopyOnly(q => q.get<{ id: string }>(sql, [type === 'grn' ? number : number.toLowerCase()]));
  return found.kind === 'answer' && found.answer.value !== null;
}
