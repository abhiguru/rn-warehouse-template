/**
 * The one sentence of a replaced entry (WH-303; product/design/offline-capture.md 6.2, 6.x DQ3, DQ11; contract section 7 and
 * 14.5). The strip on GRN details and the "Replaced entries" report both draw it. A field entry says what it replaced and
 * who set each value; when the phone's own time and the server's time differ by more than a minute, both are told.
 */
import type { t as Translate, TranslationKey } from '@/i18n';
import type { RpcGrnReplacement } from '@/types/rpc-canonical.types';
import { displayPackaging } from '@/utils/packagingWord';
import { formatLoadedAt, formatQuantity } from '@/utils/formatters';

/** A row of `get_grn_replacements`, the feed entity `grn_replacements` or `get_grn_details.replacements`. */
export type ReplacedEntry = RpcGrnReplacement;

export interface ReplacedTextOptions {
  /** The GRN has more than one lot of this entry's item: the lot's mark or rack tells them apart (DQ11). */
  sameItemLots?: boolean;
}

/** More than this many seconds between the phone's time and the server's time, and both are told. */
export const LATE_AFTER_MS = 60_000;

const FIELD_LABELS: Readonly<Record<string, TranslationKey>> = {
  date: 'common.date',
  customer_id: 'common.customer',
  customer: 'common.customer',
  sender_id: 'grn.header.sender',
  sender: 'grn.header.sender',
  supervisor_id: 'grn.header.supervisor',
  supervisor: 'grn.header.supervisor',
  registration: 'grn.header.vehicleRegistration',
  pricing_mode: 'grn.header.pricingMode',
  leon: 'grn.header.leon',
  note: 'payments.form.note',
  item_id: 'common.item',
  item: 'common.item',
  packaging: 'common.packaging',
  qty: 'grn.item.quantity',
  weight: 'common.weight',
  rack: 'common.rack',
  package_mark: 'grn.item.mark',
};
/** The fields that belong to one lot rather than to the GRN. */
const LOT_FIELDS: ReadonlySet<string> = new Set(['item_id', 'item', 'packaging', 'qty', 'weight', 'rack', 'package_mark']);

const millis = (value: string | null): number | null => {
  if (value === null) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};
const timeOf = (value: string | null): string => {
  const at = millis(value);
  return at === null ? '' : formatLoadedAt(at);
};
const isLate = (entry: ReplacedEntry): boolean => {
  const made = millis(entry.recorded_at);
  const reached = millis(entry.sent_at);
  return made !== null && reached !== null && Math.abs(made - reached) > LATE_AFTER_MS;
};

/** Whether the phone's time and the server's time differ by more than a minute (the late sentence). */
export const isLateEntry = isLate;

function valueText(value: unknown, t: typeof Translate): string {
  if (value === null || value === undefined || value === '') return t('offline.replaced.empty');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return t('offline.replaced.empty');
}

function fieldName(entry: ReplacedEntry, t: typeof Translate, options: ReplacedTextOptions): string {
  const field = entry.field ?? '';
  const key = FIELD_LABELS[field];
  const label = key ? t(key) : field;
  if (!LOT_FIELDS.has(field) || !entry.lot_item_name) return label;
  const item = entry.lot_item_name;
  if (options.sameItemLots) {
    const mark = entry.lot_package_mark ?? '';
    if (field !== 'package_mark' && mark !== '') return t('offline.replaced.lotFieldMark', { item, mark, field: label });
    const rack = entry.lot_rack ?? '';
    if (rack !== '') return t('offline.replaced.lotFieldRack', { item, rack, field: label });
  }
  return t('offline.replaced.lotField', { item, field: label });
}

/** The sentence for one entry, in the app's language. */
export function replacedLineText(entry: ReplacedEntry, t: typeof Translate, options: ReplacedTextOptions = {}): string {
  const who = (name: string | null) => name ?? t('offline.replaced.whoUnknown');
  const late = isLate(entry);
  if (entry.kind === 'line_added') {
    const line = (typeof entry.sent_value === 'object' && entry.sent_value !== null ? entry.sent_value : {}) as {
      item_name?: string;
      qty?: number;
      packaging?: string | null;
    };
    const params = {
      item: line.item_name ?? '',
      quantity: formatQuantity(Number(line.qty ?? 0), displayPackaging(line.packaging)),
      by: who(entry.sent_by_name),
      at: late ? timeOf(entry.recorded_at) : timeOf(entry.sent_at),
      reachedAt: timeOf(entry.sent_at),
    };
    return t(late ? 'offline.replaced.lineAddedLate' : 'offline.replaced.lineAdded', params);
  }
  const params = {
    field: fieldName(entry, t, options),
    newer: valueText(entry.newer_value, t),
    newerBy: who(entry.newer_by_name),
    newerAt: timeOf(entry.newer_at),
    sent: valueText(entry.sent_value, t),
    sentBy: who(entry.sent_by_name),
    sentAt: late ? timeOf(entry.recorded_at) : timeOf(entry.sent_at),
    reachedAt: timeOf(entry.sent_at),
  };
  return t(late ? 'offline.replaced.fieldLate' : 'offline.replaced.field', params);
}
