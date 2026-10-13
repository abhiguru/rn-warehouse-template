/**
 * Stock summary report (C1): today's stock, by customer and by item, with a
 * stock PDF to share (generate-report-pdf, through useReportExport; one
 * customer's PDF falls back to generate-customer-stock-pdf on an older backend).
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10): useReportScope says
 * whose stock, useReportFilters holds the search and sort, useReportQuery the
 * data, and ReportScaffold draws every state. The report has no period: it is
 * the stock of today. A warehouse role sees every customer and opens one by
 * pushing this route with `?customerId=`, so the phone's back button and the
 * header's agree.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  ReportCustomerCard,
  ReportCustomerPicker,
  ReportLastCustomer,
  ReportNoCustomer,
  ReportScaffold,
  StockItemCard,
  animateExpand,
  type KPIItem,
  type ReportHeaderAction,
  type StockGRNRowData,
} from '@/components/reports';
import { StockGRNListRow } from '@/components/reports/StockItemCard';
import { ListEmptyState, type ListEmptyStateProps } from '@/components/list/ListEmptyState';
import { filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { matchesAnyWord } from '@/features/filters/components/HighlightedText';
import {
  STOCK_SUMMARY_CUSTOMER,
  STOCK_SUMMARY_CUSTOMERS,
  stockSummaryCustomersView,
  stockSummaryItemsView,
} from '@/features/filters/configs/reports/stockSummary';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { reportById } from '@/features/reports/reportRegistry';
import { exportHeaderActions } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope, type ReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr, formatIdentifier } from '@/i18n';
import { generateCustomerStockPDF } from '@/services/pdf-service';
import { getAllStockSummary, getCustomerStockSummary } from '@/services/reporting';
import type { ReportCustomerRef } from '@/store/slices/reportPrefsSlice';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { AllStockSummaryData, CustomerStockRow, StockItemSummary, StockSummaryData } from '@/types/report.types';
import { formatCount, formatIndiaDate, formatNumber } from '@/utils/formatters';

const REPORT_ID = 'stock-summary';

const makeStyles = (t: ThemeTokens) => ({
  // A card per row, spaced by its own bottom margin.
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardClip: { borderRadius: radius.card, overflow: 'hidden' as const },
  // The item card draws its own surface, shadow and match line; the list only spaces it.
  itemCard: { marginHorizontal: layout.marginCompact, marginBottom: space.sm },
  // An opened item's GRN rows follow its card with no gap; the last one spaces the next card.
  itemCardOpen: { marginHorizontal: layout.marginCompact },
  grnRow: { marginHorizontal: layout.marginCompact },
  grnRowLast: { marginHorizontal: layout.marginCompact, marginBottom: space.sm },

  // The header row over the out-of-stock rows
  section: { marginTop: space.lg },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  sectionHeaderPressed: { backgroundColor: t.surface.cardPressed },
  sectionHeaderLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, flexShrink: 1 },
  sectionTitle: { ...typography.headline, color: t.text.primary },
  sectionHint: { ...typography.footnote, color: t.text.secondary },
  countBadge: {
    minWidth: 18,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  countBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    fontVariant: ['tabular-nums' as const],
  },
});

// ============================================================================
// Whose stock
// ============================================================================

export default function StockSummaryScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.stockSummary')} />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.stockSummary')} onPick={scope.chooseCustomer} />;
    case 'customers':
      return <CustomersReport scope={scope} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's view is carried into another's.
      return (
        <CustomerReport
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

// ============================================================================
// The stock PDF
// ============================================================================

/**
 * The report is of today's stock: the PDF is asked for no dates. One
 * customer's stock PDF existed before generate-report-pdf: on a server without
 * it that older PDF is shared instead (in its own order), so the row share and
 * the one-customer header stay. The all-customers PDF has no older one.
 */
const olderStockPdf = (customerId: string) => () => generateCustomerStockPDF(customerId);

// ============================================================================
// Every customer
// ============================================================================

const customerKey = (customer: CustomerStockRow) => customer.customer_id;

function CustomersReport({ scope }: { scope: ReportScope }) {
  const filters = useReportFilters(STOCK_SUMMARY_CUSTOMERS);
  const { view } = filters.request;
  const query = useReportQuery<AllStockSummaryData>({
    key: [REPORT_ID, 'customers'],
    fetch: () => getAllStockSummary(),
    fallbackError: tr('reports.stockSummary.loadError'),
  });
  const { data } = query;
  const rows = useMemo(() => stockSummaryCustomersView(data?.customers ?? [], view), [data, view]);
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && [
        { icon: 'cube-outline', value: data.summary.total_items, label: tr('common.items'), variant: 'primary' },
        { icon: 'warehouse', value: data.summary.total_quantity, label: tr('common.stock'), variant: 'primary' },
      ],
    [data]
  );

  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, sort: reportPdfSort(REPORT_ID, 'customers', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title }),
  });
  const actions = useMemo(() => exportHeaderActions({ exportPdf, busy, available }), [exportPdf, busy, available]);

  const { openCustomer, lastCustomer } = scope;
  const renderRow = useCallback(
    (customer: CustomerStockRow) => <CustomerRow customer={customer} words={view.words} onOpen={openCustomer} />,
    [view.words, openCustomer]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.stockSummary')}
      subtitle={tr('reports.shared.allCustomers')}
      actions={actions}
      filters={{ config: STOCK_SUMMARY_CUSTOMERS, state: filters }}
      query={query}
      kpis={kpis}
      status={{ shown: rows.length, total: data?.customers.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={customerKey}
      extraData={view.words}
      noun="customers"
      empty={{ icon: 'package-variant-closed', title: tr('reports.shared.noStockYet'), description: tr('reports.shared.noStockYetDescription') }}
      errorTitle={tr('reports.stockSummary.errorTitle')}
    >
      {lastCustomer && !filters.search ? (
        <ReportLastCustomer customer={lastCustomer} onPress={openCustomer} accessibilityHint={tr('reports.stockSummary.opensCustomerHint')} />
      ) : null}
    </ReportScaffold>
  );
}

interface CustomerRowProps {
  customer: CustomerStockRow;
  words: string[];
  onOpen: (customer: ReportCustomerRef) => void;
}

/**
 * Keyed by the customer: a list cell drawn again for another customer gets a
 * row of its own, so one customer's PDF on its way never shows as another's.
 */
const CustomerRow = memo(function CustomerRow(props: CustomerRowProps) {
  return <CustomerStockRowCard key={props.customer.customer_id} {...props} />;
});

/**
 * A customer's row and its share button. Each row has its own export, so each
 * has its own busy state: a second tap while its PDF is on its way is ignored,
 * and one export ending does not clear another's. The PDF is that customer's
 * stock summary, in the PDF's own order.
 */
function CustomerStockRowCard({ customer, words, onOpen }: CustomerRowProps) {
  const styles = useThemedStyles(makeStyles);
  const { customer_id: customerId, customer_name: customerName } = customer;
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => (customerId ? { report: REPORT_ID, customer_id: customerId } : null),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
    fallback: olderStockPdf(customerId),
  });
  return (
    <View style={styles.card}>
      <View style={styles.cardClip}>
        <ReportCustomerCard
          customerId={customer.customer_id}
          title={customer.customer_name}
          highlightWords={words}
          subtitle={[formatCount(customer.item_count, 'item'), formatCount(customer.grn_count, 'GRN')]}
          value={customer.total_stock}
          valueLabel={tr('reports.shared.units', { count: customer.total_stock })}
          onPress={() => onOpen({ id: customer.customer_id, name: customer.customer_name })}
          onShare={available ? () => void exportPdf() : undefined}
          isSharing={busy}
          accessibilityHint={tr('reports.stockSummary.opensCustomerHint')}
        />
      </View>
    </View>
  );
}

// ============================================================================
// One customer's items
// ============================================================================

/**
 * The rows of one customer's list, all in the one FlashList so that a long list
 * of items that ran out is drawn only as it scrolls into view:
 *
 *   the items in stock (or, when none is shown, a message row in their place)
 *   a header row "Out of stock", which opens and closes the rows under it
 *   the items that ran out in the last 360 days, while the header is open
 *
 * An opened item is followed by a row for each of its GRNs (P2F-UI-2): an item can
 * be on hundreds of GRNs, and drawn inside its card they would all be mounted at
 * once in one list cell. As rows of their own the list draws only those on screen.
 *
 * The message row is needed because the list's own empty state shows only for a
 * list with no rows at all.
 */
type CustomerListRow =
  | { kind: 'item'; item: StockItemSummary }
  | { kind: 'nothingInStock' }
  | { kind: 'emptiedHeader'; count: number }
  | { kind: 'emptied'; item: StockItemSummary }
  | {
      kind: 'grn';
      /** The item row's key, then the GRN's own: stable for the same answer. */
      key: string;
      /** The item the GRN is under. */
      parentId: string;
      grn: StockGRNRowData;
      outOfStock: boolean;
      isFirst: boolean;
      isLast: boolean;
    };

const itemRowKey = (kind: 'item' | 'emptied', item: StockItemSummary) => `${kind}:${item.item_id}`;

const rowKey = (row: CustomerListRow): string => {
  switch (row.kind) {
    case 'item':
    case 'emptied':
      return itemRowKey(row.kind, row.item);
    case 'grn':
      return row.key;
    default:
      return row.kind;
  }
};
const rowType = (row: CustomerListRow): string => row.kind;

const openGRN = (grnId: string) => {
  if (grnId) router.push(`/grn-details/${grnId}`);
};

/** Opens or closes one id in a set of open ids. */
const toggled = (ids: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

interface CustomerReportProps {
  customerId: string;
  customerName: string;
  onChangeCustomer?: () => void;
}

function CustomerReport({ customerId, customerName, onChangeCustomer }: CustomerReportProps) {
  const styles = useThemedStyles(makeStyles);
  const filters = useReportFilters(STOCK_SUMMARY_CUSTOMER);
  const { view } = filters.request;
  const query = useReportQuery<StockSummaryData>({
    key: [REPORT_ID, 'customer', customerId],
    fetch: () => getCustomerStockSummary(customerId),
    fallbackError: tr('reports.stockSummary.loadError'),
  });
  const { data } = query;
  // The search and the sort apply to the items in stock and to those that ran out alike.
  const items = useMemo(() => stockSummaryItemsView(data?.items ?? [], view), [data, view]);
  const emptied = useMemo(() => stockSummaryItemsView(data?.out_of_stock_items ?? [], view), [data, view]);
  // The figures are today's whole stock, not what the search leaves. Nothing in stock: none (as before).
  const kpis = useMemo<KPIItem[] | undefined>(
    () =>
      data && data.items.length > 0
        ? [
            // "Stock", as the item stock summary names the same figure.
            { icon: 'warehouse', value: data.summary.total_quantity, label: tr('common.stock'), variant: 'primary' },
            { icon: 'package-down', value: data.summary.grn_count, label: tr('reports.stockSummary.grnsWithStock'), variant: 'primary' },
          ]
        : undefined,
    [data]
  );

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleItem = useCallback((itemId: string) => setOpen(ids => toggled(ids, itemId)), []);
  const [openEmptied, setOpenEmptied] = useState<ReadonlySet<string>>(() => new Set());
  const toggleEmptied = useCallback((itemId: string) => setOpenEmptied(ids => toggled(ids, itemId)), []);

  // The out-of-stock rows are folded away until the header opens them. A search that finds
  // nothing in stock but finds items that ran out opens them, so the matches are in view (§14.6);
  // the header still closes them.
  const onlyEmptiedMatch = view.words.length > 0 && items.length === 0 && emptied.length > 0;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [openedForMatch, setOpenedForMatch] = useState(false);
  if (onlyEmptiedMatch !== openedForMatch) {
    setOpenedForMatch(onlyEmptiedMatch);
    if (onlyEmptiedMatch) setSectionOpen(true);
  }
  const reduceMotion = useReducedMotion();
  const toggleSection = useCallback(() => {
    animateExpand(reduceMotion);
    setSectionOpen(value => !value);
  }, [reduceMotion]);

  const rows = useMemo<CustomerListRow[]>(() => {
    const inStock = items.flatMap(item => itemWithGrns('item', item, open.has(item.item_id)));
    if (emptied.length === 0) return inStock;
    return [
      ...(inStock.length > 0 ? inStock : [{ kind: 'nothingInStock' as const }]),
      { kind: 'emptiedHeader' as const, count: emptied.length },
      ...(sectionOpen ? emptied.flatMap(item => itemWithGrns('emptied', item, openEmptied.has(item.item_id))) : []),
    ];
  }, [items, emptied, sectionOpen, open, openEmptied]);

  // The message in place of the in-stock rows when items ran out but none in stock is shown:
  // nothing in stock at all, or a search that finds only items that ran out.
  const search = filters.search.trim();
  const nothingInStock = useMemo<ListEmptyStateProps>(
    () =>
      onlyEmptiedMatch
        ? {
            ...filteredEmptyProps(filters, 'items'),
            filteredTitle: tr('reports.stockSummary.noStockMatch', { search }),
            filteredSubtitle: tr('reports.stockSummary.emptiedMatchBelow', { count: emptied.length }),
          }
        : {
            activeFilterCount: 0,
            emptyIcon: 'package-variant-closed',
            emptyTitle: tr('reports.shared.noStockForCustomer'),
            emptySubtitle: tr('reports.shared.noStockForCustomerDescription'),
          },
    [onlyEmptiedMatch, filters, search, emptied.length]
  );

  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, customer_id: customerId, sort: reportPdfSort(REPORT_ID, 'customer', view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
    fallback: olderStockPdf(customerId),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      ...exportHeaderActions({ exportPdf, busy, available }),
    ],
    [onChangeCustomer, exportPdf, busy, available]
  );
  const oldest = data?.summary.oldest_stock_date;
  const subtitle = customerName || (oldest ? tr('reports.stockSummary.oldestStock', { date: formatIndiaDate(oldest) }) : undefined);

  const renderRow = useCallback(
    (row: CustomerListRow) => {
      switch (row.kind) {
        case 'item':
          return <ItemRow item={row.item} words={view.words} isExpanded={open.has(row.item.item_id)} onToggle={toggleItem} />;
        case 'emptied':
          return (
            <ItemRow item={row.item} words={view.words} isExpanded={openEmptied.has(row.item.item_id)} onToggle={toggleEmptied} outOfStock />
          );
        case 'grn':
          return (
            <StockGRNListRow
              grn={row.grn}
              isFirst={row.isFirst}
              isLast={row.isLast}
              muted={row.outOfStock}
              onOpen={openGRN}
              highlightWords={view.words}
              style={row.isLast ? styles.grnRowLast : styles.grnRow}
            />
          );
        case 'emptiedHeader':
          return <OutOfStockHeader count={row.count} isOpen={sectionOpen} onToggle={toggleSection} />;
        case 'nothingInStock':
          return <ListEmptyState {...nothingInStock} />;
      }
    },
    [view.words, open, openEmptied, sectionOpen, nothingInStock, toggleItem, toggleEmptied, toggleSection, styles]
  );
  const extraData = useMemo(
    () => ({ words: view.words, open, openEmptied, sectionOpen, nothingInStock }),
    [view.words, open, openEmptied, sectionOpen, nothingInStock]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.stockSummary')}
      subtitle={subtitle}
      actions={actions}
      filters={{ config: STOCK_SUMMARY_CUSTOMER, state: filters }}
      query={query}
      kpis={kpis}
      status={{ shown: items.length, total: data?.items.length }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={rowKey}
      getRowType={rowType}
      extraData={extraData}
      noun="items"
      empty={{
        icon: 'package-variant-closed',
        title: tr('reports.shared.noStockForCustomer'),
        description: tr('reports.shared.noStockForCustomerDescription'),
      }}
      errorTitle={tr('reports.stockSummary.errorTitle')}
    />
  );
}

/** The GRNs of an item as the shared card draws them. */
const toGrnRows = (item: StockItemSummary, outOfStock: boolean): StockGRNRowData[] =>
  item.grns.map((grn, index) => {
    const emptiedOn = outOfStock && grn.emptied_date ? grn.emptied_date : null;
    return {
      key: `${grn.gr_no}-${index}`,
      grnId: grn.grn_id || null,
      grNo: grn.gr_no,
      packageMark: grn.package_mark || null,
      receivedDate: grn.date,
      emptiedDate: emptiedOn,
      // An emptied GRN no longer holds a rack: its packaging and rack are not shown.
      packaging: emptiedOn ? null : grn.packaging,
      rack: emptiedOn ? null : grn.rack,
      weightEach: grn.item_weight,
      stock: grn.stock,
      total: grn.orig_qty,
    };
  });

// The same answer gives the same GRN rows, so an item opened again (or another item opened)
// draws none of its GRN rows again: their props are the same objects.
const grnRowsCache = { item: new WeakMap<StockItemSummary, StockGRNRowData[]>(), emptied: new WeakMap<StockItemSummary, StockGRNRowData[]>() };
const grnRows = (item: StockItemSummary, outOfStock: boolean): StockGRNRowData[] => {
  const cache = outOfStock ? grnRowsCache.emptied : grnRowsCache.item;
  let rows = cache.get(item);
  if (!rows) {
    rows = toGrnRows(item, outOfStock);
    cache.set(item, rows);
  }
  return rows;
};

/** An item's row and, while it is open, a row for each of its GRNs under it. */
function itemWithGrns(kind: 'item' | 'emptied', item: StockItemSummary, isOpen: boolean): CustomerListRow[] {
  const head: CustomerListRow = { kind, item };
  if (!isOpen) return [head];
  const outOfStock = kind === 'emptied';
  const parentKey = itemRowKey(kind, item);
  const grns = grnRows(item, outOfStock);
  return [
    head,
    ...grns.map((grn, index) => ({
      kind: 'grn' as const,
      key: `${parentKey}|grn:${grn.key}`,
      parentId: item.item_id,
      grn,
      outOfStock,
      isFirst: index === 0,
      isLast: index === grns.length - 1,
    })),
  ];
}

/**
 * The GRNs a search found on an item (§14.6): a closed card shows its name, not
 * its GRN numbers, so it names them in its match line (the card draws the line
 * only while closed). Only for words the name does not already show.
 */
function hiddenMatches(item: StockItemSummary, words: string[]): string[] {
  const name = item.item_name.toLowerCase();
  const unseen = words.filter(word => !name.includes(word));
  if (unseen.length === 0) return [];
  const found = new Set<string>();
  for (const grn of item.grns) {
    if (matchesAnyWord(String(grn.gr_no ?? ''), unseen)) found.add(tr('reports.shared.grnNumber', { number: formatIdentifier(grn.gr_no) }));
  }
  return [...found].slice(0, 3);
}

interface ItemRowProps {
  item: StockItemSummary;
  /** Lower-cased search words. */
  words: string[];
  isExpanded: boolean;
  onToggle: (itemId: string) => void;
  outOfStock?: boolean;
}

const ItemRow = memo(function ItemRow({ item, words, isExpanded, onToggle, outOfStock = false }: ItemRowProps) {
  const styles = useThemedStyles(makeStyles);
  const { item_id: itemId } = item;
  const handleToggle = useCallback(() => onToggle(itemId), [onToggle, itemId]);
  const grns = useMemo(() => ({ status: 'loaded' as const, rows: grnRows(item, outOfStock) }), [item, outOfStock]);
  // Opened with GRNs, the card is the top of its frame: the GRN rows under it carry the gap.
  const joined = isExpanded && grns.rows.length > 0;
  const matchLine = useMemo(() => hiddenMatches(item, words).join(' · ') || undefined, [item, words]);
  return (
    <StockItemCard
      name={item.item_name}
      grnCount={item.grn_count}
      stock={item.total_stock}
      outOfStock={outOfStock}
      isExpanded={isExpanded}
      onToggle={handleToggle}
      grns={grns}
      onOpenGRN={openGRN}
      highlightWords={words}
      matchLine={matchLine}
      // An item with no GRN to list says so rather than opening onto nothing.
      emptyGRNsText={outOfStock ? tr('reports.stockSummary.noGrnsToShow') : tr('reports.itemStockSummary.noGrnsInStock')}
      // The list draws the GRNs, each a row of its own under this card (see CustomerListRow).
      grnsInList
      style={joined ? styles.itemCardOpen : styles.itemCard}
    />
  );
});

interface OutOfStockHeaderProps {
  /** How many items ran out in the last 360 days, after the search. */
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}

/** The header row over the items that ran out: one tap opens or closes them. */
const OutOfStockHeader = memo(function OutOfStockHeader({ count, isOpen, onToggle }: OutOfStockHeaderProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.cardClip}>
          <Pressable
            style={({ pressed }) => [styles.sectionHeader, pressed && styles.sectionHeaderPressed]}
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={tr('reports.stockSummary.outOfStockA11y', { items: formatCount(count, 'item') })}
            accessibilityState={{ expanded: isOpen }}
          >
            <View style={styles.sectionHeaderLeft}>
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
              <Text style={styles.sectionTitle}>{tr('common.outOfStock')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText} maxFontSizeMultiplier={1.6}>
                  {formatNumber(count)}
                </Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>{tr('reports.stockSummary.last360Days')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});
