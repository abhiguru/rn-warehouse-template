/**
 * The dispatch form's Save when the dispatch goes by the queue (WH-161, product/tech/app-offline-new-records.md 3, 10): the
 * form's `submitForm` asks `runQueuedDispatchSave` first, as the GRN review step asks `runQueuedGrnSave`. It answers what the form
 * then does: nothing of its own (`not-queued`, today's direct save), a result shaped as `createDispatch`'s so today's success and
 * refusal handling runs unchanged, the "Saved on this phone" dialog, or one sentence for a refusal with no words on the form.
 */
import type { createDispatch } from '@/features/dispatch/services/dispatchFormService';
import type { CreateDispatchFormPayload } from '@/features/dispatch/services/saveDispatchArgs';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import { t, formatIdentifier } from '@/i18n';
import { parseOrderEffects } from '@/services/orderEffects';
import { getFormNumberMode } from './formNumberMode';
import { refusalCodeOf } from './newRecordAnswer';
import { saveNewDispatch, savesByQueue, type SavePhoto } from './offlineNew';

type CreateResult = Awaited<ReturnType<typeof createDispatch>>;

export type QueuedDispatchOutcome =
  | { kind: 'not-queued' }
  | { kind: 'result'; result: CreateResult }
  | { kind: 'saved'; localId: string; number: string | undefined; afterEarlierEntries: boolean }
  | { kind: 'alert'; message: string };

/** The words of a refusal that has none on the form today (Design 10.8 DQ7). */
const NEW_REFUSALS = ['SERIES_FULL', 'NUMBER_NOT_EXPECTED', 'REQUEST_KEY_REUSED'] as const;
const newRefusalOf = (code: string | null): (typeof NEW_REFUSALS)[number] | null => NEW_REFUSALS.find(known => known === code) ?? null;

const photosOf = (payload: CreateDispatchFormPayload): SavePhoto[] =>
  (payload.images ?? []).map(image => ({ file: image.image_url, role: 'dispatch' }));

export async function runQueuedDispatchSave(
  payload: CreateDispatchFormPayload,
  context: { numberTyped: boolean },
  replay: (payload: CreateDispatchFormPayload) => ReturnType<typeof createDispatch>
): Promise<QueuedDispatchOutcome> {
  const numberMode = getFormNumberMode('dispatch');
  // A dispatch made from an order always needs the server (spec step 19).
  if (payload.header.source_order_id || !savesByQueue({ numberMode })) return { kind: 'not-queued' };
  const typedNumber = payload.header.disp_no;
  const answer = await saveNewDispatch(payload, {
    numberMode,
    ...(context.numberTyped || typedNumber === '' ? {} : { suggestedNumber: typedNumber }),
    photos: photosOf(payload),
    ...(payload.warnDuplicate === undefined ? {} : { warnDuplicate: payload.warnDuplicate }),
  });
  switch (answer.path) {
    case 'direct':
      return { kind: 'not-queued' };
    case 'sent': {
      const sent = answer.result as { dispatch_id: string; order_effects?: unknown };
      return {
        kind: 'result',
        result: {
          success: true,
          dispatch_id: sent.dispatch_id,
          failed_photos: [],
          ...(Array.isArray(sent.order_effects) ? { order_effects: parseOrderEffects(sent.order_effects) } : {}),
        } as unknown as CreateResult,
      };
    }
    case 'saved':
      return { kind: 'saved', localId: answer.localId, number: typedNumber === '' ? undefined : typedNumber, afterEarlierEntries: !isCopyOffline() };
    case 'refused':
    case 'duplicate': {
      const stored = answer.path === 'refused' ? answer.answer : answer.warning;
      const words = newRefusalOf(refusalCodeOf(stored));
      if (words) return { kind: 'alert', message: t(`offline.offlineNew.refusal.${words}`, { document: t('common.dispatch'), number: formatIdentifier(typedNumber) }) };
      // Today's refusal handling reads the server's answer as if it had just come: number taken, stock, duplicate, dates.
      return { kind: 'result', result: await replay({ ...payload, header: { ...payload.header, disp_no: typedNumber || '-' }, storedAnswer: stored }) };
    }
  }
}
