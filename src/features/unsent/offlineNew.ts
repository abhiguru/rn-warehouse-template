/**
 * New GRNs saved on the phone (WH-161, product/tech/app-offline-new-records.md 3, 4, 17.1): when the queue is
 * used, the number box's mode, and the Save path (a dispatch is saved online only, WH-381). With `offlineNewOn()` false nothing here changes any form: the screens
 * keep today's direct save, number and errors.
 *
 * Save answers `{ path: 'direct' | 'sent' | 'saved' | 'refused' | 'duplicate' }`. `refused` and `duplicate` leave no item (the
 * record and its photos item go back into the form, `returnToForm`), so the form tells the person on its last step and nothing
 * is held or counted (Product PQ2). The server's answer object is handed on unchanged.
 */
import * as Crypto from 'expo-crypto';
import { backendHasFeature } from '@/config/backendFeatures';
import { hasCapability } from '@/config/facilityCapabilities';
import { createGRN } from '@/features/grn/services/grnFormService';
import { buildSaveGrnArgs, type CreateGRNPayload } from '@/features/grn/services/saveGrnArgs';
import { copyRoute } from '@/features/phone-copy/readRoute';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import { t, formatIdentifier } from '@/i18n';
import type { NewGrnBody, SaveGrnArgs } from './newGrnKind';
import { refusalCodeOf } from './newRecordAnswer';
import { refreshNumbering, serverIssues } from './numberingCache';
import { sendNow } from './sendEngine';
import { getSendKind } from './sendKinds';
import { enqueueAll, returnToForm, type EnqueueAllInput } from './unsentQueue';
import { closeSaveWait, openSaveWait, SAVE_WAIT_MS, SAVE_WAIT_SAFETY_MS } from './saveWait';
import { itemById, onUnsentChange, type ItemRow } from './unsentRows';
import { ownUnsentRows } from './unsentStore';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

export { SAVE_WAIT_MS };

export type NumberMode = 'online' | 'pending' | 'typed';
type DocType = 'grn';

export interface SavePhoto {
  file: string;
  role: string;
  lineRef?: string;
}

export interface NewRecordForm {
  numberMode: NumberMode;
  /** The number the form was given online; one the person did not change is issued at send instead. */
  suggestedNumber?: string;
  photos?: SavePhoto[];
  /** The Review step shows the rates footnote (PQ1): the GRN goes by the queue and carries no `p_rates`. */
  ratesNotOnPhone?: boolean;
  /** False after the person confirmed the possible-duplicate question. */
  warnDuplicate?: boolean;
}

export type SaveAnswer =
  | { path: 'direct'; result: unknown }
  | { path: 'sent'; result: Record<string, unknown> }
  /** `localId`: the document's id on this phone, for View (its details open by it). */
  | { path: 'saved'; itemId: string; localId: string }
  | { path: 'refused'; answer: unknown }
  | { path: 'duplicate'; warning: unknown };

/** True when the queue may be used for a new record: the capability, the backend's topics and a usable copy (3). */
export function offlineNewOn(): boolean {
  return hasCapability('sync') && backendHasFeature('offlineNewRecords') && copyRoute('stage1') === 'copy';
}

/** True while this person has a record-lane item (a new record, a quick change, a GRN edit) waiting to be sent. */
export function hasOwnUnsentRecord(): boolean {
  return ownUnsentRows().some(row => (row.state === 'saved' || row.state === 'sending') && getSendKind(row.kind)?.lane === 'record');
}

/** The number box's mode, decided once when a form opens (4). `online` is today's fetch and box. */
export function numberMode(type: DocType): NumberMode {
  if (!offlineNewOn()) return 'online';
  if (!isCopyOffline() && !hasOwnUnsentRecord()) return 'online';
  const issues = serverIssues(type);
  if (issues === null) return 'online';
  return issues ? 'pending' : 'typed';
}

/** `numberMode`, after the numbering row is read from the copy (the form asks this when it opens). */
export async function openNumberMode(type: DocType): Promise<NumberMode> {
  await refreshNumbering();
  return numberMode(type);
}

/** True when this Save goes by the queue and not by today's direct save (3). */
export function savesByQueue(form: Pick<NewRecordForm, 'numberMode' | 'ratesNotOnPhone'>): boolean {
  if (!offlineNewOn()) return false;
  return isCopyOffline() || hasOwnUnsentRecord() || form.numberMode === 'pending' || form.ratesNotOnPhone === true;
}

/** The number and the issue flag a queued body carries (4 and 17.1). */
function numberFor(type: DocType, typed: string, form: NewRecordForm): { number: string; issue: boolean } {
  if (form.numberMode === 'pending') return { number: '', issue: true };
  if (form.numberMode === 'online' && form.suggestedNumber !== undefined && typed === form.suggestedNumber && serverIssues(type) === true) {
    return { number: '', issue: true };
  }
  return { number: typed, issue: false };
}

/** Waits for the item to be sent or refused; `cancel` ends the wait early. Null when it ended with no outcome. */
function waitForItem(itemId: string, ms: number): { outcome: Promise<ItemRow | null>; cancel: () => void } {
  let cancel = (): void => undefined;
  // Stays open after the outcome, until the form has handled it (saveAndWait closes it) or the safety time ends.
  openSaveWait(itemId, ms + SAVE_WAIT_SAFETY_MS);
  const outcome = new Promise<ItemRow | null>(resolve => {
    let done = false;
    let unsubscribe = (): void => undefined;
    const timer = setTimeout(() => finish(null), ms);
    function finish(row: ItemRow | null): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(row);
    }
    cancel = () => finish(null);
    const check = async (): Promise<void> => {
      const row = await itemById(itemId);
      if (row?.state === 'sent' || row?.state === 'refused') finish(row);
    };
    unsubscribe = onUnsentChange(check);
    void check();
  });
  return { outcome, cancel };
}

const parse = (text: string | null): Record<string, unknown> => {
  if (text === null) return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** What the form is told once its own item has an outcome. */
async function outcomeOf(row: ItemRow): Promise<SaveAnswer> {
  if (row.state === 'sent') return { path: 'sent', result: parse(row.result) };
  const stored = parse(row.result);
  const answer = 'answer' in stored ? stored.answer : { success: false, reason: stored.code, error: row.last_error, message: row.last_error };
  await returnToForm(row.id);
  return refusalCodeOf(answer) === 'POSSIBLE_DUPLICATE' ? { path: 'duplicate', warning: answer } : { path: 'refused', answer };
}

/** Saves the inputs, then (the phone being reachable) waits for the record's outcome; offline it is saved at once. */
async function saveAndWait(inputs: EnqueueAllInput[], formKind: DocType, localId: string): Promise<SaveAnswer> {
  const wasOffline = isCopyOffline();
  const [record] = await enqueueAll(inputs, { kind: formKind });
  if (!record) throw new Error('Nothing was saved');
  if (wasOffline) return { path: 'saved', itemId: record.id, localId };
  // The answer within 8 s, or the end of the send pass without one (lost, not sent yet, behind an older item): saved on the phone.
  const wait = waitForItem(record.id, SAVE_WAIT_MS);
  const passEnded = sendNow('saved').then(async () => {
    const latest = await itemById(record.id);
    return latest?.state === 'sent' || latest?.state === 'refused' ? latest : null;
  });
  try {
    const row = await Promise.race([wait.outcome, passEnded]);
    wait.cancel();
    return row ? await outcomeOf(row) : { path: 'saved', itemId: record.id, localId };
  } finally {
    closeSaveWait(record.id);
  }
}

const photoInput = (doc: DocType, photos: SavePhoto[] | undefined, what: string, customer: string): EnqueueAllInput[] =>
  photos && photos.length > 0 ? [{ kind: 'photos', body: { doc }, what, customer, dependsOn: 0, photos }] : [];

const running = new Map<DocType, Promise<SaveAnswer>>();
registerSessionScoped('offline-new-saves-running', () => running.clear());
/** One Save at a time per form kind: a second tap while one runs gets the same answer and makes no second item (P4). */
function once(type: DocType, work: () => Promise<SaveAnswer>): Promise<SaveAnswer> {
  const busy = running.get(type);
  if (busy) return busy;
  const started = work().finally(() => running.delete(type));
  running.set(type, started);
  return started;
}

/** Save of a new GRN: today's direct save, or an item in the queue (3). */
export function saveNewGrn(payload: CreateGRNPayload, form: NewRecordForm): Promise<SaveAnswer> {
  return once('grn', async () => {
    await refreshNumbering();
    const withWarning = { ...payload, ...(form.warnDuplicate === undefined ? {} : { warnDuplicate: form.warnDuplicate }) };
    if (!savesByQueue(form)) return { path: 'direct', result: await createGRN(withWarning) };
    const { number, issue } = numberFor('grn', payload.header.gr_no ?? '', form);
    // No rates are sent when the footnote shows: the server checks them at send (P9).
    const args: SaveGrnArgs = { ...buildSaveGrnArgs(form.ratesNotOnPhone ? { ...withWarning, rates: undefined } : withWarning, number), p_issue_number: issue, p_recorded_at: new Date().toISOString() };
    const localId = Crypto.randomUUID();
    const lotLocalIds = args.p_items.map(() => Crypto.randomUUID());
    const body: NewGrnBody = {
      v: 1,
      localId,
      lotLocalIds,
      args,
      show: { customerName: payload.header.customer_name, lines: payload.items.map(item => ({ itemName: item.item_name, packaging: item.packaging || null })) },
    };
    const customer = payload.header.customer_name;
    const count = form.photos?.length ?? 0;
    return saveAndWait(
      [
        {
          kind: 'newGrn',
          body,
          what: number ? t('offline.unsent.whatNewGrnNumber', { number: formatIdentifier(number) }) : t('offline.unsent.whatNewGrn'),
          customer,
          targetRef: { grnId: localId, lotIds: lotLocalIds, ...(number ? { number } : {}) },
        },
        ...photoInput('grn', form.photos, t('offline.unsent.whatPhotosNewGrn', { count }), customer),
      ],
      'grn',
      localId
    );
  });
}
