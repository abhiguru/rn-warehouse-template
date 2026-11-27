/**
 * The lines a held edit of a GRN added or removed, as the Held item page shows them (WH-304, Design offline-capture.md 7.11d):
 * a group each, one row per line "{{item}}, {{quantity}}" with the mark after the item when there is one, and for a removed line
 * what the server holds for it now.
 */
import { t as tr } from '@/i18n';
import { formatQuantity } from '@/utils/formatters';
import { displayPackaging } from '@/utils/packagingWord';

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A line of the GRN as the server holds it now (what the GRN's details read). */
export interface ServerLine {
  id: string;
  item_name: string;
  qty: number;
  packaging: string | null;
  package_mark: string | null;
}

export interface LineGroup {
  /** `linesAdded` or `linesRemoved`: the testID suffix. */
  id: 'linesAdded' | 'linesRemoved';
  title: string;
  rows: string[];
}

const quantityText = (qty: unknown, packaging: string | null): string => formatQuantity(typeof qty === 'number' ? qty : Number(qty ?? 0), displayPackaging(packaging));

/** "Potato, AB-12, 40 bags": the item, its mark when there is one, the quantity. */
function rowText(item: string, mark: string | null, quantity: string): string {
  return [item, mark, quantity].filter((part): part is string => part !== null && part !== '').join(', ');
}

const listOf = (value: unknown): Fields[] => (Array.isArray(value) ? (value as unknown[]).filter(isFields) : []);

/** The groups of a held edit's body: lines added, then lines removed, each only when it has lines. `server` finds a removed line's packaging and mark. */
export function lineGroups(body: unknown, server: readonly ServerLine[] | null): LineGroup[] {
  if (!isFields(body)) return [];
  const groups: LineGroup[] = [];
  const added = listOf(body.linesAdded).flatMap(line => {
    const item = textOf(line.item_name);
    return item === null ? [] : [rowText(item, textOf(line.package_mark), quantityText(line.qty, textOf(line.packaging)))];
  });
  if (added.length > 0) groups.push({ id: 'linesAdded', title: tr('offline.linesAdded'), rows: added });
  const removed = listOf(body.linesRemoved).flatMap(line => {
    const item = textOf(line.item_name);
    if (item === null) return [];
    const there = server?.find(each => each.id === line.lotId);
    return [rowText(item, there?.package_mark ?? null, quantityText(line.qty, there?.packaging ?? null))];
  });
  if (removed.length > 0) groups.push({ id: 'linesRemoved', title: tr('offline.linesRemoved'), rows: removed });
  return groups;
}

/**
 * "Now on the server" for the removed lines (7.11d (c)): a line the server no longer has reads `holding.lineGone`; one whose
 * quantity differs from what was removed reads `holding.currentValue` with the item and the server's quantity; an unchanged line
 * and an added line have none. Empty until the server's lines are known.
 */
export function removedLinesNow(body: unknown, server: readonly ServerLine[] | null): string[] {
  if (!isFields(body) || server === null) return [];
  return listOf(body.linesRemoved).flatMap(line => {
    const item = textOf(line.item_name);
    if (item === null || typeof line.lotId !== 'string') return [];
    const there = server.find(each => each.id === line.lotId);
    if (!there) return [tr('offline.holding.lineGone')];
    if (Number(there.qty) === Number(line.qty)) return [];
    return [tr('offline.holding.currentValue', { field: there.item_name, value: quantityText(there.qty, there.packaging) })];
  });
}
