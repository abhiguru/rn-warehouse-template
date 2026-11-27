/**
 * The GRN form's Save when the GRN goes by the queue (WH-161, product/tech/app-offline-new-records.md 3, 10): the review step asks
 * `runQueuedGrnSave` first. It answers what the step then does: nothing of its own (`not-queued`, today's direct save), a result
 * shaped as `createGRN`'s so today's success and refusal handling runs unchanged, the "Saved on this phone" dialog, or one
 * sentence for a refusal that has no words on the form today.
 */
import type { createGRN } from '@/features/grn/services/grnFormService';
import type { CreateGRNPayload } from '@/features/grn/services/saveGrnArgs';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import { t } from '@/i18n';
import { getFormNumberMode } from './formNumberMode';
import { refusalCodeOf } from './newRecordAnswer';
import { offlineNewOn, saveNewGrn, savesByQueue, type SavePhoto } from './offlineNew';

type CreateResult = Awaited<ReturnType<typeof createGRN>>;

export type QueuedGrnOutcome =
  | { kind: 'not-queued' }
  | { kind: 'result'; result: CreateResult }
  | { kind: 'saved'; localId: string; number: string | undefined; afterEarlierEntries: boolean }
  | { kind: 'alert'; message: string };

/** Rates are not on the phone: offline, an administrator or supervisor, and the stored rates did not load (PQ1). */
export const ratesNotOnPhone = (canSetRates: boolean, ratesStatus: string): boolean =>
  canSetRates && ratesStatus !== 'ready' && offlineNewOn() && isCopyOffline();

/** The words of a refusal that has none on the form today (Design 10.8 DQ7). */
const NEW_REFUSALS = ['SERIES_FULL', 'NUMBER_NOT_EXPECTED', 'REQUEST_KEY_REUSED'] as const;
const newRefusalOf = (code: string | null): (typeof NEW_REFUSALS)[number] | null => NEW_REFUSALS.find(known => known === code) ?? null;

/** The form's photos as items of the queue: the header's, and each line's under `index:<n>` (the line's place in the GRN). */
export function grnPhotosOf(request: CreateGRNPayload): SavePhoto[] {
  const header = (request.header.gr_images ?? []).map(image => ({ file: image.imageUrl, role: 'header' }));
  const lines = request.items.flatMap((item, index) =>
    (item.trl_images ?? []).map(image => ({ file: image.imageUrl, role: 'item', lineRef: `index:${index}` }))
  );
  return [...header, ...lines];
}

export async function runQueuedGrnSave(
  request: CreateGRNPayload,
  context: { ratesNotOnPhone: boolean; numberTyped: boolean },
  replay: (payload: CreateGRNPayload) => ReturnType<typeof createGRN>
): Promise<QueuedGrnOutcome> {
  const numberMode = getFormNumberMode('grn');
  if (!savesByQueue({ numberMode, ratesNotOnPhone: context.ratesNotOnPhone })) return { kind: 'not-queued' };
  const typedNumber = request.header.gr_no ?? '';
  const answer = await saveNewGrn(request, {
    numberMode,
    ...(context.numberTyped || typedNumber === '' ? {} : { suggestedNumber: typedNumber }),
    photos: grnPhotosOf(request),
    ratesNotOnPhone: context.ratesNotOnPhone,
    ...(request.warnDuplicate === undefined ? {} : { warnDuplicate: request.warnDuplicate }),
  });
  switch (answer.path) {
    case 'direct':
      return { kind: 'not-queued' };
    case 'sent': {
      const { grn_id: id, gr_no: number } = answer.result as { grn_id: string; gr_no: string };
      return { kind: 'result', result: { success: true, data: { id, gr_no: number } } as unknown as CreateResult };
    }
    case 'saved':
      return { kind: 'saved', localId: answer.localId, number: typedNumber === '' ? undefined : typedNumber, afterEarlierEntries: !isCopyOffline() };
    case 'refused':
    case 'duplicate': {
      const stored = answer.path === 'refused' ? answer.answer : answer.warning;
      const words = newRefusalOf(refusalCodeOf(stored));
      if (words) return { kind: 'alert', message: t(`offline.offlineNew.refusal.${words}`, { document: t('common.grn'), number: typedNumber }) };
      // Today's refusal handling reads the server's answer as if it had just come: the number, duplicate, rate and date cases.
      return { kind: 'result', result: await replay({ ...request, header: { ...request.header, gr_no: typedNumber || '-' }, storedAnswer: stored }) };
    }
  }
}
