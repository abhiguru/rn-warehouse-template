/**
 * Stock aging report: its customers list, and one customer's items.
 *
 * The report is of today's stock, so neither level has a period: the request
 * has no `period` and the server is asked the same thing whatever is chosen.
 * Everything here is done in the app on the rows the server returned.
 */
import type { AgingBucketId } from '@/components/reports/AgingBucketBar';
import { t } from '@/i18n';
import type { CustomerAgingSummary, StockAgingItem } from '@/types/report.types';
import { matchesSearch } from '../../searchMatch';
import type { FilterListConfig } from '../../types';
import { reportView, sortRows, type ReportRequest, type ReportView } from './shared';

// ============================================================================
// Every customer
// ============================================================================

export type StockAgingCustomersRequest = ReportRequest;

export const STOCK_AGING_CUSTOMERS: FilterListConfig<StockAgingCustomersRequest> = {
  listKey: 'report-stock-aging',
  // Labels are getters so they follow the app's language (see FieldBase in ../../types).
  get title() { return t('reports.titles.stockAging'); },
  noun: ['customer', 'customers'],
  search: { get placeholder() { return t('reports.components.searchCustomers'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'age', get label() { return t('reports.stockAging.averageAge'); }, kind: 'amount' },
      { field: 'stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'name', get label() { return t('common.customer'); }, kind: 'text' },
    ],
    default: { field: 'age', order: 'desc' },
  },
  fields: [],
  fastFilters: [],
  toRequest: (values, sort) => ({ view: reportView(STOCK_AGING_CUSTOMERS, values, sort) }),
};

/** The customers a search leaves, in the chosen order. */
export function stockAgingCustomersView(rows: readonly CustomerAgingSummary[], view: ReportView): CustomerAgingSummary[] {
  return sortRows(
    rows.filter(row => matchesSearch(view.words, [row.customer_name])),
    view.sort,
    {
      age: row => row.average_age_days,
      stock: row => row.total_stock,
      name: row => row.customer_name,
    }
  );
}

// ============================================================================
// One customer: items, each with the GRN lines it is stored under
// ============================================================================

/** The bucket keys the report RPC sends on each line, by bucket. */
const LINE_BUCKETS: Record<string, AgingBucketId> = {
  '0-120': '0-120',
  '121-240': '121-240',
  '241-364': '241-364',
  '364+': 'over-364',
};

/** The bucket an age in days falls in (thresholds 120 / 240 / 364, as the report RPC counts them). */
export const bucketForDays = (days: number): AgingBucketId =>
  days <= 120 ? '0-120' : days <= 240 ? '121-240' : days <= 364 ? '241-364' : 'over-364';

/** The bucket of a stock line: the one the server named, or the one its age falls in. */
export const lineBucket = (line: Pick<StockAgingItem, 'aging_bucket' | 'aging_days'>): AgingBucketId =>
  LINE_BUCKETS[line.aging_bucket] ?? bucketForDays(line.aging_days);

/** A line of stock: one item on one GRN. `lineKey` tells two lines of the same GRN apart. */
export type StockAgingLine = StockAgingItem & { lineKey: string };

/** An item and its lines, oldest line first. Its figures are those of the lines it holds. */
export interface StockAgingGroup {
  /** The item's name, which the lines are grouped by. */
  key: string;
  itemName: string;
  totalStock: number;
  /** Age in days of the oldest line, and that line's bucket. */
  oldestDays: number;
  oldestBucket: AgingBucketId;
  lines: StockAgingLine[];
}

function summarise(key: string, lines: StockAgingLine[]): StockAgingGroup {
  const oldest = lines[0];
  return {
    key,
    itemName: oldest.item_name,
    totalStock: lines.reduce((sum, line) => sum + (line.current_stock || 0), 0),
    oldestDays: oldest.aging_days,
    oldestBucket: lineBucket(oldest),
    lines,
  };
}

/**
 * The lines of a customer's stock grouped by item, each group's lines oldest
 * first. A line's key is its GRN with the packaging, mark and rack, and a
 * count when even those repeat, so that the same answer gives the same keys.
 */
export function groupStockAgingLines(items: readonly StockAgingItem[]): StockAgingGroup[] {
  const seen = new Map<string, number>();
  const byItem = new Map<string, StockAgingLine[]>();
  for (const item of items) {
    const base = [item.grn_id, item.packaging, item.package_mark, item.rack].join('|');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const line: StockAgingLine = { ...item, lineKey: count === 0 ? base : `${base}#${count}` };
    const lines = byItem.get(item.item_name);
    if (lines) lines.push(line);
    else byItem.set(item.item_name, [line]);
  }
  return [...byItem.entries()].map(([key, lines]) => summarise(key, sortRows(lines, { field: 'age', order: 'desc' }, { age: line => line.aging_days })));
}

export type StockAgingBucketChoice = 'all' | AgingBucketId;
export type StockAgingItemsRequest = ReportRequest<{ bucket: StockAgingBucketChoice }>;

const BUCKET_CHOICES: readonly AgingBucketId[] = ['0-120', '121-240', '241-364', 'over-364'];

export const STOCK_AGING_CUSTOMER: FilterListConfig<StockAgingItemsRequest> = {
  listKey: 'report-stock-aging-customer',
  get title() { return t('reports.titles.stockAging'); },
  noun: ['item', 'items'],
  search: { get placeholder() { return t('reports.stockAging.searchItems'); }, dates: false, range: null },
  sort: {
    options: [
      { field: 'age', get label() { return t('reports.sort.age'); }, kind: 'amount' },
      { field: 'stock', get label() { return t('common.stock'); }, kind: 'amount' },
      { field: 'item', get label() { return t('common.item'); }, kind: 'text' },
    ],
    default: { field: 'age', order: 'desc' },
  },
  fields: [
    {
      kind: 'choice',
      key: 'bucket',
      get label() { return t('reports.stockAging.stockAge'); },
      icon: 'calendar-clock',
      defaultValue: 'all',
      options: [
        { value: 'all', get label() { return t('common.all'); } },
        { value: '0-120', get label() { return t('reports.stockAging.bucket0to120'); } },
        { value: '121-240', get label() { return t('reports.stockAging.bucket121to240'); } },
        { value: '241-364', get label() { return t('reports.stockAging.bucket241to364'); } },
        { value: 'over-364', get label() { return t('reports.stockAging.bucketOver364'); } },
      ],
    },
  ],
  fastFilters: ['bucket'],
  toRequest: (values, sort) => ({
    view: {
      ...reportView(STOCK_AGING_CUSTOMER, values, sort),
      bucket: BUCKET_CHOICES.find(id => id === values.bucket) ?? 'all',
    },
  }),
};

/**
 * One customer's items after the search and the bucket choice, in the chosen
 * order. The search looks in the item's name and each line's GRN number; a
 * line is kept when it has every word and is in the chosen bucket, and an item
 * with no line left is left out. An item that keeps only some of its lines
 * shows the figures of those lines.
 */
export function stockAgingItemsView(groups: readonly StockAgingGroup[], view: StockAgingItemsRequest['view']): StockAgingGroup[] {
  const narrowed: StockAgingGroup[] = [];
  for (const group of groups) {
    const lines = group.lines.filter(
      line => (view.bucket === 'all' || lineBucket(line) === view.bucket) && matchesSearch(view.words, [group.itemName, line.gr_no])
    );
    if (lines.length === group.lines.length) narrowed.push(group);
    else if (lines.length > 0) narrowed.push(summarise(group.key, lines));
  }
  return sortRows(narrowed, view.sort, {
    age: group => group.oldestDays,
    stock: group => group.totalStock,
    item: group => group.itemName,
  });
}
