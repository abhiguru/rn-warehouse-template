/**
 * What a held item is, as words (WH-304, product/tech/app-offline-holding-list.md 12.2): the phone hands the server a key of
 * `offline.unsent.what*` and raw values, never a sentence, so a manager reads it in their own language. One function builds it
 * from a row of the unsent file (the same words `unsentList` uses for a photos title), and one function turns it back to text.
 */
import { HEADER_FIELD_LABELS, LOT_FIELD_LABELS as EDIT_LOT_FIELD_LABELS } from '@/features/grn/offline-edit/grnEditChanges';
import { LOT_FIELD_LABELS } from '@/features/unsent/lotChangeKind';
import { t as tr, type TranslationKey, type TranslationParams } from '@/i18n';

/** The ids that stand for the lines an edit added or removed, in a held item's list of changed fields. */
export const LINES_ADDED_FIELD = 'linesAdded';
export const LINES_REMOVED_FIELD = 'linesRemoved';

export interface HeldWhat {
  key: string;
  params?: Record<string, unknown>;
}

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function parse(raw: string | null): Fields {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return isFields(value) ? value : {};
  } catch {
    return {};
  }
}

/** The field ids a quick change or an edit changes: the lot fields it names, in the order the lot row lists them. */
function changedFieldsOf(body: Fields): string[] {
  const out = new Set<string>();
  if (isFields(body.changes)) for (const field of Object.keys(body.changes)) out.add(field);
  if (isFields(body.header)) for (const field of Object.keys(body.header)) out.add(field);
  if (isFields(body.lots)) for (const lot of Object.values(body.lots)) if (isFields(lot)) for (const field of Object.keys(lot)) out.add(field);
  if (Array.isArray(body.linesAdded) && body.linesAdded.length > 0) out.add(LINES_ADDED_FIELD);
  if (Array.isArray(body.linesRemoved) && body.linesRemoved.length > 0) out.add(LINES_REMOVED_FIELD);
  return [...out];
}

export interface HeldWhatSource {
  kind: string;
  /** The row's `body`, as stored (JSON text). */
  body: string;
  target_ref: string | null;
  /** The row's own title, kept for a kind this function does not know. */
  what: string;
}

/** The key and raw values of a row; `photoCount` is the number of its files (a photos item). */
export function heldWhatOf(row: HeldWhatSource, photoCount: number): HeldWhat {
  const body = parse(row.body);
  const target = parse(row.target_ref);
  const args = isFields(body.args) ? body.args : {};
  switch (row.kind) {
    case 'newGrn': {
      const number = textOf(args.p_gr_no);
      return number ? { key: 'offline.unsent.whatNewGrnNumber', params: { number } } : { key: 'offline.unsent.whatNewGrn' };
    }
    case 'newDispatch': {
      const number = textOf(isFields(args.p_dispatch_data) ? args.p_dispatch_data.disp_no : null);
      return number ? { key: 'offline.unsent.whatNewDispatchNumber', params: { number } } : { key: 'offline.unsent.whatNewDispatch' };
    }
    case 'lotChange':
    case 'grnEdit':
      return { key: 'offline.unsent.whatChange', params: { number: textOf(target.number) ?? '', fields: changedFieldsOf(body) } };
    case 'photos': {
      const dispatch = body.doc === 'dispatch';
      const number = textOf(target.number);
      const key = number
        ? dispatch ? 'offline.unsent.whatPhotosDispatch' : 'offline.unsent.whatPhotos'
        : dispatch ? 'offline.unsent.whatPhotosNewDispatch' : 'offline.unsent.whatPhotosNewGrn';
      return { key, params: { count: photoCount, number: number ?? '' } };
    }
    default:
      // A kind with no words of its own: the title it was saved with.
      return { key: row.what };
  }
}

/** The form's own label key of each field id a held change names: the lot's fields, the GRN's header fields, the lines. */
const FIELD_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  ...HEADER_FIELD_LABELS,
  ...EDIT_LOT_FIELD_LABELS,
  ...LOT_FIELD_LABELS,
  [LINES_ADDED_FIELD]: 'offline.linesAdded',
  [LINES_REMOVED_FIELD]: 'offline.linesRemoved',
};

/** The label of a field id ("rack" reads "Rack", "customer_id" reads "Customer"); an id this app does not know is shown as it came. */
export const heldFieldLabel = (field: string): string => {
  const key = Object.hasOwn(FIELD_LABEL_KEYS, field) ? FIELD_LABEL_KEYS[field] : undefined;
  return key ? tr(key) : field;
};
const fieldLabel = heldFieldLabel;

/** The text of a `what` in the reader's language: `fields` as ids are labelled and joined with ", ". */
export function heldWhatText(what: unknown): string {
  if (!isFields(what) || typeof what.key !== 'string') return '';
  const params: TranslationParams = {};
  for (const [name, value] of Object.entries(isFields(what.params) ? what.params : {})) {
    if (Array.isArray(value)) params[name] = value.map(field => fieldLabel(String(field))).join(', ');
    else if (typeof value === 'string' || typeof value === 'number') params[name] = value;
  }
  return tr(what.key as TranslationKey, params);
}
