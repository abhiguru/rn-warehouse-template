/**
 * GRNListFiori - the GRN tab's list report (style guide 14.1)
 *
 * - The shared list header (FilteredListHeader: title, expand all, search, filter bar), shown in every state
 * - Object cells (13.6) with the stock tag (3.5); an open cell shows its lines as a nested table (13.7)
 * - Pages of whole receipts (backend migration 98; a facility without it pages lines, as before)
 * - Shared states: skeleton, empty and filtered-empty, error, stale rows, failed next page, offline (14.9)
 * - Swipe actions only for the roles that have them, also offered to screen readers (13.6)
 * - Which cells are open is kept by the list, so a recycled cell never shows another GRN's state
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  FlattenedItem,
  flattenSections,
  getItemType,
  DEFAULT_LIST_CONFIG,
} from '@/components/lists/types';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  countReceipts,
  getAllGRNItems,
  getAssignedCustomerGRNItems,
  withReceiptPages,
  GRNItem,
  GRNListResponse,
} from '@/services/grn-service';
import { useAppSelector } from '@/store/hooks';
import { usePermissions } from '@/hooks/usePermissions';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import PrintJobsBottomSheet, { PrintJobsBottomSheetRef } from '@/components/PrintJobsBottomSheet';
import { printGRNRange } from '@/services/print-service';
import { getGRNStockStatus, type GRNStockStatus } from '@/features/grn/utils/grnStockStatus';
import { grnLineKey } from '@/features/grn/utils/grnLineKey';
import { StatusTag } from '@/components/ui';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { ListSkeleton } from '@/components/skeletons';
import { LastUpdatedLine, LoadMoreErrorFooter, StaleListStrip } from '@/components/lists/ListLoadErrors';
import { createAppColumnHelper, useAppTable } from '@/components/table/appTable';
import { DataTable } from '@/components/table/DataTable';
import {
  CUT_LINE,
  crowded,
  lastColumnAlone,
  makeTableStyles,
  nb,
  nestedRowWidth,
  numberColumnWidth,
  useTableLayout,
  type TableLayout,
} from '@/components/common/DetailTable';
import { createLogger } from '@/utils/logger';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { animateExpand } from '@/utils/layoutMotion';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, singleLineText, space } from '@/theme/tokens';

// Filters, search and sort (docs/STYLE_GUIDE.md §14.5)
import { GRN_FILTERS } from '@/features/filters/configs';
import { grnLinesHidden } from '@/features/filters/configs/grn';
import { useListFilters } from '@/features/filters/useListFilters';
import { readSearch } from '@/features/filters/filterModel';
import { FilteredListHeader, filteredEmptyProps } from '@/features/filters/components/FilteredListHeader';
import { HighlightedText, matchesAnyWord, searchWords } from '@/features/filters/components/HighlightedText';

// Styles
import { makeGRNListStyles, type GRNListStyles } from './GRNListFiori.styles';

// Shared formatters
import { formatSectionDate, formatNumber, formatCount, formatDate, formatSpokenDate, formatTime, formatWeightEach } from '@/utils/formatters';

import { Fab } from '@/components/ui/Fab';
import { t as translate, formatIdentifier } from '@/i18n';
const logger = createLogger('GRNListFiori');

/** Receipts on the first page and on each later one. A facility that pages lines gets 20, then 80 lines. */
const PAGE_SIZE = 20;
const LINE_PAGE_SIZE = 80;

/** Row title. A receipt saved without a number says so instead of showing a bare "GRN". */
const grnTitle = (grNo: string) => (grNo.trim() ? translate('lists.grn.cardTitle', { number: formatIdentifier(grNo) }) : translate('lists.grn.noNumber'));

/** Status when nothing was received (no quantity to judge stock against). Built when drawn, so it follows the language. */
const noQuantityStatus = (): GRNStockStatus => ({ status: 'neutral', label: translate('lists.grn.noQuantity'), icon: 'circle-outline' });

/** Stock status of a GRN or item: fully dispatched is neutral, then the app low-stock rule. */
const stockStatusFor = (stock: number, qty: number): GRNStockStatus =>
  getGRNStockStatus(stock, qty) ?? noQuantityStatus();

/** "120 of 200 bags": what is left of what was received (style guide 13.5, StockIndicator). */
const stockText = (stock: number, qty: number) =>
  qty > 0
    // "9,999 bags" keeps its unit at a line break: a wrap falls after "of" (phone run GL, 2026-10-18).
    ? translate('components.stock.currentOfTotal', { current: formatNumber(stock), total: nb(formatCount(qty, 'bag')) })
    : nb(formatCount(stock, 'bag'));

/** Whole kilograms, as the column always showed. A line without a weight has none to show or say. */
const kgEachOf = (item: GRNItem) => Math.round(item.weight || 0);

// Type for grouped GRN data
interface GRNGroupData {
  grnId: string;
  grNo: string;
  date: string;
  registration?: string;
  customerName: string;
  items: GRNItem[];
}

/**
 * Which cells are open: every cell, or none, apart from the ones the user flipped. Kept by the list, not
 * by each cell, because FlashList reuses a cell's component for another GRN as the list scrolls.
 */
interface OpenState {
  all: boolean;
  flipped: ReadonlySet<string>;
}
const isOpen = (open: OpenState, grnId: string) => open.all !== open.flipped.has(grnId);

/** Where a search matched inside a collapsed card: item, package or rack names. */
function hiddenMatches(group: GRNGroupData, words: string[]): string[] {
  if (words.length === 0) return [];
  const found = new Set<string>();
  for (const item of group.items) {
    for (const text of [item.item_name, item.package_mark, item.rack]) {
      if (text && matchesAnyWord(text, words)) found.add(text);
    }
  }
  return [...found].slice(0, 3);
}

// ============================================================================
// THE LINES OF AN OPEN CARD (nested table, style guide 13.7)
// ============================================================================
const lineHelper = createAppColumnHelper<GRNItem>();
/** Number columns at font scale 1, grown with the text and the widest value (`numberColumnWidth`). */
const BAGS_WIDTH = 48;
/** 72: room for the Gujarati heading "દરેકના kg" on one line (2026-10-14, e8d3fe9). */
const KG_WIDTH = 72;
const STOCK_WIDTH = 52;

/**
 * The columns of an open card's lines table (§13.7): Item | Bags | Kg each | Stock. When they would crowd the
 * item (or from font scale 1.5) "Kg each" moves under it; if Bags and Stock still crowd it, Bags moves too; and a
 * Stock that would still crowd the item, or take too much of the row, goes under the item as well (right-aligned).
 */
export function grnLinesLayout(
  screen: Pick<TableLayout, 'stacked' | 'scale' | 'width'>,
  bagsWidth: number,
  kgWidth: number,
  stockWidth: number
): { kgUnder: boolean; bagsUnder: boolean; stockUnder: boolean } {
  const row = nestedRowWidth(screen);
  const kgUnder = screen.stacked || crowded(row, [bagsWidth, kgWidth, stockWidth], 0, screen.scale);
  const bagsUnder = kgUnder && crowded(row, [bagsWidth, stockWidth], 0, screen.scale);
  const stockUnder = bagsUnder && lastColumnAlone(row, stockWidth, screen.scale);
  return { kgUnder, bagsUnder, stockUnder };
}

const GRNLinesTable = memo<{ items: GRNItem[]; styles: GRNListStyles; testID?: string }>(({ items, styles, testID }) => {
  const table = useThemedStyles(makeTableStyles);
  const screen = useTableLayout();
  const kgText = (item: GRNItem) => (kgEachOf(item) > 0 ? formatNumber(kgEachOf(item)) : '—');
  // The columns are drawn `space.xs` wider than the estimate, and the layout counts that margin, so an
  // estimate a little short never cuts a figure (it is never shrunk either).
  const bagsWidth = numberColumnWidth(screen, BAGS_WIDTH, items.map(item => formatNumber(item.qty || 0)));
  const kgWidth = numberColumnWidth(screen, KG_WIDTH, items.map(kgText));
  const stockWidth = numberColumnWidth(screen, STOCK_WIDTH, items.map(item => formatNumber(item.stock || 0)));
  // At large text, or when the figures would crowd the item, "Kg each" moves under the item.
  const { kgUnder, bagsUnder, stockUnder } = grnLinesLayout(screen, bagsWidth + space.xs, kgWidth + space.xs, stockWidth + space.xs);

  const columns = useMemo(
    () =>
      lineHelper.columns([
        lineHelper.display({
          id: 'item',
          header: translate('common.item'),
          meta: { width: 'grow' },
          cell: ({ row }) => {
            const item = row.original;
            const status = stockStatusFor(item.stock, item.qty);
            const weight = kgUnder ? formatWeightEach(kgEachOf(item)) : null;
            const mark = item.package_mark || null;
            return (
              <>
                <Text style={table.primary}>{item.item_name}</Text>
                {/* A long mark is cut at the normal size, never wrapped by letters (§13.7); the full mark is in the row's label. */}
                {mark ? <Text style={table.secondary} {...CUT_LINE}>{nb(mark)}</Text> : null}
                {weight ? <Text style={table.secondary}>{nb(weight)}</Text> : null}
                {bagsUnder ? <Text style={table.secondary} numberOfLines={1}>{nb(formatCount(item.qty || 0, 'bag'))}</Text> : null}
                {/* The line's status only when it is not In stock: a word under the item, never a cut figure. */}
                {status.status !== 'positive' ? (
                  <StatusTag status={status.status} label={status.label} icon={status.icon} wrap style={styles.lineTag} />
                ) : null}
                {stockUnder ? <Text style={table.number} numberOfLines={1}>{formatNumber(item.stock || 0)}</Text> : null}
              </>
            );
          },
        }),
        ...(bagsUnder
          ? []
          : [
              lineHelper.display({
                id: 'bags',
                header: translate('common.bags'),
                meta: { width: bagsWidth + space.xs, numeric: true },
                cell: ({ row }) => <Text style={table.number} numberOfLines={1}>{formatNumber(row.original.qty || 0)}</Text>,
              }),
            ]),
        ...(kgUnder
          ? []
          : [
              lineHelper.display({
                id: 'kgEach',
                header: translate('lists.card.colKgEach'),
                meta: { width: kgWidth + space.xs, numeric: true },
                cell: ({ row }) => <Text style={table.number} numberOfLines={1}>{kgText(row.original)}</Text>,
              }),
            ]),
        lineHelper.display({
          id: 'stock',
          header: translate('common.stock'),
          // Under the item the stock has no column of its own, only its heading over the end of the row.
          meta: { width: stockUnder ? 'auto' : stockWidth + space.xs, numeric: true, headerOnly: stockUnder },
          cell: ({ row }) => <Text style={table.number} numberOfLines={1}>{formatNumber(row.original.stock || 0)}</Text>,
        }),
      ]),
    // kgText reads only its argument.
    [kgUnder, bagsUnder, stockUnder, bagsWidth, kgWidth, stockWidth, table, styles]
  );
  const grid = useAppTable({ data: items, columns, getRowId: (item, index) => item.grn_item_id || `${item.id}-${index}` });

  return (
    <DataTable
      table={grid}
      variant="nested"
      headerOneLine={false}
      rowStyle={styles.lineCompact}
      rowLabel={(row) => {
        const item = row.original;
        const status = stockStatusFor(item.stock, item.qty);
        return [
          item.item_name,
          item.package_mark,
          formatCount(item.qty || 0, 'bag'),
          formatWeightEach(kgEachOf(item)),
          translate('lists.grn.itemStock', { stock: formatNumber(item.stock || 0), status: status.label }),
        ].filter(Boolean).join(', ');
      }}
      rowTestID={(row) => `grn-line-${row.id}`}
      testID={testID}
    />
  );
});

GRNLinesTable.displayName = 'GRNLinesTable';

// ============================================================================
// GRN CARD (object cell)
// ============================================================================
interface GRNCardProps {
  group: GRNGroupData;
  expanded: boolean;
  onToggle: (grnId: string) => void;
  onPress: (group: GRNGroupData) => void;
  /** Absent for a role that cannot edit: no Edit action, in the swipe or for a screen reader. */
  onEdit?: (group: GRNGroupData) => void;
  /** Absent for a role that cannot print. */
  onPrint?: (group: GRNGroupData) => void;
  styles: GRNListStyles;
  /** Lower-cased search words to show in bold. */
  words: string[];
  /** A line-level filter is on: the card shows only the matching items of the GRN (R1-02). */
  linesHidden: boolean;
}

const GRNCardFiori = memo<GRNCardProps>(({
  group,
  expanded,
  onToggle,
  onPress,
  onEdit,
  onPrint,
  styles,
  words,
  linesHidden,
}) => {
  const t = useTokens();
  const reduceMotion = useReducedMotion();
  const matched = hiddenMatches(group, words);
  const swipeableRef = useRef<SwipeableMethods>(null);

  // Totals of the receipt: bags received and bags in stock. A total weight is
  // not shown (style guide 12.3); the open table has each line's "Kg each".
  const totalQty = group.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalStock = group.items.reduce((sum, item) => sum + (item.stock || 0), 0);

  const stockStatus = stockStatusFor(totalStock, totalQty);
  const stock = stockText(totalStock, totalQty);
  const displayDate = formatDate(group.date);
  // Under a line-level filter the items, bags and tag are those of the matching lines only, and the card says so.
  const itemCountLabel = linesHidden
    ? translate('lists.grn.matchingItems', { count: group.items.length })
    : formatCount(group.items.length, 'item');
  const filteredNote = linesHidden ? translate('lists.grn.filteredNote') : null;
  const title = grnTitle(group.grNo);

  // The same actions for the swipe and for a screen reader (style guide 13.6).
  const actions = [
    onPrint ? { name: 'print', label: translate('common.print') } : null,
    onEdit ? { name: 'edit', label: translate('common.edit') } : null,
  ].filter((action): action is { name: string; label: string } => action !== null);

  const runAction = (name: string) => {
    swipeableRef.current?.close();
    if (name === 'view') onPress(group);
    else if (name === 'edit') onEdit?.(group);
    else if (name === 'print') onPrint?.(group);
  };

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      {onPrint && (
        <Pressable
          style={({ pressed }) => [styles.swipeButton, styles.swipeSecondary, pressed && styles.swipeSecondaryPressed]}
          onPress={() => runAction('print')}
          accessibilityRole="button"
          accessibilityLabel={translate('lists.grn.printLabel', { title })}
        >
          <Icon name="printer-outline" size={iconSize.lg} color={t.icon.primary} />
          <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>{translate('common.print')}</Text>
        </Pressable>
      )}
      <Pressable
        style={({ pressed }) => [styles.swipeButton, styles.swipeSecondary, pressed && styles.swipeSecondaryPressed]}
        onPress={() => runAction('view')}
        accessibilityRole="button"
        accessibilityLabel={translate('lists.grn.viewLabel', { title })}
      >
        <Icon name="eye-outline" size={iconSize.lg} color={t.icon.primary} />
        <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>{translate('common.view')}</Text>
      </Pressable>
      {onEdit && (
        <Pressable
          style={({ pressed }) => [styles.swipeButton, styles.swipePrimary, pressed && styles.swipePrimaryPressed]}
          onPress={() => runAction('edit')}
          accessibilityRole="button"
          accessibilityLabel={translate('lists.grn.editLabel', { title })}
        >
          <Icon name="pencil-outline" size={iconSize.lg} color={t.brand.onFill} />
          <Text style={[styles.swipeText, styles.swipeTextOnFill]} maxFontSizeMultiplier={1.6}>{translate('common.edit')}</Text>
        </Pressable>
      )}
    </View>
  );

  const card = (
    <View style={styles.card}>
      <View style={styles.cardContentWrapper}>
        {/* Object cell row */}
        <Pressable
          onPress={() => onPress(group)}
          style={({ pressed }) => [styles.objectCellRow, pressed && styles.cardPressed]}
          accessibilityRole="button"
          accessibilityLabel={[
            title,
            group.customerName,
            formatSpokenDate(group.date),
            group.registration,
            itemCountLabel,
            stock,
            stockStatus.label,
            filteredNote,
            matched.length > 0 ? translate('lists.card.matched', { matches: matched.join(', ') }) : null,
          ].filter(Boolean).join(', ')}
          accessibilityHint={translate(actions.length > 0 ? 'lists.grn.openHintActions' : 'lists.grn.openHint')}
          accessibilityActions={actions.length > 0 ? actions : undefined}
          onAccessibilityAction={actions.length > 0 ? event => runAction(event.nativeEvent.actionName) : undefined}
          testID={`grn-card-${group.grnId}`}
        >
          {/* Main content */}
          <View style={styles.mainContent}>
            <HighlightedText style={styles.titleText} numberOfLines={2} text={title} words={words} />
            <HighlightedText style={styles.subtitleText} numberOfLines={2} text={group.customerName ?? ''} words={words} />

            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.footerText} {...singleLineText()}>{displayDate}</Text>
              </View>
              {group.registration && (
                <>
                  <View style={styles.footerDot} />
                  <View style={styles.footerItem}>
                    <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                    <HighlightedText style={styles.footerText} text={group.registration} words={words} />
                  </View>
                </>
              )}
              <View style={styles.footerDot} />
              <Text style={styles.footerText} {...singleLineText()}>{itemCountLabel}</Text>
            </View>
            {filteredNote ? (
              <Text style={styles.filteredNote} testID={`grn-card-filtered-note-${group.grnId}`}>{filteredNote}</Text>
            ) : null}
            {/* Why this GRN matched, when the match is inside the collapsed items */}
            {matched.length > 0 && !expanded ? (
              <HighlightedText
                style={styles.footerText}
                numberOfLines={1}
                text={matched.join(' · ')}
                words={words}
              />
            ) : null}
          </View>

          {/* Attribute stack: what is left of what was received, then its status */}
          <View style={styles.attributeStack} testID={`grn-card-stock-${group.grnId}`}>
            <Text style={styles.stockValueText}>{stock}</Text>
            <StatusTag status={stockStatus.status} label={stockStatus.label} icon={stockStatus.icon} />
          </View>
        </Pressable>

        {/* The receipt's lines */}
        {expanded && group.items.length > 0 && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.expandedSection}>
            <GRNLinesTable items={group.items} styles={styles} testID={`grn-lines-${group.grnId}`} />
          </Animated.View>
        )}

        {/* Open / close */}
        {group.items.length > 0 && (
          <Pressable
            onPress={() => {
              animateExpand(reduceMotion);
              onToggle(group.grnId);
            }}
            style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              expanded
                ? translate('lists.grn.hideDetailsOf', { title })
                : translate('lists.grn.showDetailsOf', { title, items: itemCountLabel })
            }
            accessibilityState={{ expanded }}
            testID={`grn-card-toggle-${group.grnId}`}
          >
            <Text style={styles.expandButtonText}>
              {expanded ? translate('lists.card.hideDetails') : translate('lists.card.showDetails')}
            </Text>
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={iconSize.md}
              color={t.brand.tint}
            />
          </Pressable>
        )}
      </View>
    </View>
  );

  // A role with no action to offer gets a plain card: no swipe that would show only "View".
  if (actions.length === 0) return card;
  return (
    <ReanimatedSwipeable
      // One swipe state per GRN: FlashList reuses this cell for another GRN, which must not appear already swiped open.
      key={group.grnId}
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      {card}
    </ReanimatedSwipeable>
  );
});

GRNCardFiori.displayName = 'GRNCardFiori';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
interface GRNListFioriProps {
  /** Open the list showing this range of GRN numbers (print-range links). Replaces any filters. */
  initialNumberRange?: { from?: string; to?: string };
}

const GRNListFiori: React.FC<GRNListFioriProps> = ({ initialNumberRange }) => {
  const { userProfile } = useAppSelector((state) => state.auth);
  const styles = useThemedStyles(makeGRNListStyles);
  const t = useTokens();
  const isOffline = useIsOffline();
  const isCustomerAccount = userProfile?.role === 'customer';
  const assignedCustomerIds = useMemo(
    () =>
      userProfile?.assignedCustomerIds ||
      userProfile?.assignedCustomers?.map(customer => customer.id) ||
      [],
    [userProfile]
  );

  // State
  const [data, setData] = useState<GRNListResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  /** The first page failed with no rows to show. */
  const [loadError, setLoadError] = useState(false);
  /** A refresh failed: the rows loaded before stay, with a strip that says when (§14.9). */
  const [refreshError, setRefreshError] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  // Filters, search and sort
  const filters = useListFilters(GRN_FILTERS);
  const { request, sort } = filters;
  const sortedByNumber = sort?.field === 'gr_no';
  const linesHidden = useMemo(() => grnLinesHidden(request), [request]);
  const words = useMemo(() => searchWords(readSearch(GRN_FILTERS, filters.values).text), [filters.values]);
  const listRef = useRef<FlashListRef<FlattenedItem<GRNGroupData>>>(null);

  // Open cells
  const [open, setOpen] = useState<OpenState>({ all: false, flipped: new Set() });

  // Print state
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [selectedGRNForPrint, setSelectedGRNForPrint] = useState('');

  // Refs
  const printJobsBottomSheetRef = useRef<PrintJobsBottomSheetRef>(null);
  /** The request the rows on screen answer, so a failed refresh of it keeps them and a failed new filter does not. */
  const shownRequest = useRef<string | null>(null);
  /** What the facility pages by, from its latest answer. */
  const pageUnit = useRef<'line' | 'receipt'>('receipt');

  // Permissions - use centralized permission system
  const { canCreate, canUpdate } = usePermissions();
  const canCreateGRN = canCreate;
  const canPrint = canCreate || canUpdate; // Staff can print (they have update permission)
  const canEdit = canUpdate;

  // A print-range link opens the list on exactly that range.
  const initialFrom = initialNumberRange?.from;
  const initialTo = initialNumberRange?.to;
  useEffect(() => {
    if (initialFrom || initialTo) filters.apply({ numberRange: { from: initialFrom, to: initialTo } });
    // Only when the link's range changes.

  }, [initialFrom, initialTo]);

  /**
   * A failed next page is the list's last row with Try again. A failed refresh of the rows on screen keeps
   * them under a strip that says when they were loaded. A failed new search or filter has no rows that
   * answer it, so the list shows the error state (§14.9).
   */
  const showLoadFailure = useCallback((append: boolean, requestKey: string) => {
    if (append) {
      setLoadMoreFailed(true);
    } else if (shownRequest.current === requestKey) {
      setRefreshError(true);
    } else {
      setData(null);
      shownRequest.current = null;
      setLoadError(true);
    }
  }, []);

  // Fetch a page. A newer request (the user kept typing, or changed a filter)
  // replaces an older one: late answers to old questions are dropped.
  const latestRequest = useRef(0);
  // The rows loaded so far, in the unit the facility pages by (receipts or lines): what a refresh asks for.
  const loadedCount = useRef(0);
  loadedCount.current = currentOffset;
  // `keepPlace`: a refresh when the screen comes back into view. The rows on screen stay until the answer, the list
  // is not scrolled to the top (the person was reading it), and it asks for as many rows as are loaded (at least a
  // first page), so the answer replaces them all and the place is not lost when the list is longer than a page.
  const fetchGRNItems = useCallback(async (offset = 0, append = false, keepPlace = false) => {
    const requestId = append ? latestRequest.current : ++latestRequest.current;
    const requestKey = JSON.stringify(request);
    try {
      if (offset === 0 && !append && !keepPlace) setLoading(true);
      if (append) setLoadingMore(true);

      const limit = keepPlace
        ? Math.max(PAGE_SIZE, loadedCount.current)
        : offset === 0 || pageUnit.current === 'receipt' ? PAGE_SIZE : LINE_PAGE_SIZE;
      const params = withReceiptPages({ ...request, p_limit: limit, p_offset: offset });
      const result = isCustomerAccount
        ? await getAssignedCustomerGRNItems(assignedCustomerIds, params)
        : await getAllGRNItems(params);
      if (requestId !== latestRequest.current) return;

      if (result.success && result.data) {
        const unit = result.data.pagination.unit === 'receipt' ? 'receipt' : 'line';
        // The facility answers in another unit than the one the loaded pages were counted in (backend migration 98
        // arrived while the list was open): the offset means something else now. Start again from the first page.
        if (append && unit !== pageUnit.current) {
          pageUnit.current = unit;
          void fetchGRNItems();
          return;
        }
        pageUnit.current = unit;
        const advance = unit === 'receipt' ? countReceipts(result.data.items) : result.data.items.length;
        if (append) {
          // The offset advances by the raw page; lines already loaded (the offset shifted while the list was
          // open) are not added again.
          setData(prev => {
            if (!prev) return result.data;
            const known = new Set(prev.items.map(grnLineKey));
            return { ...result.data, items: [...prev.items, ...result.data.items.filter(item => !known.has(grnLineKey(item)))] };
          });
          setCurrentOffset(prev => prev + advance);
        } else {
          setData(result.data);
          setCurrentOffset(advance);
          setLoadError(false);
          setRefreshError(false);
          setLoadMoreFailed(false);
          setLoadedAt(Date.now());
          shownRequest.current = requestKey;
          if (!keepPlace) listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } else {
        // Keep the server message for support; show plain words to the user
        logger.warn('Load failed:', result.error || result.message);
        showLoadFailure(append, requestKey);
      }
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      logger.error('Exception:', error);
      showLoadFailure(append, requestKey);
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [assignedCustomerIds, request, isCustomerAccount, showLoadFailure]);

  // Any change of filter, search or sort is a new first page.
  useEffect(() => {
    setCurrentOffset(0);
    fetchGRNItems();
  }, [fetchGRNItems]);

  // The list reads again when the screen comes back into view (after a GRN was created, edited or deleted, or
  // goods were dispatched): the first focus is the mount, which the effect above loads. A failed refresh keeps
  // the rows on screen under the "last updated" strip.
  const fetchGRNItemsRef = useRef(fetchGRNItems);
  fetchGRNItemsRef.current = fetchGRNItems;
  // The filter request of the latest render, and the one in force when the screen was left: a request that changed
  // meanwhile (Sort and filter) was loaded from the first page by the effect above, so it is not read again here.
  const requestKeyRef = useRef('');
  requestKeyRef.current = JSON.stringify(request);
  const requestWhenLeftRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const whenLeft = requestWhenLeftRef.current;
      requestWhenLeftRef.current = null;
      if (whenLeft !== null && whenLeft === requestKeyRef.current) {
        void fetchGRNItemsRef.current(0, false, true);
      }
      return () => {
        requestWhenLeftRef.current = requestKeyRef.current;
      };
    }, [])
  );

  // Event handlers
  const handleGRNPress = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) {
      logger.error('Cannot navigate: grnId is undefined', group);
      return;
    }
    router.push(`/grn-details/${group.grnId}`);
  }, []);

  const handleEdit = useCallback((group: GRNGroupData) => {
    if (!group?.grnId) return;
    router.push(`/grn-edit/${group.grnId}/step1`);
  }, []);

  const handleCreateGRN = useCallback(() => {
    router.push('/grn-form/step1');
  }, []);

  const handlePrint = useCallback((group: GRNGroupData) => {
    setSelectedGRNForPrint(group.grNo);
    setShowPrintDialog(true);
  }, []);

  // A job sent is a short confirmation; a failure needs the person to act, so it is a dialog (§13.9).
  const handlePrintConfirm = useCallback(async (start: string, end: string) => {
    try {
      const result = await printGRNRange(start, end);
      if (result.success) {
        showToast(
          result.print_job?.cups_job_id
            ? translate('lists.grn.printSentNumbered', { job: String(result.print_job.cups_job_id) })
            : translate('lists.grn.printSent')
        );
      } else {
        logger.warn('Print failed:', result.error);
        showAlert(
          translate(result.unconfirmed ? 'grn.review.printUnconfirmedTitle' : 'grn.review.printFailedTitle'),
          result.unconfirmed ? translate('grn.details.printUnconfirmed') : translate('lists.grn.printFailedPrinter')
        );
      }
    } catch (error) {
      logger.error('Print exception:', error);
      showAlert(translate('grn.review.printFailedTitle'), translate('lists.grn.printFailedConnection'));
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGRNItems();
  }, [fetchGRNItems]);

  const handleLoadMore = useCallback(() => {
    if (!data?.pagination.has_more || loadingMore || loading) return;
    setLoadMoreFailed(false);
    fetchGRNItems(currentOffset, true);
  }, [data, loadingMore, loading, fetchGRNItems, currentOffset]);

  // Reaching the end of the list asks for the next page, but not again right after one failed: the footer's
  // Try again is the way (otherwise a dead connection would be retried on every scroll back to the end).
  const handleEndReached = useCallback(() => {
    if (!loadMoreFailed) handleLoadMore();
  }, [loadMoreFailed, handleLoadMore]);

  const handleToggle = useCallback((grnId: string) => {
    setOpen(previous => {
      const flipped = new Set(previous.flipped);
      if (flipped.has(grnId)) flipped.delete(grnId);
      else flipped.add(grnId);
      return { all: previous.all, flipped };
    });
  }, []);

  // Open or close every card, also those loaded later. Not animated: it changes the whole list (§9).
  const handleToggleAll = useCallback(() => {
    setOpen(previous => ({ all: !previous.all, flipped: new Set() }));
  }, []);

  // Group items - by date when sorting by date, or flat list when sorting by GRN No
  const flattenedData = useMemo((): FlattenedItem<GRNGroupData>[] => {
    if (!data?.items) return [];

    // Consolidate items into GRN groups
    const groups = data.items.reduce((acc, item) => {
      // A missing field means a malformed row. An empty number is a real receipt
      // (older data can hold one) and must stay visible so it can be opened and fixed.
      if (item.gr_no == null) {
        if (__DEV__) {
          logger.warn('Item missing gr_no:', item);
        }
        return acc;
      }
      const key = `${item.grn_id || item.id}_${item.gr_no}`;
      if (!acc[key]) {
        acc[key] = {
          grnId: item.grn_id || item.id,
          grNo: item.gr_no,
          date: item.date,
          registration: item.registration ?? undefined,
          customerName: item.customer_name,
          items: [],
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, GRNGroupData>);

    const allGroups = Object.values(groups);

    // When sorting by GRN No, return a flat list in the order the rows arrived.
    // The server (or the customer merge in grn-service) already sorted them by
    // receipt number; groups are built in first-seen order, so nothing is re-sorted here.
    if (sortedByNumber) {
      return allGroups.map(group => ({
        type: 'card' as const,
        data: group,
        key: `${group.grnId}_${group.grNo}`,
      }));
    }

    // When sorting by date, group into date sections in the order the rows arrived.
    // The rows are already in date order (oldest or newest first), so each day's
    // receipts are together and nothing is re-sorted. "Today" and "Yesterday" are
    // only section titles: they take their place by date like any other day.
    const sections: { title: string; data: GRNGroupData[] }[] = [];
    const sectionByTitle = new Map<string, { title: string; data: GRNGroupData[] }>();
    allGroups.forEach(group => {
      const title = formatSectionDate(group.date);
      let section = sectionByTitle.get(title);
      if (!section) {
        section = { title, data: [] };
        sectionByTitle.set(title, section);
        sections.push(section);
      }
      section.data.push(group);
    });

    return flattenSections(sections, (group) => `${group.grnId}_${group.grNo}`);
  }, [data?.items, sortedByNumber]);

  const handleRetry = useCallback(() => {
    setLoadError(false);
    fetchGRNItems();
  }, [fetchGRNItems]);

  const hasMore = Boolean(data?.pagination.has_more);

  // Render functions
  const renderItem = useCallback(({ item }: { item: FlattenedItem<GRNGroupData> }) => {
    if (item.type === 'header') {
      // While more pages remain the count is a lower bound ("20+"), never the day's size.
      return (
        <SectionHeader
          title={item.title}
          count={item.count}
          countText={hasMore ? translate('lists.section.countMore', { count: formatNumber(item.count) }) : formatNumber(item.count)}
          countLabel={hasMore ? translate('lists.section.moreThanGrns', { count: formatNumber(item.count) }) : formatCount(item.count, 'GRN')}
          style={styles.sectionHeader}
        />
      );
    }

    return (
      <GRNCardFiori
        group={item.data}
        expanded={isOpen(open, item.data.grnId)}
        onToggle={handleToggle}
        onPress={handleGRNPress}
        onEdit={canEdit ? handleEdit : undefined}
        onPrint={canPrint ? handlePrint : undefined}
        styles={styles}
        words={words}
        linesHidden={linesHidden}
      />
    );
  }, [handleGRNPress, handleEdit, handlePrint, handleToggle, canEdit, canPrint, styles, open, words, hasMore, linesHidden]);

  const renderFooter = useCallback(() => {
    if (loadMoreFailed && !loadingMore) {
      return (
        <LoadMoreErrorFooter
          message={translate('lists.grn.loadMoreFailed')}
          retryLabel={translate('lists.grn.retryMore')}
          onRetry={handleLoadMore}
          testID="grn-load-more-error"
        />
      );
    }
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={t.brand.tint} />
        <Text style={styles.footerLoaderText}>{translate('lists.grn.loadingMore')}</Text>
      </View>
    );
  }, [loadingMore, loadMoreFailed, handleLoadMore, styles, t]);

  // Offline with no failed refresh: the top of the list says when the cards were loaded (§14.9). A failed
  // refresh says it in its strip instead.
  const offlineUpdatedAt = isOffline && !refreshError ? loadedAt : undefined;
  const renderListHeader = useCallback(
    () => (offlineUpdatedAt !== undefined ? <LastUpdatedLine at={offlineUpdatedAt} top testID="grn-last-updated" /> : null),
    [offlineUpdatedAt]
  );

  const hasRows = flattenedData.length > 0;

  // The header, search field and filter bar are shown in every state, so a search
  // or filter can always be changed or cleared, also while loading or when nothing matches.
  const header = (
    <FilteredListHeader
      title={translate('lists.grn.title')}
      config={GRN_FILTERS}
      filters={filters}
      loading={loading}
      busy={loading && !refreshing && data !== null}
      expand={{ expanded: open.all, onToggle: handleToggleAll, nounPlural: 'GRNs', disabled: !hasRows }}
    />
  );

  let content: React.ReactNode;
  if (loading && (!data || (!hasRows && !refreshing))) {
    // First load, or a new first page with no rows on screen: skeleton, never an empty or no-match state while the answer is pending.
    // Later loads keep the rows on screen while the new ones arrive.
    content = <ListSkeleton count={5} metricsCount={3} />;
  } else if (hasRows) {
    content = (
      <>
        {/* A refresh failed: the GRNs loaded before stay, with Try again (§14.9) */}
        {refreshError ? (
          <StaleListStrip
            title={translate('lists.grn.staleTitle')}
            text={translate('lists.grn.staleText', { time: formatTime(new Date(loadedAt)) })}
            retryLabel={translate('lists.grn.retryRefresh')}
            onRetry={onRefresh}
            retrying={refreshing}
            testID="grn-stale-strip"
          />
        ) : null}
        <FlashList
          ref={listRef}
          data={flattenedData}
          // Re-sorted lists must not stay anchored on the row that was on top before.
          maintainVisibleContentPosition={{ disabled: true }}
          renderItem={renderItem}
          keyExtractor={(item: FlattenedItem<GRNGroupData>) => item.key}
          getItemType={getItemType}
          extraData={{ open, words, hasMore, canEdit, canPrint, linesHidden }}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[t.brand.tint]}
              tintColor={t.brand.tint}
              progressBackgroundColor={t.surface.card}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={DEFAULT_LIST_CONFIG.onEndReachedThreshold}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </>
    );
  } else if (loadError || refreshError) {
    // No rows on screen: a failed first page, new filter, or reload of a request that had none is the error state.
    content = (
      <ErrorStateView
        presentation="inline"
        title={translate('lists.grn.loadFailedTitle')}
        message={translate('common.checkConnection')}
        onRetry={handleRetry}
      />
    );
  } else {
    content = (
      <ListEmptyState
        {...filteredEmptyProps(filters, 'GRNs')}
        emptyIcon="package-down"
        emptyTitle={translate('lists.grn.emptyTitle')}
        emptySubtitle={canCreateGRN ? translate('lists.grn.emptyCreator') : translate('lists.grn.emptyViewer')}
        showCreateButton={canCreateGRN}
        createButtonLabel={translate('lists.grn.create')}
        onCreatePress={handleCreateGRN}
      />
    );
  }

  return (
    <View style={styles.container}>
      {header}
      {content}

      {/* Create GRN (floating action button, guide 14.1) */}
      {canCreateGRN && (
        <Fab label={translate('lists.grn.create')} onPress={handleCreateGRN} />
      )}

      {/* Print dialog */}
      <PrintRangeDialog
        visible={showPrintDialog}
        onDismiss={() => setShowPrintDialog(false)}
        onConfirm={handlePrintConfirm}
        title={translate('lists.grn.printRangeTitle')}
        defaultNumber={selectedGRNForPrint}
        entity="grn"
        placeholder={translate('lists.grn.printRangePlaceholder', { example: 'Z0797' })}
        onViewJobs={() => {
          setShowPrintDialog(false);
          printJobsBottomSheetRef.current?.open();
        }}
      />

      {/* Print jobs sheet */}
      <PrintJobsBottomSheet ref={printJobsBottomSheetRef} />
    </View>
  );
};

export default GRNListFiori;
