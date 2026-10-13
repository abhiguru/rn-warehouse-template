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
 * to. Only the first page without a search is kept on the phone. A next page is
 * asked for only against a first page the facility gave in this run and is not
 * asking again for; a pull to refresh keeps the later pages until the new first
 * page has come, and keeps them when it fails. The later pages belong to the
 * first page they continue: when the first page is answered anew with other
 * contents (pulled, or asked again on its own), they are dropped and the next
 * page is asked for from the end of the new first page.
 *
 * Pages are asked for by offset, so an item that leaves stock (or enters it)
 * between two pages moves every later row by one: the next page would skip a live
 * item or repeat one. Every page carries the whole list's figures (the count, and
 * the Stock and Total quantity sums when the server sends them), so a later page
 * whose figures differ from the first page's shows that the list changed. It is
 * then not added: the first page is asked for again as a pull to refresh does,
 * and the list shows page one again once it has come (the pages after it are
 * dropped; the next scroll to the end asks for page two of the new list). The
 * restart is made at most twice for one list (the same customer, search and sort)
 * until the person pulls to refresh or a page arrives unchanged; after that a page
 * is added as it comes, so a facility that changes all the time cannot keep the
 * list restarting. An equal count with other Stock or Total quantity is a change
 * too; a swap that leaves all three figures as they were cannot be seen.
 *
 * The figures cover every item of the customer (§14.10). With a search typed
 * they stay those of every item, labelled "All items" and "All stock": from the
 * newest first page without the search held in memory, under any sort (each
 * carries the whole list's figures), or else from that first page in the
 * default order, asked for once. They are never the searched list's figures,
 * and the status line then says when they were read, not when the search was
 * answered; a pull to refresh reads them again with the searched list.
 *
 * A backend without migration 52 cannot sort: the items loaded so far are then
 * sorted here and a note says so while more remain, the Stock figure is shown
 * once every item is loaded, and the PDF is not offered (that backend has no
 * generate-report-pdf either).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import {
  ReportCustomerPicker,
  ReportNoCustomer,
  ReportScaffold,
  StockItemCard,
  isLowStock,
  type KPIItem,
  type ReportHeaderAction,
  type StockGRNRowData,
  type StockGRNState,
} from '@/components/reports';
import { ReportLoadMoreFooter, type ReportLoadMoreState } from '@/components/reports/ReportLoadMoreFooter';
import type { StockGRNMore } from '@/components/reports/StockItemCard';
import { ITEM_STOCK, itemStockFallbackView } from '@/features/filters/configs/reports/itemStock';
import { reportById } from '@/features/reports/reportRegistry';
import { reportPdfSort } from '@/features/reports/reportPdfSort';
import { exportHeaderActions } from '@/features/reports/reportActions';
import { useReportExport } from '@/features/reports/useReportExport';
import { useReportFilters } from '@/features/reports/useReportFilters';
import { useReportQuery } from '@/features/reports/useReportQuery';
import { useReportScope } from '@/features/reports/useReportScope';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { getAllGRNItems, getCustomerGRNItems, type GRNItem } from '@/services/grn-service';
import { reportPdfSearch } from '@/services/pdf-service';
import { StockService } from '@/services/stock-service';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { ItemWiseStockItem } from '@/types/stock.types';
import { formatNumber } from '@/utils/formatters';

const REPORT_ID = 'item-stock-summary';
/** Items per page; the server allows more, the style guide asks for 25 to 50 (§13.6). */
const ITEM_STOCK_PAGE_SIZE = 50;

type ItemPage = NonNullable<Awaited<ReturnType<typeof StockService.getItemWiseStockList>>['data']>;

const makeStyles = (t: ThemeTokens) => ({
  // A card per row, spaced by its own bottom margin; the list has no side padding of its own.
  card: { marginHorizontal: layout.marginCompact, marginBottom: space.sm },
  // Under the status line, in its words' size and colour.
  note: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: layout.marginCompact, paddingBottom: space.sm },
});

// ============================================================================
// Whose stock
// ============================================================================

export default function ItemStockSummaryScreen() {
  const scope = useReportScope(REPORT_ID);
  const { level } = scope;
  switch (level.kind) {
    case 'none':
      return <ReportNoCustomer title={tr('reports.titles.itemStockSummary')} />;
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

// ============================================================================
// The items
// ============================================================================

/**
 * The pages after the first, for the list (customer, search, sort) they were asked for and the
 * first page they continue (`basis`): a first page answered anew with other contents (a pull to
 * refresh, or the report asked again on its own) leaves them behind, as their offsets were
 * counted against the old one.
 */
interface LaterPages {
  listId: string;
  basis: ItemPage | undefined;
  pages: ItemPage[];
  /** The offset being asked for, or null when no further page is out. */
  next: number | null;
  /** How many times in a row the list was started over because a page showed it had changed. */
  restarts: number;
}
const noLaterPages = (listId: string, basis: ItemPage | undefined, restarts = 0): LaterPages => ({ listId, basis, pages: [], next: null, restarts });

/**
 * The later pages that continue `first` in the list `listId`: none for another list, and none
 * (the count of restarts carried on) once the first page is another answer than the one they continue.
 * The query hands back the same object for an answer equal to the last, so an unchanged first page keeps them.
 */
function laterPagesOf(later: LaterPages, listId: string, first: ItemPage | undefined): LaterPages {
  if (later.listId !== listId) return noLaterPages(listId, first);
  return later.basis === first ? later : noLaterPages(listId, first, later.restarts);
}

/** A list is started over this many times in a row; after that the pages that arrive are added as they come. */
const MAX_AUTOMATIC_RESTARTS = 2;

/**
 * Whether the list changed between the first page and a later one. Every page carries
 * the figures of the whole list: its count and, from a server with migration 52, the
 * Stock and Total quantity sums (an older server sends no summary: the count alone).
 */
function listChanged(first: ItemPage, later: ItemPage): boolean {
  if (first.pagination.totalCount !== later.pagination.totalCount) return true;
  const { summary: before } = first;
  const { summary: after } = later;
  return !!before && !!after && (before.total_stock !== after.total_stock || before.total_qty !== after.total_qty);
}

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

/** The figures of every item, and when the facility gave them. */
interface WholeListAnswer {
  data: ItemPage;
  updatedAt: number;
}

/**
 * The newest first page without a search held in memory for `scopeKey` (whose items), under
 * any sort: every first page carries the figures of the whole list, whatever its order. Read
 * where it is drawn; a change to it does not draw again by itself (`peekReportAnswer`).
 */
function newestWholeListAnswer(scopeKey: readonly unknown[]): WholeListAnswer | undefined {
  // ['report', ...scopeKey, search '', sort field, sort order, offset 0]
  const length = scopeKey.length + 5;
  let newest: WholeListAnswer | undefined;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['report', ...scopeKey, ''] })) {
    const { queryKey } = query;
    const data = query.state.data as ItemPage | undefined;
    if (queryKey.length !== length || queryKey[length - 1] !== 0 || data === undefined) continue;
    if (!newest || query.state.dataUpdatedAt > newest.updatedAt) newest = { data, updatedAt: query.state.dataUpdatedAt };
  }
  return newest;
}

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
  // One customer's search is that customer's alone (SR-06); the all-customers list keeps its own.
  const filters = useReportFilters(ITEM_STOCK, customerId ? { scope: customerId } : {});
  const { view, server } = filters.request;
  const { searchQuery, sortBy, sortOrder } = server;
  // Whose items, named as every report names it: a refusal of one customer drops all its keys.
  const scopeKey = useMemo(() => (customerId ? [REPORT_ID, 'customer', customerId] : [REPORT_ID, 'customers']), [customerId]);
  // Everything the rows depend on: a page of one list is never added to another.
  const listKey = useMemo(() => [...scopeKey, searchQuery ?? '', sortBy, sortOrder], [scopeKey, searchQuery, sortBy, sortOrder]);
  const listId = JSON.stringify(listKey);

  const askPage = (offset: number) =>
    StockService.getItemWiseStockList({ customerId, searchQuery, limit: ITEM_STOCK_PAGE_SIZE, offset, sortBy, sortOrder });

  const first = useReportQuery<ItemPage>({
    key: [...listKey, 0],
    fetch: () => askPage(0),
    fallbackError: tr('reports.itemStockSummary.loadError'),
    // A searched list is never shown from the phone, and would push other reports' answers out.
    persist: !searchQuery,
  });

  // With a search typed, the figures are those of every item (§14.10): the newest first page without
  // the search in memory, in any order; when there is none, that first page in the default order,
  // asked for once (kept on the phone, as the list without a search is). Never the searched figures.
  const wholeAnswer = searchQuery ? newestWholeListAnswer(scopeKey) : undefined;
  const summary = useReportQuery<ItemPage>({
    key: [...scopeKey, '', 'item_name', 'asc', 0],
    fetch: () => StockService.getItemWiseStockList({ customerId, limit: ITEM_STOCK_PAGE_SIZE, offset: 0, sortBy: 'item_name', sortOrder: 'asc' }),
    fallbackError: tr('reports.itemStockSummary.loadError'),
    enabled: !!searchQuery && !wholeAnswer,
  });
  const whole = wholeAnswer?.data;

  // The later pages of the list on screen. Kept with the list they belong to, so a new search
  // or sort starts again from its first page, and a page still loading for the old one (and
  // its "Loading more" footer) is gone with it.
  const [later, setLater] = useState<LaterPages>(() => noLaterPages(listId, undefined));
  const firstPage = first.data;
  const current = useMemo(() => laterPagesOf(later, listId, firstPage), [later, listId, firstPage]);
  const nextOffset = current.next;

  // The GRNs of an opened item. A new search or a refresh closes the cards and reads them again.
  const [drillGeneration, setDrillGeneration] = useState(0);

  // The first page read again, and the list started over from it once it has come; until then, and
  // when it fails, the pages after it stay where they are. A pull to refresh is this with a fresh
  // count of restarts; a list that changed under the person is this with the count carried on.
  // With a search typed, the figures of every item are read again beside it.
  const { refresh: refreshFirst } = first;
  const { refresh: refreshSummary } = summary;
  const searching = !!searchQuery;
  const reload = useCallback(
    (restartsSoFar: number) => {
      setDrillGeneration(generation => generation + 1);
      const listed = refreshFirst();
      if (searching) void refreshSummary();
      return listed.then(fresh => {
        // The pages are dropped whether or not the new first page differs; one that differs is left behind by `basis` too.
        if (fresh) setLater(prev => (prev.listId === listId ? noLaterPages(listId, prev.basis, restartsSoFar) : prev));
        return fresh;
      });
    },
    [listId, refreshFirst, refreshSummary, searching]
  );

  const more = useReportQuery<ItemPage>({
    key: [...listKey, nextOffset ?? 'none'],
    fetch: () => askPage(nextOffset ?? 0),
    // The footer already says "Couldn't load more items."; this is what to do.
    fallbackError: tr('common.checkConnection'),
    enabled: nextOffset !== null,
    // A later page is shown only after its own request has answered: never from the phone.
    persist: false,
    // A later page is never asked again on its own; a first page that changed drops it (`basis`).
    revalidateOnReturn: false,
  });
  // A page is added once its own request has answered: not a copy kept from earlier.
  const arrived = nextOffset !== null && !more.isFetching && !more.error ? more.data : undefined;
  // The page this effect last dealt with. The query hands back the same object when a page is asked for
  // again and comes back equal, so it is forgotten as soon as no page is waiting.
  const dealtWith = useRef<ItemPage | undefined>(undefined);
  const restarts = current.restarts;
  useEffect(() => {
    if (!arrived) {
      dealtWith.current = undefined;
      return;
    }
    if (dealtWith.current === arrived) return;
    dealtWith.current = arrived;
    // The list changed since the first page: its offsets no longer line up with this page. Adding it
    // would skip a live item or keep one that has left. Not added; the first page is read again.
    if (firstPage && restarts < MAX_AUTOMATIC_RESTARTS && listChanged(firstPage, arrived)) {
      // Nothing is waiting for a page now, whether or not the new first page comes: the footer cannot stay on "loading".
      setLater(prev =>
        prev.listId === listId && prev.basis === firstPage && prev.next === nextOffset ? { ...prev, next: null, restarts: restarts + 1 } : prev
      );
      void reload(restarts + 1);
      return;
    }
    // A page that fits the first one: the count of restarts starts again.
    setLater(prev =>
      prev.listId === listId && prev.basis === firstPage && prev.next === nextOffset
        ? { listId, basis: firstPage, pages: [...prev.pages, arrived], next: null, restarts: 0 }
        : prev
    );
  }, [arrived, firstPage, listId, nextOffset, restarts, reload]);

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
    const sum = (items: ItemWiseStockItem[]) => items.reduce((total, item) => total + item.total_stock, 0);
    if (searching) {
      // Every item's figures, or '—' until they have come: never the searched list's.
      const items = whole ? whole.pagination.totalCount : '—';
      const stock = whole
        ? (whole.summary?.total_stock ?? (whole.items.length >= whole.pagination.totalCount ? sum(whole.items) : '—'))
        : '—';
      return [
        { icon: 'cube-outline', value: items, label: tr('reports.itemStockSummary.allItems'), variant: 'primary' },
        { icon: 'warehouse', value: stock, label: tr('reports.itemStockSummary.allStock'), variant: 'primary' },
      ];
    }
    // The whole list's stock: from the server, or added up here once nothing is left to load.
    const stock = data.summary ? data.summary.total_stock : hasMore ? '—' : sum(loaded);
    return [
      { icon: 'cube-outline', value: data.pagination.totalCount, label: tr('common.items'), variant: 'primary' },
      { icon: 'warehouse', value: stock, label: tr('common.stock'), variant: 'primary' },
    ];
  }, [first.data, searching, whole, hasMore, loaded]);

  // The next page continues the first page the facility gave now: not the phone's copy, and
  // not while that page is being asked for again (it may come back different).
  const canLoadMore = first.phase === 'ready' && !first.isFetching && !first.isKeptCopy && hasMore && nextOffset === null;
  const loadMore = useCallback(() => {
    if (!canLoadMore) return;
    // The list may report its end twice before this is drawn: the page is asked for once.
    // Asked against the first page on screen: the page is added only while that first page stays.
    setLater(prev => {
      const base = laterPagesOf(prev, listId, firstPage);
      return base.next !== null ? base : { ...base, next: received };
    });
  }, [canLoadMore, listId, received, firstPage]);

  const footerState: ReportLoadMoreState =
    nextOffset !== null ? (more.error ? 'failed' : 'loading') : canLoadMore ? 'more' : 'none';

  const drill = useItemGRNs(customerId, `${searchQuery ?? ''}|${drillGeneration}`);

  // A pull to refresh reads the first page again and starts the list over from it (`reload`).
  const refresh = useCallback(() => reload(0), [reload]);
  // With a search typed the status line says when the figures were read, not when the search was answered.
  const query = { ...first, refresh, updatedAt: searching ? wholeAnswer?.updatedAt : first.updatedAt };
  const extraData = useMemo(() => ({ drill, words: view.words }), [drill, view.words]);

  const renderRow = useCallback(
    (item: ItemWiseStockItem) => {
      const grns = drill.state(item.item_id);
      // The drill-down reads GRN_LIMIT lines at a time: say how many are shown while more remain.
      // Lines, not GRNs: one GRN can hold the item in several lines, so the item's GRN count is no total.
      const lines = drill.lines(item.item_id);
      const grnsFooter =
        grns.status === 'loaded' && lines
          ? lines.total !== undefined && lines.total > grns.rows.length
            ? tr('reports.itemStockSummary.grnLinesOf', { shown: formatNumber(grns.rows.length), total: formatNumber(lines.total) })
            : lines.hasMore
              ? tr('reports.itemStockSummary.grnLinesShown', { shown: formatNumber(grns.rows.length) })
              : undefined
          : undefined;
      return (
        <StockItemCard
          name={item.item_name}
          packaging={item.packaging}
          grnCount={item.grn_count}
          stock={item.total_stock}
          total={item.total_qty}
          lowStock={isLowStock(item.total_stock, item.total_qty)}
          isExpanded={drill.isOpen(item.item_id)}
          onToggle={() => drill.toggle(item.item_id)}
          grns={grns}
          emptyGRNsText={tr('reports.itemStockSummary.noGrnsInStock')}
          grnsFooter={grnsFooter}
          grnsMore={drill.more(item.item_id)}
          onOpenGRN={openGRN}
          highlightWords={view.words}
          style={styles.card}
        />
      );
    },
    [drill, styles, view.words]
  );

  // Sorted here among the items loaded, while more remain: say so. The name order A to Z is the
  // order the server pages in, so it is true of the whole list.
  const sortedHere = !serverSorted && hasMore && !!view.sort && !(view.sort.field === 'item_name' && view.sort.order === 'asc');

  // The PDF is of the list on screen in the chosen order: the server searches it as it searched the rows.
  // A search it would refuse (longer than 80 characters) is left out, and the person is told before the export.
  // Read at the tap, as the rest of the request is.
  const { exportPdf, busy, available } = useReportExport({
    buildRequest: () => {
      const search = reportPdfSearch(searchQuery);
      return {
        report: REPORT_ID,
        ...(customerId ? { customer_id: customerId } : {}),
        sort: reportPdfSort(REPORT_ID, customerId ? 'customer' : 'customers', view.sort),
        ...(search && { search }),
      };
    },
    filenameParts: () => ({ title: reportById(REPORT_ID)?.title, customerName }),
    unappliedSearch: () => (searchQuery && !reportPdfSearch(searchQuery) ? { query: searchQuery, count: total ?? rows.length } : null),
  });
  const actions = useMemo<ReportHeaderAction[]>(
    () => [
      ...(onChangeCustomer ? [{ icon: 'account-switch-outline', label: tr('reports.shared.changeCustomer'), onPress: onChangeCustomer }] : []),
      // Left out once the facility's server has said it cannot make report PDFs, and for a server
      // that cannot sort the list (older than migration 52, so without generate-report-pdf too).
      ...(serverSorted ? exportHeaderActions({ exportPdf, busy, available }) : []),
    ],
    [onChangeCustomer, available, serverSorted, busy, exportPdf]
  );

  return (
    <ReportScaffold
      title={tr('reports.titles.itemStockSummary')}
      subtitle={subtitle}
      actions={actions}
      filters={{ config: ITEM_STOCK, state: filters }}
      // The search is sent to the server: the field shows a spinner while it is answered.
      searchIsServerSide
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
    >
      {sortedHere ? (
        <Text style={styles.note}>{tr('reports.itemStockSummary.sortedAmongLoaded', { count: formatNumber(loaded.length) })}</Text>
      ) : null}
    </ReportScaffold>
  );
}

// ============================================================================
// The GRNs of an item, read when its card opens
// ============================================================================

/** The GRN lines of an item as the shared card draws them; `offset`: where they start among the lines read. */
const grnRows = (grns: GRNItem[], offset: number): StockGRNRowData[] =>
  grns.map((grn, index) => ({
    key: `${grn.grn_id || grn.id}-${offset + index}`,
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

/** GRN lines read for one item at a time; "Show more GRN lines" reads the next as many. */
const GRN_LIMIT = 100;

/** Whether the next lines of an item are being read, or the last try failed. */
type GRNMore = 'idle' | 'loading' | 'failed';

/**
 * The GRN lines of an item. `received`: the lines the server sent so far, duplicates included,
 * where the next request starts. `total`: the lines the item has in all, when the server said.
 */
type GRNLoad =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; rows: StockGRNRowData[]; ids: ReadonlySet<string>; received: number; total?: number; hasMore: boolean; more: GRNMore };
interface DrillState {
  /** The search and refresh the opened cards belong to: a new one closes them and reads again. */
  key: string;
  open: ReadonlySet<string>;
  grns: Readonly<Record<string, GRNLoad>>;
}
const closedDrill = (key: string): DrillState => ({ key, open: new Set(), grns: {} });

/** One page of an item's GRN lines, as the drill-down read it. */
interface GRNPage {
  items: GRNItem[];
  total?: number;
  hasMore: boolean;
}

/** The line's own id (one item on one GRN), for telling a line sent twice from two lines of one GRN. */
const lineId = (grn: GRNItem): string => grn.id || grn.grn_item_id || '';

/**
 * Which cards are open and the GRN lines of each. A failed load is kept as a
 * failure, never as "no GRNs": "Try again" or opening the card again reads
 * once more. A load that answered, even with no GRNs, is kept.
 *
 * The lines are read GRN_LIMIT at a time by offset, newest first, as the GRN
 * services page them: the next lines are asked for from the number already
 * received. A line received twice is shown once. That order is not tie-stable
 * (lines of one day may change places between two requests), and a line that
 * enters or leaves stock between them moves the rest by one, so a line can be
 * skipped or come twice; the count and "Showing N of M" say what was read.
 * A failure to read more keeps the lines read and offers "Try again".
 */
function useItemGRNs(customerId: string | undefined, key: string) {
  const [stored, setStored] = useState<DrillState>(() => closedDrill(key));
  const drill = useMemo(() => (stored.key === key ? stored : closedDrill(key)), [stored, key]);
  // The search and refresh on screen now, for a load that answers after they have changed.
  const currentKey = useRef(key);
  currentKey.current = key;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // A change made for `key`. Once the search or a refresh has moved on, a change for the old key
  // (a GRN load answering late) changes nothing: the cards opened since stay as they are.
  const update = useCallback(
    (change: (state: DrillState) => DrillState) =>
      setStored(prev => {
        if (prev.key === key) return change(prev);
        return key === currentKey.current ? change(closedDrill(key)) : prev;
      }),
    [key]
  );

  /** GRN_LIMIT lines of the item from `offset`, or undefined when they could not be read. */
  const fetchPage = useCallback(
    async (itemId: string, offset: number): Promise<GRNPage | undefined> => {
      const drillDown = {
        p_filters: { item_ids: [itemId], stock_status: 'in_stock' as const },
        p_limit: GRN_LIMIT,
        ...(offset > 0 ? { p_offset: offset } : {}),
      };
      try {
        const response = customerId ? await getCustomerGRNItems(customerId, drillDown) : await getAllGRNItems(drillDown);
        const items = response.data?.items;
        if (!response.success || !items) return undefined;
        const pagination = response.data?.pagination;
        const count = pagination?.total_count;
        const total = typeof count === 'number' && count > 0 ? count : undefined;
        const received = offset + items.length;
        // One customer's lines say whether more remain; every customer's give a total, else a full page may have more.
        const hasMore =
          items.length > 0 &&
          (customerId && typeof pagination?.has_more === 'boolean'
            ? pagination.has_more
            : total !== undefined
              ? received < total
              : items.length >= GRN_LIMIT);
        return { items, total, hasMore };
      } catch {
        return undefined;
      }
    },
    [customerId]
  );

  const read = useCallback(
    async (itemId: string) => {
      update(state => ({ ...state, grns: { ...state.grns, [itemId]: { status: 'loading' } } }));
      const page = await fetchPage(itemId, 0);
      const answer: GRNLoad = page
        ? {
            status: 'loaded',
            rows: grnRows(page.items, 0),
            ids: new Set(page.items.map(lineId).filter(Boolean)),
            received: page.items.length,
            total: page.total,
            hasMore: page.hasMore,
            more: 'idle',
          }
        : { status: 'failed' };
      if (live.current) update(state => ({ ...state, grns: { ...state.grns, [itemId]: answer } }));
    },
    [fetchPage, update]
  );

  // The next lines of an item whose lines are shown, added under them. A failure keeps the lines.
  const readMore = useCallback(
    async (itemId: string) => {
      const known = drill.grns[itemId];
      if (known?.status !== 'loaded' || !known.hasMore || known.more === 'loading') return;
      const offset = known.received;
      // Only to the lines the request was made for: not to lines read again since (a new search or refresh).
      const extend = (change: (load: Extract<GRNLoad, { status: 'loaded' }>) => GRNLoad) =>
        update(state => {
          const load = state.grns[itemId];
          if (load?.status !== 'loaded' || load.received !== offset) return state;
          return { ...state, grns: { ...state.grns, [itemId]: change(load) } };
        });
      extend(load => ({ ...load, more: 'loading' }));
      const page = await fetchPage(itemId, offset);
      if (!live.current) return;
      if (!page) {
        extend(load => ({ ...load, more: 'failed' }));
        return;
      }
      extend(load => {
        const ids = new Set(load.ids);
        const fresh = page.items.filter(grn => {
          const id = lineId(grn);
          if (!id) return true;
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        });
        return {
          ...load,
          rows: [...load.rows, ...grnRows(fresh, offset)],
          ids,
          received: offset + page.items.length,
          total: page.total ?? load.total,
          hasMore: page.hasMore,
          more: 'idle',
        };
      });
    },
    [drill, fetchPage, update]
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
      /** The GRN lines the item has in all (when the server said) and whether more remain to be read. */
      lines: (itemId: string): { total?: number; hasMore: boolean } | undefined => {
        const known = drill.grns[itemId];
        return known?.status === 'loaded' ? { total: known.total, hasMore: known.hasMore } : undefined;
      },
      /** "Show more GRN lines" under the item's lines while more remain; undefined when there are none to read. */
      more: (itemId: string): StockGRNMore | undefined => {
        const known = drill.grns[itemId];
        if (known?.status !== 'loaded' || !known.hasMore) return undefined;
        return {
          state: known.more === 'loading' ? 'loading' : known.more === 'failed' ? 'failed' : 'more',
          onLoadMore: () => void readMore(itemId),
          onRetry: () => void readMore(itemId),
        };
      },
    }),
    [drill, update, read, readMore]
  );
}
