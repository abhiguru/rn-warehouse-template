/**
 * Groups invoice lines the way the items table shows them: by item group
 * (item_id + package_mark), and inside a group by dispatch.
 *
 * Groups, dispatches and lines keep the order in which they are first seen.
 * Each group looks its dispatches up in a Map, so a group of n distinct
 * dispatches costs n lookups, not n(n-1)/2 comparisons.
 *
 * A group is not a lot: two lots of the same item and mark are one group, and
 * their bags can weigh differently. A group therefore carries every distinct
 * weight of its lines (`weights_each`), never one weight for all of them.
 *
 * A group whose lines are the same objects as in `previous` (Immer keeps the
 * lines it did not change) is returned as the previous object, so a memoized
 * row of a group that was not edited keeps its props.
 */
import type { GroupedInvoiceItems, InvoiceItemData } from '@/types/invoice.types';

export type InvoiceItemGroup = GroupedInvoiceItems & {
  /** Every line of the group, in the order given. */
  allItems: InvoiceItemData[];
};

type DispatchGroup = InvoiceItemGroup['dispatches'][number];

/** The key of a line's item group. */
export const invoiceGroupKey = (item: Pick<InvoiceItemData, 'item_id' | 'package_mark'>): string =>
  `${item.item_id}:::${item.package_mark}`;

/** The key of a group built by {@link groupInvoiceItems}. */
export const groupKeyOf = (group: Pick<GroupedInvoiceItems, 'item_id' | 'package_mark'>): string =>
  invoiceGroupKey(group);

const sameLines = (a: InvoiceItemData[], b: InvoiceItemData[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

/**
 * The distinct weights of some lines, lightest first. A weight is the lot's
 * stored one: the weight of one bag, box or crate, never a total. A line
 * without a weight (none, 0, not a number) has none to add. A weight that
 * arrives as text ("50" in a server answer) counts as its number.
 */
export const distinctWeights = (lines: readonly Pick<InvoiceItemData, 'weight'>[]): number[] => {
  const weights = new Set<number>();
  lines.forEach(({ weight }) => {
    const kg = Number(weight);
    if (Number.isFinite(kg) && kg > 0) weights.add(kg);
  });
  return [...weights].sort((a, b) => a - b);
};

export function groupInvoiceItems(
  items: readonly InvoiceItemData[],
  previous?: readonly InvoiceItemGroup[]
): InvoiceItemGroup[] {
  const groups = new Map<string, InvoiceItemGroup>();
  const dispatchesByGroup = new Map<string, Map<string, DispatchGroup>>();
  const lotsByGroup = new Map<string, Set<string>>();
  const racksByGroup = new Map<string, string[]>();

  items.forEach((item) => {
    const groupKey = invoiceGroupKey(item);

    let group = groups.get(groupKey);
    let dispatches = dispatchesByGroup.get(groupKey);
    if (!group || !dispatches) {
      group = {
        item_id: item.item_id,
        item_name: item.item_name,
        package_mark: item.package_mark,
        // Filled in below, once every line of the group is known.
        weights_each: [],
        gr_quantity: item.grn_original_qty,
        total_dispatched: 0,
        rack: item.rack,
        dispatches: [],
        allItems: [],
      };
      dispatches = new Map();
      groups.set(groupKey, group);
      dispatchesByGroup.set(groupKey, dispatches);
    }

    let dispatchGroup = dispatches.get(item.dispatch_id);
    if (!dispatchGroup) {
      dispatchGroup = {
        dispatch_no: item.dispatch_no,
        dispatch_id: item.dispatch_id,
        dispatch_date: item.dispatch_date,
        items: [],
      };
      dispatches.set(item.dispatch_id, dispatchGroup);
      group.dispatches.push(dispatchGroup);
    }

    dispatchGroup.items.push(item);
    group.allItems.push(item);
    group.total_dispatched += item.qty;

    // The group's received quantity is that of every lot in it, each counted once however many
    // dispatches it has; the racks of its lots are listed the same way.
    const lotKey = item.grn_item_id || item.temp_id;
    let lots = lotsByGroup.get(groupKey);
    if (!lots) {
      lots = new Set([lotKey]);
      lotsByGroup.set(groupKey, lots);
      racksByGroup.set(groupKey, item.rack ? [item.rack] : []);
    } else if (!lots.has(lotKey)) {
      lots.add(lotKey);
      group.gr_quantity += item.grn_original_qty;
      const racks = racksByGroup.get(groupKey)!;
      if (item.rack && !racks.includes(item.rack)) {
        racks.push(item.rack);
        group.rack = racks.join(', ');
      }
    }
  });

  const before = new Map<string, InvoiceItemGroup>();
  previous?.forEach((group) => before.set(groupKeyOf(group), group));

  const result: InvoiceItemGroup[] = [];
  groups.forEach((group, groupKey) => {
    const old = before.get(groupKey);
    // Everything in a group follows from its lines, so the same lines are the same group.
    if (old && sameLines(old.allItems, group.allItems)) {
      result.push(old);
      return;
    }
    group.weights_each = distinctWeights(group.allItems);
    result.push(group);
  });
  return result;
}

/** A group's total, summed dispatch by dispatch as the table always did. */
export const invoiceGroupTotal = (group: GroupedInvoiceItems): number =>
  group.dispatches.reduce(
    (sum, dispatch) => sum + dispatch.items.reduce((dispatchSum, item) => dispatchSum + item.item_total, 0),
    0
  );

/**
 * The total of every group by its key. A group object that was reused keeps its
 * total from `previous` without adding its lines again.
 */
export function invoiceGroupTotals(
  groups: readonly InvoiceItemGroup[],
  previous?: { groups: readonly InvoiceItemGroup[]; totals: Map<string, number> }
): Map<string, number> {
  const reused = new Set(previous?.groups);
  const totals = new Map<string, number>();
  groups.forEach((group) => {
    const key = groupKeyOf(group);
    const known = reused.has(group) ? previous?.totals.get(key) : undefined;
    totals.set(key, known ?? invoiceGroupTotal(group));
  });
  return totals;
}
