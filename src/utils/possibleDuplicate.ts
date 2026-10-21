/**
 * The server's warning that a GRN or a direct dispatch looks like one made a moment ago (backend migration 124).
 *
 * The answer is a refusal, `{ success: false, error_code: 'WH409', reason: 'POSSIBLE_DUPLICATE', ... }`, with the
 * earlier record's facts at the top level: `kind` ('grn' | 'dispatch'), `existing_id`, `existing_number`,
 * `existing_created_at`, `existing_created_by` (a person's name, or null), `customer_name`, `items` (a GRN:
 * `[{ item_name, packaging }]`, a dispatch: `[{ gr_no, item_name, packaging }]`), `vehicle` (dispatch only) and
 * `window_minutes`. The check is opt-in: the app asks for it on a normal save (GRN `p_warn_duplicate: true`, dispatch
 * `p_dispatch_data.warn_duplicate = true`), so fas-sync and older app builds never meet it. It is a WARNING, never a
 * block: the person can always "Save anyway", which sends the save again with the flag false.
 *
 * The app words the question itself from these facts, in the app's language (the server's English sentence is
 * never shown).
 */
import { askAlert, whenAlertsClosed } from '@/utils/alert';
import { t, formatIdentifier } from '@/i18n';
import { REFUSAL, refusalOf, refusalString, refusalNumber, type ServerRefusal } from '@/utils/serverRefusal';

export type DuplicateKind = 'grn' | 'dispatch';

/** One line of the earlier record: a GRN names the item and its packing, a dispatch also the GRN the lot came from. */
export interface DuplicateItem {
  grNo?: string;
  itemName: string;
  packaging?: string;
}

export interface PossibleDuplicate {
  kind: DuplicateKind;
  existingId?: string;
  existingNumber: string;
  /** When the earlier record was created (ISO). */
  createdAt?: string;
  /** Who created it; absent when the server did not say. */
  createdBy?: string;
  customerName: string;
  items: DuplicateItem[];
  /** A dispatch: the registration as stored on the earlier dispatch. */
  vehicle?: string;
  windowMinutes: number;
}

/** The window the server looks back over, when it does not say (owner decision, 2026-10-21). */
const DEFAULT_WINDOW_MINUTES = 30;
/** More lines than this end the list with "+N more". */
const MAX_NAMED_ITEMS = 4;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

function itemsOf(value: unknown): DuplicateItem[] {
  if (!Array.isArray(value)) return [];
  const items: DuplicateItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const itemName = text(entry.item_name);
    if (!itemName) continue;
    items.push({ itemName, grNo: text(entry.gr_no), packaging: text(entry.packaging) });
  }
  return items;
}

/**
 * The possible duplicate an answer carries, or undefined when the answer is no such warning. `fallbackKind` is what the
 * caller is saving, used when the server does not name the kind.
 */
export function possibleDuplicateOf(answer: unknown, fallbackKind: DuplicateKind): PossibleDuplicate | undefined {
  // A service result (the dispatch form's) holds the refusal already sorted into reason and fields, next to its own
  // `reason`: that sorted refusal is the one to read, or the facts would be taken for the result's own keys.
  const carried = isRecord(answer) && isRecord(answer.refusal) ? answer.refusal : undefined;
  const refusal = carried && typeof carried.reason === 'string' && isRecord(carried.fields) ? (carried as unknown as ServerRefusal) : refusalOf(answer);
  if (!refusal || refusal.reason !== REFUSAL.POSSIBLE_DUPLICATE) return undefined;
  const kindField = refusalString(refusal, 'kind');
  const kind: DuplicateKind = kindField === 'grn' || kindField === 'dispatch' ? kindField : fallbackKind;
  return {
    kind,
    existingId: refusalString(refusal, 'existing_id'),
    existingNumber: refusalString(refusal, 'existing_number') ?? '',
    createdAt: refusalString(refusal, 'existing_created_at'),
    createdBy: refusalString(refusal, 'existing_created_by'),
    customerName: refusalString(refusal, 'customer_name') ?? '',
    items: itemsOf(refusal.fields.items),
    vehicle: refusalString(refusal, 'vehicle'),
    windowMinutes: refusalNumber(refusal, 'window_minutes') ?? DEFAULT_WINDOW_MINUTES,
  };
}

/**
 * "just now" under one minute, else "1 minute ago" / "N minutes ago", never more than the window the server looked back
 * over (a phone clock that runs ahead would otherwise say "75 minutes ago" of a record inside a 30 minute window). A time the
 * server did not give, or one ahead of this phone's clock (a negative age), reads "just now": the record is inside the window
 * either way.
 */
export function agoText(createdAt: string | undefined, now: number = Date.now(), windowMinutes: number = DEFAULT_WINDOW_MINUTES): string {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  const minutes = Number.isFinite(created) ? Math.floor((now - created) / 60_000) : 0;
  if (minutes < 1) return t('errors.refusal.duplicate.justNow');
  return t('errors.refusal.duplicate.ago', { count: Math.min(minutes, Math.max(1, windowMinutes)) });
}

function itemLabel(item: DuplicateItem): string {
  return [item.grNo ? formatIdentifier(item.grNo) : undefined, item.itemName, item.packaging].filter(Boolean).join(' · ');
}

/** The lines named in the question: the first few, then "+N more". Typed names stay as typed. */
export function itemsText(items: DuplicateItem[]): string {
  const named = items.slice(0, MAX_NAMED_ITEMS).map(itemLabel);
  const rest = items.length - named.length;
  if (rest > 0) named.push(t('errors.refusal.duplicate.moreItems', { count: rest }));
  return named.join(', ');
}

/** The question's sentence, in the app's language. */
export function duplicateMessage(duplicate: PossibleDuplicate, now: number = Date.now()): string {
  const params = {
    number: formatIdentifier(duplicate.existingNumber),
    customer: duplicate.customerName,
    ago: agoText(duplicate.createdAt, now, duplicate.windowMinutes),
    person: duplicate.createdBy ?? '',
    items: itemsText(duplicate.items),
    vehicle: duplicate.vehicle ?? '',
  };
  if (duplicate.kind === 'grn') {
    return t(duplicate.createdBy ? 'errors.refusal.duplicate.grn' : 'errors.refusal.duplicate.grnNoPerson', params);
  }
  return t(duplicate.createdBy ? 'errors.refusal.duplicate.dispatch' : 'errors.refusal.duplicate.dispatchNoPerson', params);
}

export type DuplicateChoice = 'cancel' | 'save';

/**
 * The question "Possible duplicate" with [Cancel | Save anyway]. Cancel (and closing the dialog) leaves the form as it
 * was; Save anyway is the person's answer to send the same save again with the override. "Save anyway" is answered only
 * once the question's dialog has finished closing (iOS cannot present the success dialog over a Modal that is still
 * closing, and a fast answer could otherwise arrive first: docs/STYLE_GUIDE.md §14.3).
 */
export async function askPossibleDuplicate(duplicate: PossibleDuplicate): Promise<DuplicateChoice> {
  const choice = await askAlert<DuplicateChoice>(
    t('errors.refusal.duplicate.title'),
    duplicateMessage(duplicate),
    [
      { text: t('common.cancel'), style: 'cancel', value: 'cancel' },
      { text: t('errors.refusal.duplicate.saveAnyway'), value: 'save' },
    ],
    'cancel'
  );
  if (choice === 'save') await whenAlertsClosed();
  return choice;
}
