/**
 * The number box's mode for the GRN form that is open (WH-161, product/tech/app-offline-new-records.md section 4,
 * Design 10.1 and 10.8): decided once when the form opens (`offlineNew.openNumberMode`) and kept here until the form is reset, so
 * a connection that comes back or an older entry that is sent meanwhile changes nothing under the person's eyes.
 */
import { useSyncExternalStore } from 'react';
import { readCopyOnly } from '@/features/phone-copy/readRoute';
import { getUnsentOverlay } from '@/features/phone-copy/unsentOverlay';
import { useCopyOffline } from '@/features/phone-copy/useCopyOffline';
import { t } from '@/i18n';
import { openNumberMode, type NumberMode } from './offlineNew';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

type DocType = 'grn';

const modes: Record<DocType, NumberMode> = { grn: 'online' };
const generation: Record<DocType, number> = { grn: 0 };
// True when an unfinished form restored its saved mode (N5): a fresh open's decision does not overwrite it.
const restoredForOpen: Record<DocType, boolean> = { grn: false };
const listeners = new Set<() => void>();
registerSessionScoped('form-number-mode', () => {
  modes.grn = 'online';
  restoredForOpen.grn = false;
  for (const listener of [...listeners]) listener();
});
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isNumberMode = (value: unknown): value is NumberMode =>
  value === 'online' || value === 'pending' || value === 'typed';

export const getFormNumberMode = (type: DocType): NumberMode => modes[type];

function applyMode(type: DocType, mode: NumberMode): void {
  generation[type] += 1;
  if (modes[type] === mode) return;
  modes[type] = mode;
  for (const listener of [...listeners]) listener();
}

export function setFormNumberMode(type: DocType, mode: NumberMode): void {
  restoredForOpen[type] = false;
  applyMode(type, mode);
}

/** Restores the number mode saved with an unfinished form (WH-161, N5). */
export function restoreFormNumberMode(type: DocType, mode: NumberMode): void {
  restoredForOpen[type] = true;
  applyMode(type, mode);
}

/** Clears the restored-draft pin when the form closes or starts new. */
export function clearRestoredFormNumberMode(type: DocType): void {
  restoredForOpen[type] = false;
}

/** Decides the mode for a form that opens now, keeps it, and gives it back. */
export async function decideFormNumberMode(type: DocType): Promise<NumberMode> {
  if (restoredForOpen[type]) return modes[type];
  const gen = generation[type];
  const mode = await openNumberMode(type);
  if (restoredForOpen[type] || generation[type] !== gen) return modes[type];
  applyMode(type, mode);
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
  return t(offline ? 'offline.offlineNew.numberPendingHelpGrn' : 'offline.offlineNew.numberPendingQueuedGrn');
}

/**
 * Whether a number the person typed is already used, on the phone only (Product PQ4): in the copy, or in one of this person's own
 * new documents not sent yet. Passing promises nothing: the server decides at send.
 */
export async function typedNumberUsed(type: DocType, number: string): Promise<boolean> {
  const own = getUnsentOverlay().newDocuments(type).some(doc => doc.number === number);
  if (own) return true;
  const found = await readCopyOnly(q => q.get<{ id: string }>('SELECT id FROM goodsreceived WHERE gr_no = ? AND deleted_at IS NULL', [number]));
  return found.kind === 'answer' && found.answer.value !== null;
}
