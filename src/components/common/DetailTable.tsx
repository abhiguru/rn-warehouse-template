/**
 * Shared look of the object-page tables (docs/STYLE_GUIDE.md §13.7): the Dispatch page's
 * Items, GRNs and Invoices tabs and the GRN page's Items, Dispatches and Invoices tabs.
 * An outlined card, a header row of muted headings on table.headerFill, thin dividers,
 * right-aligned tabular numbers, and a totals row in weight 600 under a 1 px separator.
 * An open row and its details share one panel (table.insetFill) with an accent bar at the
 * start; a table inside the details is a small outlined card of its own.
 *
 * Number columns widen with the text size so a quantity is never cut; from font scale
 * 1.5 (the stacking point of ItemRateRow) the middle columns move under the first one.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

/** From this font scale the middle columns stack under the first (as ItemRateRow does). */
export const TABLE_STACK_SCALE = 1.5;
/** From this window width (dp) a date gets its own column instead of a line under the number. */
export const TABLE_WIDE_WIDTH = 600;
/** The outline of a table card, and the bar at the start of an open row (dp). */
export const TABLE_OUTLINE = 1;
export const OPEN_ACCENT = 3;

export interface TableLayout {
  stacked: boolean;
  wide: boolean;
  /** The text size factor (at least 1) and the window width in dp, for columns sized to their text. */
  scale: number;
  width: number;
  /** A number column's width for its width at font scale 1. */
  numberWidth: (base: number) => number;
}

export function useTableLayout(): TableLayout {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale || 1);
  const wide = width >= TABLE_WIDE_WIDTH;
  // One object per layout, so memoized rows re-render only when it changes.
  return useMemo(
    () => ({
      stacked: scale >= TABLE_STACK_SCALE,
      wide,
      scale,
      width,
      numberWidth: (base: number) => Math.ceil(base * scale),
    }),
    [scale, wide, width]
  );
}

export const makeTableStyles = (t: ThemeTokens) => ({
  list: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  /** The card around a table; on a FlatList it is the content container. */
  card: {
    marginHorizontal: layout.marginCompact,
    marginTop: space.md,
    marginBottom: space.xxl,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: TABLE_OUTLINE,
    borderColor: t.table.outline,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: t.table.headerFill,
    borderBottomWidth: 1,
    borderBottomColor: t.table.separator,
  },
  headerCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.table.headerText,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.table.divider,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  /**
   * An open row with its details: one panel on table.insetFill with an accent bar at the start,
   * closed by a separator. The row and details inside give up the bar's width.
   */
  group: {
    backgroundColor: t.table.insetFill,
    borderLeftWidth: OPEN_ACCENT,
    borderLeftColor: t.table.accent,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.table.separator,
  },
  rowOpen: {
    paddingLeft: space.md - OPEN_ACCENT,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  /** Under an open row, the full width of the panel. */
  details: {
    paddingLeft: space.md - OPEN_ACCENT,
    paddingRight: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: space.sm,
  },
  /** A table inside an open row's details: rows on the card colour, so it stands out from the panel. */
  nested: {
    borderRadius: radius.field,
    borderWidth: TABLE_OUTLINE,
    borderColor: t.table.outline,
    backgroundColor: t.surface.card,
    overflow: 'hidden' as const,
  },
  nestedHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.table.headerFill,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.table.separator,
  },
  nestedRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  nestedDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.table.divider,
  },
  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: t.surface.card,
    borderTopWidth: 1,
    borderTopColor: t.table.separator,
    // The last body row's divider (or an open panel's separator) would double the separator.
    marginTop: -StyleSheet.hairlineWidth,
  },
  /** The column that takes the remaining width. */
  grow: {
    flex: 1,
    minWidth: 0,
  },
  chevronCell: {
    width: iconSize.md,
    alignItems: 'center' as const,
    // Centred on the first line of subhead text.
    paddingTop: 1,
  },
  primary: {
    ...typography.subhead,
    color: t.text.primary,
  },
  primaryStrong: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  secondary: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  link: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  number: {
    ...typography.subhead,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  numberStrong: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  headerNumber: {
    textAlign: 'right' as const,
  },
  /** A link cell: a full-height target of at least touchTarget. */
  linkTarget: {
    minHeight: touchTarget,
    marginVertical: -space.sm,
    paddingVertical: space.sm,
    justifyContent: 'flex-start' as const,
  },
  linkPressed: {
    opacity: 0.6,
  },
  /** A footnote under a card; the card above drops its bottom margin to space.sm. */
  cardAboveNote: {
    marginBottom: space.sm,
  },
  note: {
    ...typography.footnote,
    color: t.text.secondary,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.xxl,
  },
});

/** The chevron of an expandable row, or the same width of space for one that is not. */
export const RowChevron: React.FC<{ expandable: boolean; expanded: boolean }> = ({ expandable, expanded }) => {
  const styles = useThemedStyles(makeTableStyles);
  const t = useTokens();
  return (
    <View style={styles.chevronCell}>
      {expandable ? (
        <Icon
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={iconSize.md}
          color={expanded ? t.table.accent : t.icon.secondary}
        />
      ) : null}
    </View>
  );
};

/** One line that shrinks a little rather than wrap, for a cell whose column is sized to fit it. */
export const ONE_LINE = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 } as const;

/** A muted column heading; `oneLine` keeps it on one line in a column sized to fit it. */
export const HeaderCell: React.FC<{ children: string; style?: object; numeric?: boolean; oneLine?: boolean }> = ({
  children,
  style,
  numeric,
  oneLine,
}) => {
  const styles = useThemedStyles(makeTableStyles);
  return (
    <Text style={[styles.headerCell, numeric && styles.headerNumber, style]} {...(oneLine ? ONE_LINE : {})}>
      {children}
    </Text>
  );
};
