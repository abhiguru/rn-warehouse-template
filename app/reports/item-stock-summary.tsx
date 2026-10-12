/**
 * Item stock summary: every item in stock, across the customers the account
 * may see, with the GRNs that hold it read when its card is opened.
 *
 * Built on the report layer (docs/STYLE_GUIDE.md §14.10). useReportScope says
 * whose stock: a warehouse role sees every customer (one list, no customers
 * level), a customer account its customer, after choosing one if it has
 * several. useReportFilters holds the search and the sort, useReportQuery the
 * data, and ReportScaffold draws every state.
 *
 * The one paged report: the server searches, sorts and pages it
 * (get_item_wise_stock_list, backend migration 52). Each page is asked for
 * under its own key (customer, search, sort, offset), so an answer to an
 * earlier search or sort is filed under that key and never added to the list
 * on screen; the pages after the first are kept here, for the list they belong
 * to. A backend without migration 52 cannot sort: the items loaded so far are
 * then sorted here, and the Stock figure is shown once every item is loaded.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  ReportCustomerPicker,
  ReportEmptyState,
  ReportHeader,
  ReportScaffold,
  StockItemCard,
  isLowStock,
  type KPIItem,
  type ReportHeaderAction,
  type StockGRNRowData,
  type StockGRNState,
} from '@/components/reports';
import { ReportLoadMoreFooter, type ReportLoadMoreState } from '@/components/reports/ReportLoadMoreFooter';
import { ITEM_STOCK, itemStockFallbackView } from '@/features/filters/configs/reports/itemStock';
import type { SortState } from '@/features/filters/types';
import { reportById } from '@/features/reports/reportRegistry';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { getAllGRNItems, getCustomerGRNItems, type GRNItem } from '@/services/grn-service';
import type { ReportPdfSort } from '@/services/pdf-service';
import { StockService } from '@/services/stock-service';
import { layout, space, type ThemeTokens } from '@/theme/tokens';
import type { ItemWiseStockItem } from '@/types/stock.types';

const REPORT_ID = 'item-stock-summary';
/** Items per page; the server allows more, the style guide asks for 25 to 50 (§13.6). */
const ITEM_STOCK_PAGE_SIZE = 50;

/**
 * The PDF's column for each sort of the screen (backend report-definitions.ts;
 * the screen's sorts are the list RPC's own names). A sort the PDF has no
 * column for is not sent: the PDF keeps its own order. The report is of
 * today's stock: the PDF is asked for no dates.
 */
const PDF_SORT_ITEMS: Readonly<Record<string, string>> = { item_name: 'item', total_stock: 'stock', total_qty: 'received', grn_count: 'grns' };

function pdfSort(sort: SortState | undefined): ReportPdfSort | undefined {
  if (!sort || !Object.prototype.hasOwnProperty.call(PDF_SORT_ITEMS, sort.field)) return undefined;
  return { field: PDF_SORT_ITEMS[sort.field], order: sort.order };
}

type ItemPage = NonNullable<Awaited<ReturnType<typeof StockService.getItemWiseStockList>>['data']>;

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  // A card per row, spaced by its own bottom margin; the list has no side padding of its own.
  card: { marginHorizontal: layout.marginCompact, marginBottom: space.sm },
});

// ============================================================================
// Whose stock
// ============================================================================

export default function ItemStockSummaryScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <NoCustomer />;
    case 'choose':
      return <ReportCustomerPicker title={tr('reports.titles.itemStockSummary')} onPick={scope.chooseCustomer} />;
    case 'customers':
      // Every customer: the request names none.
      return <ItemStockReport key="all-customers" subtitle={tr('reports.shared.allCustomers')} />;
    case 'customer':
      // Keyed by the customer, so nothing of one customer's list is carried into another's.
      return (
        <ItemStockReport
          key={level.customerId}
          customerId={level.customerId}
          customerName={level.customerName}
          subtitle={level.customerName || undefined}
          onChangeCustomer={scope.changeCustomer}
        />
      );
  }
}

function NoCustomer() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.itemStockSummary')} />
      <ReportEmptyState icon="account-off-outline" message={tr('reports.shared.noCustomerLinked')} description={tr('reports.shared.noCustomer')} />
    </View>
  );
}

// ============================================================================
// The items
// ============================================================================

/** The pages after the first, for the list (customer, search, sort) they were asked for. */
interface LaterPages {
  listId: string;
  pages: ItemPage[];
  /** The offset being asked for, or null when no further page is out. */
  next: number | null;
}
const noLaterPages = (listId: string): LaterPages => ({ listId, pages: [], next: null });

/** Each item once: a stock that changed between two pages can move an item onto the next page too. */
function uniqueItems(pages: ItemPage[]): ItemWiseStockItem[] {
  const seen = new Set<string>();
  const items: ItemWiseStockItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.item_id)) continue;
      seen.add(item.item_id);
      items.push(item);
    }
  }
  return items;
}

const itemKey = (item: ItemWiseStockItem) => item.item_id;

interface ItemStockReportProps {
  /** Left out for every customer. */
  customerId?: string;
  /** The customer's name for the PDF's file name; left out for every customer. */
  customerName?: string;
  subtitle?: string;
  onChangeCustomer?: () => void;
}

function ItemStockReport({ customerId, customerName, subtitle, onChangeCustomer }: ItemStockReportProps) {
  const styles = useThemedStyles(makeStyles);
  const filters = useReportFilters(ITEM_STOCK);
  const { view, server } = filters.request;
  const { searchQuery, sortBy, sortOrder } = server;
  const scopeKey = customerId ?? 'all';
  // Everything the rows depend on: a page of one list is never added to another.
  const listKey = useMemo(() => [REPORT_ID, scopeKey, searchQuery ?? '', sortBy, sortOrder] as const, [scopeKey, searchQuery, sortBy, sortOrder]);
  const listId = JSON.stringify(listKey);

  const askPage = (offset: number) =>
    StockService.getItemWiseStockList({ customerId, searchQuery, limit: ITEM_STOCK_PAGE_SIZE, offset, sortBy, sortOrder });

  const first = useReportQuery<ItemPage>({
    key: [...listKey, 0],
    fetch: () => askPage(0),
    fallbackError: tr('reports.itemStockSummary.loadError'),
  });

  // The later pages of the list on screen. Kept with the list they belong to, so a new search
  // or sort starts again from its first page, and a page still loading for the old one (and
  // its "Loading more" footer) is gone with it.
  const [later, setLater] = useState<LaterPages>(() => noLaterPages(listId));
  const current = useMemo(() => (later.listId === listId ? later : noLaterPages(listId)), [later, listId]);
  const nextOffset = current.next;

  const more = useReportQuery<ItemPage>({
    key: [...listKey, nextOffset ?? 'none'],
    fetch: () => askPage(nextOffset ?? 0),
    fallbackError: tr('reports.itemStockSummary.loadMoreError'),
    enabled: nextOffset !== null,
  });
  // A page is added once its own request has answered: not a copy kept from earlier.
  const arrived = nextOffset !== null && !more.isFetching && !more.error ? more.data : undefined;
  useEffect(() => {
    if (!arrived) return;
    setLater(prev => (prev.listId === listId && prev.next === nextOffset ? { listId, pages: [...prev.pages, arrived], next: null } : prev));
  }, [arrived, listId, nextOffset]);

  const pages = useMemo(() => (first.data ? [first.data, ...current.pages] : []), [first.data, current.pages]);
  const loaded = useMemo(() => uniqueItems(pages), [pages]);
  // Rows received, duplicates included: where the next page starts.
  const received = pages.reduce((sum, page) => sum + page.items.length, 0);
  const total = first.data?.pagination.totalCount;
  const lastPageEmpty = current.pages.length > 0 && current.pages[current.pages.length - 1].items.length === 0;
  const hasMore = total !== undefined && received < total && !lastPageEmpty;

  // A backend without migration 52 sends the items in name order: what is loaded is sorted here.
  const serverSorted = first.data?.sortApplied !== false;
  const rows = useMemo(() => (serverSorted ? loaded : itemStockFallbackView(loaded, view)), [serverSorted, loaded, view]);

  const kpis = useMemo<KPIItem[] | undefined>(() => {
    const data = first.data;
    if (!data) return undefined;
    // The whole list's stock: from the server, or added up here once nothing is left to load.
    const stock = data.summary ? data.summary.total_stock : hasMore ? '—' : loaded.reduce((sum, item) => sum + item.total_stock, 0);
    return [
      { icon: 'cube-outline', value: data.pagination.totalCount, label: tr('common.items'), variant: 'primary' },
      { icon: 'warehouse', value: stock, label: tr('common.stock'), variant: 'primary' },
    ];
  }, [first.data, hasMore, loaded]);

  const canLoadMore = first.phase === 'ready' && hasMore && nextOffset === null;
  const loadMore = useCallback(() => {
    if (!canLoadMore) return;
    // The list may report its end twice before this is drawn: the page is asked for once.
    setLater(prev => {
      const base = prev.listId === listId ? prev : noLaterPages(listId);
      return base.next !== null ? base : { ...base, next: received };
    });
  }, [canLoadMore, listId, received]);

  const footerState: ReportLoadMoreState =
    nextOffset !== null ? (more.error ? 'failed' : 'loading') : canLoadMore ? 'more' : 'none';

  // The GRNs of an opened item. A new search or a refresh closes the cards and reads them again.
  const [drillGeneration, setDrillGeneration] = useState(0);
  const drill = useItemGRNs(customerId, `${searchQuery ?? ''}|${drillGeneration}`);

  // A pull to refresh reads the first page again and starts the list over from it.
  const { refresh: refreshFirst } = first;
  const refresh = useCallback(() => {
    setLater(noLaterPages(listId));
    setDrillGeneration(generation => generation + 1);
    refreshFirst();
  }, [listId, refreshFirst]);
  const query = { ...first, refresh };
  const extraData = useMemo(() => ({ drill, words: view.words }), [drill, view.words]);

  const renderRow = useCallback(
    (item: ItemWiseStockItem) => (
      <StockItemCard
        name={item.item_name}
        packaging={item.packaging}
        grnCount={item.grn_count}
        stock={item.total_stock}
        total={item.total_qty}
        lowStock={isLowStock(item.total_stock, item.total_qty)}
        isExpanded={drill.isOpen(item.item_id)}
        onToggle={() => drill.toggle(item.item_id)}
        grns={drill.state(item.item_id)}
        emptyGRNsText={tr('reports.itemStockSummary.noGrnsInStock')}
        onOpenGRN={openGRN}
        highlightWords={view.words}
        style={styles.card}
      />
    ),
    [drill, styles, view.words]
  );

  // The PDF is of the whole list in the chosen order (the server does not search it).
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => ({ report: REPORT_ID, ...(customerId ? { customer_id: customerId } : {}), sort: pdfSort(view.sort) }),
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      // Left out once the facility's server has said it cannot make report PDFs.
      ...(available ? [{ icon: 'file-pdf-box', label: tr('reports.export.sharePdf'), busy, onPress: () => void exportPdf() }] : []),
    ],
    [onChangeCustomer, available, busy, exportPdf]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.itemStockSummary')}
      subtitle={subtitle}
      actions={actions}
      filters={{ config: ITEM_STOCK, state: filters }}
      query={query}
      kpis={kpis}
      status={{ shown: rows.length, total }}
      rows={rows}
      renderRow={renderRow}
      keyExtractor={itemKey}
      extraData={extraData}
      onEndReached={loadMore}
      footer={
        <ReportLoadMoreFooter
          state={footerState}
          loadingText={tr('reports.itemStockSummary.loadingMore')}
          failedText={tr('reports.itemStockSummary.loadMoreError')}
          reason={more.error}
          moreLabel={tr('reports.itemStockSummary.loadMore')}
          onLoadMore={loadMore}
          onRetry={more.retry}
        />
      }
      noun="items"
      empty={{ icon: 'cube-outline', title: tr('reports.shared.noStockYet'), description: tr('reports.itemStockSummary.itemsAppear') }}
      errorTitle={tr('reports.itemStockSummary.errorTitle')}
    />
  );
}

// ============================================================================
// The GRNs of an item, read when its card opens
// ============================================================================

/** The GRNs of an item as the shared card draws them. */
const grnRows = (grns: GRNItem[]): StockGRNRowData[] =>
  grns.map((grn, index) => ({
    key: `${grn.grn_id || grn.id}-${index}`,
    grnId: grn.grn_id || grn.id || null,
    grNo: grn.gr_no,
    packageMark: grn.package_mark,
    customerName: grn.customer_name,
    receivedDate: grn.date,
    rack: grn.rack,
    weight: grn.weight,
    stock: grn.stock,
    total: grn.qty,
  }));

const openGRN = (grnId: string) => router.push(`/grn-details/${grnId}`);

type GRNLoad = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; rows: StockGRNRowData[] };
interface DrillState {
  /** The search and refresh the opened cards belong to: a new one closes them and reads again. */
  key: string;
  open: ReadonlySet<string>;
  grns: Readonly<Record<string, GRNLoad>>;
}
const closedDrill = (key: string): DrillState => ({ key, open: new Set(), grns: {} });

/**
 * Which cards are open and the GRNs of each. A failed load is kept as a
 * failure, never as "no GRNs": "Try again" or opening the card again reads
 * once more. A load that answered, even with no GRNs, is kept.
 */
function useItemGRNs(customerId: string | undefined, key: string) {
  const [stored, setStored] = useState<DrillState>(() => closedDrill(key));
  const drill = useMemo(() => (stored.key === key ? stored : closedDrill(key)), [stored, key]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const update = useCallback(
    (change: (state: DrillState) => DrillState) => setStored(prev => change(prev.key === key ? prev : closedDrill(key))),
    [key]
  );

  const read = useCallback(
    async (itemId: string) => {
      update(state => ({ ...state, grns: { ...state.grns, [itemId]: { status: 'loading' } } }));
      const drillDown = { p_filters: { item_ids: [itemId], stock_status: 'in_stock' as const }, p_limit: 100 };
      let answer: GRNLoad;
      try {
        const response = customerId ? await getCustomerGRNItems(customerId, drillDown) : await getAllGRNItems(drillDown);
        answer = response.success && response.data?.items ? { status: 'loaded', rows: grnRows(response.data.items) } : { status: 'failed' };
      } catch {
        answer = { status: 'failed' };
      }
      if (live.current) update(state => ({ ...state, grns: { ...state.grns, [itemId]: answer } }));
    },
    [customerId, update]
  );

  return useMemo(
    () => ({
      isOpen: (itemId: string) => drill.open.has(itemId),
      toggle: (itemId: string) => {
        const opening = !drill.open.has(itemId);
        update(state => {
          const open = new Set(state.open);
          if (open.has(itemId)) open.delete(itemId);
          else open.add(itemId);
          return { ...state, open };
        });
        const known = drill.grns[itemId];
        if (opening && (!known || known.status === 'failed')) void read(itemId);
      },
      state: (itemId: string): StockGRNState => {
        const known = drill.grns[itemId];
        if (!known || known.status === 'loading') return { status: 'loading' };
        if (known.status === 'failed') return { status: 'failed', onRetry: () => void read(itemId) };
        return { status: 'loaded', rows: known.rows };
      },
    }),
    [drill, update, read]
  );
}
