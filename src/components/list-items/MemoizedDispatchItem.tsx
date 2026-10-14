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

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatDate, formatCount, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as translate, formatIdentifier } from '@/i18n';
import type { Dispatch } from '@/services/dispatch-service';
import { HighlightedText, matchesAnyWord } from '@/features/filters/components/HighlightedText';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  byLanguage,
  layout,
  motion,
  radius,
  singleLineText,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

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
  /** Global expand state from parent */
  globalExpanded?: boolean;
  /** Key to trigger sync with global state (increments on toggle) */
  globalExpandedKey?: number;
  /** Lower-cased search words to show in bold (see `searchWords`). */
  words?: string[];
}

// ============================================================================
// STATUS HELPERS (guide §3.5)
// ============================================================================

type StatusKind = 'positive' | 'critical';

interface StatusConfig {
  kind: StatusKind;
  label: string;
  icon: string;
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
  // Data table (guide §13.7)
  expandedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  tableHeader: {
    flexDirection: 'row' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
    minHeight: layout.rowMinHeight,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  tableHeaderCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  // A row grows with its item cell (a two-line name, the rack, the mark); the
  // cells beside it are centred on it, as on the GRN list.
  tableRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
  },
  tableRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  tableCell: {
    justifyContent: 'center' as const,
  },
  colItem: {
    flex: 1,
    paddingRight: space.sm,
  },
  // Wide enough for its heading on one line at font scales 1.0 and 1.3, "Kg each" and
  // the Gujarati "દરેકના kg" (72 dp to write in, as on the GRN list: padding inside the
  // column left 64 dp, and the Gujarati heading wrapped); the number under it is the
  // weight of one bag. The GRN cell beside it is centred, so the two stay apart.
  colWeight: {
    width: 72,
    textAlign: 'right' as const,
  },
  // Gujarati digits are wider than Latin ones: "E0006/૧૦૦" needs more than "E0006/100".
  // The cell has 92 dp to write in (108 in Gujarati): "RV15001/100" fits on one line
  // at font scale 1.0; at larger text it goes onto two lines after the slash.
  colGrn: {
    width: byLanguage(96, 112),
    textAlign: 'center' as const,
    paddingRight: space.xs,
  },
  colQty: {
    width: 48,
    textAlign: 'right' as const,
  },
  tableCellValue: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  tableCellQty: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  // The item cell is a column: the name, then the rack on its own line, then the
  // mark. Beside the weight and GRN columns the name has about 70 dp on a 360 dp
  // phone (about 54 dp in Gujarati); it may take two lines, as on the GRN list.
  // The rack never shares the name's line: beside it, the name was drawn as one
  // letter at large text sizes. A long rack wraps rather than being cut.
  tableCellItemName: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
  },
  tableCellRack: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  tableCellItemMark: {
    ...typography.caption1,
    color: t.text.secondary,
    marginTop: space.xxs,
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

/** A short table value (the weight, the quantity) stays on one line and shrinks to its column. */
const TABLE_VALUE = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 } as const;

/**
 * Where the GRN cell "E0006/100" may break: after the slash, and nowhere else.
 * Line breaking keeps "0006/100" together as one number, so a cell too narrow
 * for it broke the number itself ("E0006/10" over "0"), and shrinking it to one
 * line left it clipped on the phone. An invisible zero-width space marks the place.
 */
const BREAK_AFTER_SLASH = '\u200B';

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
// COMPONENT
// ============================================================================

const DispatchItemContent: React.FC<MemoizedDispatchItemProps> = ({
  dispatch,
  onPress,
  globalExpanded,
  globalExpandedKey,
  words = NO_WORDS,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with global expand/collapse state
  useEffect(() => {
    if (globalExpandedKey !== undefined && globalExpandedKey > 0) {
      setIsExpanded(globalExpanded ?? false);
    }
  }, [globalExpandedKey, globalExpanded]);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

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
    <View style={styles.card}>
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
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colItem]}>{translate('common.item')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colWeight]}>{translate('lists.card.colKgEach')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colGrn]}>{translate('lists.card.colGrn')}</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>{translate('lists.card.colQty')}</Text>
          </View>

          {dispatch.items!.map((item, idx) => {
            // Whole kilograms of one bag, as the column shows them. A lot without a
            // weight shows a dash and is read without one.
            const kg = Math.round(Number(item.weight) || 0);
            const weightEach = formatWeightEach(kg);
            return (
              <View
                key={`${dispatch.dispatch_id}-item-${item.grn_item_id}-${idx}`}
                style={[styles.tableRow, idx > 0 && styles.tableRowDivider]}
                accessible
                accessibilityLabel={
                  weightEach === null
                    ? translate(item.rack ? 'dispatch.listRow.noWeightRack' : 'dispatch.listRow.noWeight', {
                      item: item.item_name,
                      rack: item.rack,
                      grn: formatIdentifier(item.gr_no),
                      quantity: item.disp_qty,
                    })
                    : translate(item.rack ? 'lists.dispatch.itemRowRack' : 'lists.dispatch.itemRow', {
                      item: item.item_name,
                      rack: item.rack,
                      weight: weightEach,
                      grn: formatIdentifier(item.gr_no),
                      quantity: item.disp_qty,
                    })
                }
              >
                <View style={[styles.tableCell, styles.colItem]}>
                  <HighlightedText style={styles.tableCellItemName} numberOfLines={2} ellipsizeMode="tail" text={item.item_name ?? ''} words={words} />
                  {item.rack ? <Text style={styles.tableCellRack}>({item.rack})</Text> : null}
                  {item.package_mark ? (
                    <HighlightedText style={styles.tableCellItemMark} numberOfLines={1} text={item.package_mark} words={words} />
                  ) : null}
                </View>
                <Text style={[styles.tableCell, styles.colWeight, styles.tableCellValue]} {...TABLE_VALUE}>
                  {weightEach === null ? '—' : formatNumber(kg)}
                </Text>
                <Text style={[styles.tableCell, styles.colGrn, styles.tableCellValue]}>
                  {`${item.gr_no ?? ''}/${BREAK_AFTER_SLASH}${formatNumber(item.grn_qty)}`}
                </Text>
                <Text style={[styles.tableCell, styles.colQty, styles.tableCellQty]} {...TABLE_VALUE}>
                  {formatNumber(item.disp_qty)}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* Expand/Collapse Button */}
      {hasItems && (
        <Pressable
          onPress={handleToggleExpand}
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

    // Compare global expand state
    prevProps.globalExpanded === nextProps.globalExpanded &&
    prevProps.globalExpandedKey === nextProps.globalExpandedKey &&
    prevProps.words === nextProps.words
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
