/**
 * MemoizedDispatchItem - Optimized Dispatch Card Component
 *
 * 2025 Best Practices Implementation:
 * - React.memo with custom areEqual comparison
 * - Stable callbacks via props (no inline functions)
 * - Minimal re-renders through prop comparison
 * - SAP Fiori object cell (docs/STYLE_GUIDE.md §13.6)
 *
 * @module list-items/MemoizedDispatchItem
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { formatDate, formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as translate, formatIdentifier } from '@/i18n';
import type { Dispatch } from '@/services/dispatch-service';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  motion,
  radius,
  singleLineText,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { animateExpand } from '@/utils/layoutMotion';
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

// ============================================================================
// TYPES
// ============================================================================

export interface MemoizedDispatchItemProps {
  /** Dispatch data to render */
  dispatch: Dispatch;
  /** Callback when item is pressed */
  onPress: (dispatch: Dispatch) => void;
  /** Callback for view details action */
  onViewDetails?: (dispatch: Dispatch) => void;
  /** Callback for edit action */
  onEdit?: (dispatch: Dispatch) => void;
  /** Callback for print action */
  onPrint?: (dispatch: Dispatch) => void;
  /** Whether print action is available */
  canPrint?: boolean;
  /**
   * Whether the card shows its items. The list owns this (a recycled list cell must not carry it to another
   * dispatch), and so does any other screen that draws the card.
   */
  expanded?: boolean;
  /** The card's own toggle was pressed; the owner flips this dispatch's state. */
  onToggle?: (dispatchId: string) => void;
  /** Lower-cased search words to show in bold (see `searchWords`). */
  words?: string[];
  /** Open a GRN (its id) from the GRN cell of a line; without it, or for a line without a GRN id, the cell is plain text. */
  onViewGRN?: (grnId: string) => void;
}

// ============================================================================
// STATUS HELPERS (guide §3.5)
// ============================================================================

type StatusKind = 'positive' | 'critical';

interface StatusConfig {
  kind: StatusKind;
  label: string;
  icon: IconName;
}

const getDispatchStatus = (dispatch: Dispatch): StatusConfig => {
  // Determine status based on total_qty
  if (dispatch.total_qty && dispatch.total_qty > 0) {
    return { kind: 'positive', label: translate('lists.dispatch.statusComplete'), icon: 'check-circle' };
  }
  return { kind: 'critical', label: translate('common.pending'), icon: 'alert' };
};

// ============================================================================
// STYLES - SAP Fiori Object Cell
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  // The outline keeps each card distinct in dark mode, where the shadow does not show.
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.sm,
    borderWidth: 1,
    borderColor: t.border.separator,
    ...t.shadow[2],
    overflow: 'hidden' as const,
  },
  cardContent: {
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
    backgroundColor: t.surface.card,
  },
  cardContentPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  objectCellRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  iconContainer: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
    backgroundColor: t.brand.subtle,
  },
  mainContent: {
    flex: 1,
    marginRight: space.md,
  },
  titleText: {
    ...typography.headline,
    color: t.text.primary,
  },
  subtitleText: {
    ...typography.subhead,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    columnGap: space.sm,
    rowGap: space.xxs,
  },
  // One fact (icon and text): it never shrinks, so the row wraps between facts, never inside one.
  footerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    flexShrink: 0,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  attributeStack: {
    alignItems: 'flex-end' as const,
    minWidth: 70,
    gap: space.xxs,
  },
  quantityValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    marginTop: space.xs,
  },
  statusTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },
  // The nested table's panel: the padding `nestedRowWidth` allows for (as on the GRN list).
  expandedSection: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  // The compact read-only row of the lines table (§13.7).
  lineCompact: {
    minHeight: 36,
    paddingVertical: space.sm,
  },
  // The card's own footer: tinted, with the text at the start, so it reads as
  // part of this card and not as a control for the whole list.
  expandButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
    gap: space.sm,
    minHeight: touchTarget,
    backgroundColor: t.background.base,
  },
  stackedGrn: {
    marginTop: space.xxs,
  },
  matchedText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  expandButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  expandButtonText: {
    ...typography.callout,
    color: t.brand.tint,
    flexShrink: 1,
  },
});

const NO_WORDS: string[] = [];

/** Where a search matched inside a collapsed card: item, package, rack or GRN number of a line. */
function hiddenMatches(dispatch: Dispatch, words: string[]): string[] {
  if (words.length === 0) return [];
  const found = new Set<string>();
  for (const item of dispatch.items ?? []) {
    for (const text of [item.item_name, item.package_mark, item.rack, item.gr_no ? translate('lists.card.grnRef', { number: formatIdentifier(item.gr_no) }) : null]) {
      if (text && matchesAnyWord(text, words)) found.add(text);
    }
  }
  return [...found].slice(0, 3);
}

// ============================================================================
// THE LINES OF AN OPEN CARD (nested table, style guide 13.7)
// ============================================================================

/** One line of an open card's table: a dispatch of the list or a recently dispatched order (older backends send no `grn_id`/`grn_qty`). */
export interface DispatchLine {
  item_name?: string | null;
  disp_qty: number;
  weight?: number | null;
  package_mark?: string | null;
  rack?: string | null;
  gr_no?: string | null;
  grn_qty?: number | null;
  grn_item_id?: string;
  grn_id?: string | null;
}
const lineHelper = createAppColumnHelper<DispatchLine>();
/** Number columns at font scale 1, grown with the text and the widest value (`numberColumnWidth`). */
/** The Kg each column is as wide as its figures (a floor of 40): the heading wraps onto two lines when it is wider. */
export const KG_WIDTH = 40;
const GRN_WIDTH = 56;
const QTY_WIDTH = 36;

/** Whole kilograms of one bag, as the column shows them. */
const kgEachOf = (item: DispatchLine) => Math.round(Number(item.weight) || 0);
/** "RV15001/5": the GRN number and what was received; just the number when the backend sent no received quantity. */
const grnText = (item: DispatchLine) =>
  item.grn_qty === null || item.grn_qty === undefined ? (item.gr_no ?? '') : `${item.gr_no ?? ''}/${formatNumber(item.grn_qty)}`;

/**
 * The GRN text: on one line in its own column (sized for it), and under the item allowed to wrap, because that
 * column is not sized for it and "WMWM8881/9,999" would otherwise be cut with "…" (R6-1). Only the GR number is searched, so the searched words are bold there and the quantity stays plain (§14.6). */
const GrnLineText: React.FC<{ item: DispatchLine; words: string[]; style: React.ComponentProps<typeof Text>['style']; wrap?: boolean }> = ({ item, words, style, wrap }) => (
  <Text style={style} numberOfLines={wrap ? undefined : 1}>
    {matchesAnyWord(item.gr_no, words) ? (
      <>
        <HighlightedText text={item.gr_no ?? ''} words={words} />
        {item.grn_qty === null || item.grn_qty === undefined ? '' : `/${formatNumber(item.grn_qty)}`}
      </>
    ) : (
      grnText(item)
    )}
  </Text>
);

/**
 * The GRN cell of a line. A line that knows its GRN opens it with a tap (a link, as on Dispatch -> Items); the row offers the
 * same as an "Open GRN" action, so the cell itself is hidden from a screen reader. Without a GRN id or a way to open it, plain text.
 */
const GrnLineCell: React.FC<{
  item: DispatchLine;
  words: string[];
  plain: React.ComponentProps<typeof Text>['style'];
  wrap?: boolean;
  onViewGRN?: (grnId: string) => void;
}> = ({ item, words, plain, wrap, onViewGRN }) => {
  const table = useThemedStyles(makeTableStyles);
  const grnId = item.grn_id;
  if (!grnId || !onViewGRN) return <GrnLineText style={plain} item={item} words={words} wrap={wrap} />;
  return (
    <Pressable
      onPress={() => onViewGRN(grnId)}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={({ pressed }) => [table.linkTarget, pressed && table.linkPressed]}
      testID={`dispatch-line-grn-${grnId}`}
    >
      <GrnLineText style={[table.link, wrap ? { marginTop: space.xxs } : null]} item={item} words={words} wrap={wrap} />
    </Pressable>
  );
};

/** What a screen reader says for one line, with the package mark in full (the card cuts it); a lot without a weight is read without one. */
function lineLabel(item: DispatchLine): string {
  const itemWithMark = [item.item_name, item.package_mark].filter(Boolean).join(', ');
  const weightEach = formatWeightEach(kgEachOf(item));
  return weightEach === null
    ? translate(item.rack ? 'dispatch.listRow.noWeightRack' : 'dispatch.listRow.noWeight', {
      item: itemWithMark,
      rack: item.rack,
      grn: formatIdentifier(item.gr_no),
      quantity: item.disp_qty,
    })
    : translate(item.rack ? 'lists.dispatch.itemRowRack' : 'lists.dispatch.itemRow', {
      item: itemWithMark,
      rack: item.rack,
      weight: weightEach,
      grn: formatIdentifier(item.gr_no),
      quantity: item.disp_qty,
    });
}

/**
 * The columns of an open card's lines table (§13.7): Item | Kg each | GRN | Qty; when they would crowd the
 * item (or from font scale 1.5) "Kg each" and the GRN text move under it, leaving Item | Qty; and a Qty that
 * would still crowd it, or take too much of the row, goes under the item as well, right-aligned.
 */
export function dispatchLinesLayout(
  screen: Pick<TableLayout, 'stacked' | 'scale' | 'width'>,
  kgWidth: number,
  grnWidth: number,
  qtyWidth: number
): { stacked: boolean; qtyUnder: boolean } {
  const row = nestedRowWidth(screen);
  const stacked = screen.stacked || crowded(row, [kgWidth, grnWidth, qtyWidth], 0, screen.scale);
  return { stacked, qtyUnder: stacked && lastColumnAlone(row, qtyWidth, screen.scale) };
}

export const DispatchLinesTable = React.memo<{ items: DispatchLine[]; words: string[]; rowKey: string; testID?: string; onViewGRN?: (grnId: string) => void }>(
  ({ items, words, rowKey, testID, onViewGRN }) => {
    const table = useThemedStyles(makeTableStyles);
    const styles = useThemedStyles(makeStyles);
    const screen = useTableLayout();
    const kgText = (item: DispatchLine) => (kgEachOf(item) > 0 ? formatNumber(kgEachOf(item)) : '—');
    // The columns are drawn `space.xs` wider than the estimate, so an estimate a little short never cuts a figure
    // (it is never shrunk either), and the layout counts that margin, as the GRN table does.
    const kgWidth = numberColumnWidth(screen, KG_WIDTH, items.map(kgText));
    const grnWidth = numberColumnWidth(screen, GRN_WIDTH, items.map(grnText));
    const qtyWidth = numberColumnWidth(screen, QTY_WIDTH, items.map(item => formatNumber(item.disp_qty)));
    const { stacked, qtyUnder } = dispatchLinesLayout(screen, kgWidth + space.xs, grnWidth + space.xs, qtyWidth + space.xs);

    const columns = useMemo(
      () =>
        lineHelper.columns([
          lineHelper.display({
            id: 'item',
            header: translate('common.item'),
            meta: { width: 'grow' },
            cell: ({ row }) => {
              const item = row.original;
              const weight = stacked ? formatWeightEach(kgEachOf(item)) : null;
              const mark = item.package_mark || null;
              return (
                <>
                  <HighlightedText style={table.primary} numberOfLines={2} ellipsizeMode="tail" text={item.item_name ?? ''} words={words} />
                  {/* Only the mark was searched: the weight under it stays plain (§14.6). A long mark is cut at the normal size (§13.7). The mark comes first, then the rack. */}
                  {mark ? <HighlightedText style={table.secondary} {...CUT_LINE} text={nb(mark)} words={words} /> : null}
                  {item.rack ? <Text style={table.secondary}>({item.rack})</Text> : null}
                  {weight ? <Text style={table.secondary}>{nb(weight)}</Text> : null}
                  {stacked ? <GrnLineCell plain={[table.secondary, styles.stackedGrn]} item={item} words={words} wrap onViewGRN={onViewGRN} /> : null}
                  {qtyUnder ? <Text style={table.numberStrong} numberOfLines={1}>{formatNumber(item.disp_qty)}</Text> : null}
                </>
              );
            },
          }),
          ...(stacked
            ? []
            : [
                lineHelper.display({
                  id: 'kgEach',
                  header: translate('lists.card.colKgEach'),
                  meta: { width: kgWidth + space.xs, numeric: true },
                  cell: ({ row }) => <Text style={table.number} numberOfLines={1}>{kgText(row.original)}</Text>,
                }),
                // Text, so left-aligned like the same figure on Dispatch -> Items (§13.7).
                lineHelper.display({
                  id: 'grn',
                  header: translate('lists.card.colGrnReceived'),
                  meta: { width: grnWidth + space.xs },
                  cell: ({ row }) => <GrnLineCell plain={table.primary} item={row.original} words={words} onViewGRN={onViewGRN} />,
                }),
              ]),
          lineHelper.display({
            id: 'qty',
            header: translate('lists.card.colQty'),
            // Under the item the quantity has no column of its own, only its heading over the end of the row.
            meta: { width: qtyUnder ? 'auto' : qtyWidth + space.xs, numeric: true, headerOnly: qtyUnder },
            cell: ({ row }) => <Text style={table.numberStrong} numberOfLines={1}>{formatNumber(row.original.disp_qty)}</Text>,
          }),
        ]),
      // kgText reads only its argument.
      [stacked, qtyUnder, kgWidth, grnWidth, qtyWidth, table, styles, words, onViewGRN]
    );
    const grid = useAppTable({ data: items, columns, getRowId: (item, index) => `${rowKey}-item-${item.grn_item_id ?? item.gr_no ?? 'line'}-${index}` });

    return (
      <DataTable
        table={grid}
        variant="nested"
        headerOneLine={false}
        rowStyle={styles.lineCompact}
        rowLabel={(row) => lineLabel(row.original)}
        rowActions={(row) =>
          row.original.grn_id && onViewGRN
            ? [{ name: 'openGrn', label: translate('dispatch.details.table.openGrnAction', { number: formatIdentifier(row.original.gr_no ?? '') }) }]
            : undefined
        }
        onRowAction={(row, actionName) => {
          if (actionName === 'openGrn' && row.original.grn_id) onViewGRN?.(row.original.grn_id);
        }}
        rowTestID={(row) => row.id}
        testID={testID}
      />
    );
  }
);

DispatchLinesTable.displayName = 'DispatchLinesTable';

// ============================================================================
// COMPONENT
// ============================================================================

const DispatchItemContent: React.FC<MemoizedDispatchItemProps> = ({
  dispatch,
  onPress,
  expanded = false,
  onToggle,
  words = NO_WORDS,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const reduceMotion = useReducedMotion();
  const isExpanded = expanded;
  const dispatchId = dispatch.dispatch_id || dispatch.id;
  const statusConfig = getDispatchStatus(dispatch);
  const status = t.status[statusConfig.kind];

  // Calculate totals (using snake_case properties). No total weight: a lot stores
  // the weight of one bag, and total weights are not shown (style guide 12.3).
  const totalQty = dispatch.total_qty || 0;
  const totalItems = dispatch.total_items || (dispatch.items?.length ?? 0);
  const hasItems = dispatch.items && dispatch.items.length > 0;
  const itemsLabel = formatCount(totalItems, 'item');
  const bagsLabel = formatCount(totalQty, 'bag');
  const dateLabel = formatDate(dispatch.disp_date, 'short');
  const matched = hiddenMatches(dispatch, words);

  const handleToggleExpand = useCallback(() => {
    // One card opens with the shared 200 ms motion, skipped under Reduce Motion (§9).
    animateExpand(reduceMotion);
    onToggle?.(dispatchId);
  }, [reduceMotion, onToggle, dispatchId]);

  // One combined label for the row (guide §11.3)
  const accessibilityDescription = [
    translate('lists.dispatch.cardTitle', { number: formatIdentifier(dispatch.disp_no) }),
    dispatch.customer_name,
    itemsLabel,
    bagsLabel,
    dispatch.registration ? translate('lists.card.vehicle', { number: formatIdentifier(dispatch.registration) }) : null,
    dateLabel,
    statusConfig.label,
    matched.length > 0 ? translate('lists.card.matched', { matches: matched.join(', ') }) : null,
  ].filter(Boolean).join(', ');

  return (
    <View style={styles.card} testID={`dispatch-card-${dispatchId}`}>
      <Pressable
        onPress={() => onPress(dispatch)}
        style={({ pressed }) => [styles.cardContent, pressed && styles.cardContentPressed]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityDescription}
        accessibilityHint={translate('lists.dispatch.openHint')}
      >
        <View style={styles.objectCellRow}>
          {/* Object icon (left) */}
          <View style={styles.iconContainer}>
            <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
          </View>

          {/* Main content */}
          <View style={styles.mainContent}>
            <HighlightedText style={styles.titleText} numberOfLines={2} text={translate('lists.dispatch.cardTitle', { number: formatIdentifier(dispatch.disp_no) })} words={words} />
            <HighlightedText style={styles.subtitleText} numberOfLines={1} text={dispatch.customer_name ?? ''} words={words} />

            {/* Footnote: date, vehicle, item count */}
            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <Icon name="calendar-outline" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.footerText} {...singleLineText()}>{dateLabel}</Text>
              </View>
              {dispatch.registration && (
                <View style={styles.footerItem}>
                  <Icon name="truck-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <HighlightedText style={styles.footerText} text={dispatch.registration} words={words} />
                </View>
              )}
              <Text style={styles.footerText} {...singleLineText()}>{itemsLabel}</Text>
            </View>

            {/* Why this dispatch matched, when the match is inside the collapsed items */}
            {matched.length > 0 && !isExpanded ? (
              <HighlightedText style={styles.matchedText} numberOfLines={2} text={matched.join(' · ')} words={words} />
            ) : null}
          </View>

          {/* Attribute stack (right): main value, status tag */}
          <View style={styles.attributeStack}>
            <Text style={styles.quantityValue}>{bagsLabel}</Text>
            <View style={[styles.statusTag, { backgroundColor: status.background }]}>
              <Icon name={statusConfig.icon} size={iconSize.sm} color={status.text} />
              <Text
                style={[styles.statusTagText, { color: status.text }]}
                maxFontSizeMultiplier={1.6}
              >
                {statusConfig.label}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      {/* Expanded Items Table - SAP Fiori Data Table */}
      {isExpanded && hasItems && (
        <Animated.View entering={FadeIn.duration(motion.standard)} style={styles.expandedSection}>
          <DispatchLinesTable items={dispatch.items!} words={words} rowKey={String(dispatchId)} testID={`dispatch-lines-${dispatchId}`} onViewGRN={onViewGRN} />
        </Animated.View>
      )}

      {/* Expand/Collapse Button */}
      {hasItems && (
        <Pressable
          onPress={handleToggleExpand}
          testID={`dispatch-card-toggle-${dispatchId}`}
          style={({ pressed }) => [styles.expandButton, pressed && styles.expandButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? translate('lists.dispatch.hideDetailsOf', { number: formatIdentifier(dispatch.disp_no) }) : translate('lists.dispatch.showDetailsOf', { items: itemsLabel })}
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.expandButtonText}>
            {isExpanded ? translate('lists.card.hideDetails') : translate('lists.card.showDetails')}
          </Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.brand.tint}
          />
        </Pressable>
      )}
    </View>
  );
};

// Custom comparison function for React.memo
const areEqual = (
  prevProps: MemoizedDispatchItemProps,
  nextProps: MemoizedDispatchItemProps
): boolean => {
  // Compare dispatch by ID and key fields that affect rendering
  const prevDispatch = prevProps.dispatch;
  const nextDispatch = nextProps.dispatch;

  return (
    prevDispatch.dispatch_id === nextDispatch.dispatch_id &&
    prevDispatch.disp_no === nextDispatch.disp_no &&
    prevDispatch.customer_name === nextDispatch.customer_name &&
    prevDispatch.total_qty === nextDispatch.total_qty &&
    prevDispatch.total_items === nextDispatch.total_items &&
    prevDispatch.registration === nextDispatch.registration &&
    prevDispatch.disp_date === nextDispatch.disp_date &&
    // The lines are drawn when the card is expanded. A refetch gives a new
    // array, so an edit that keeps every total above is still drawn again.
    prevDispatch.items === nextDispatch.items &&
    // Compare callback references
    prevProps.onPress === nextProps.onPress &&
    prevProps.canPrint === nextProps.canPrint &&

    // Open or closed, and who is told when it is toggled
    prevProps.expanded === nextProps.expanded &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.words === nextProps.words &&
    prevProps.onViewGRN === nextProps.onViewGRN
  );
};

/**
 * Memoized Dispatch Item Component
 *
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * Only re-renders when dispatch data or callbacks actually change.
 */
export const MemoizedDispatchItem = React.memo(DispatchItemContent, areEqual);

MemoizedDispatchItem.displayName = 'MemoizedDispatchItem';

export default MemoizedDispatchItem;
