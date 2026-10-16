/**
 * Shared look of the object-page tables (docs/STYLE_GUIDE.md §13.7): the Dispatch page's
 * Items, GRNs and Invoices tabs and the GRN page's Items, Dispatches and Invoices tabs.
 * A card, a header row of muted headings on background.base, thin dividers, right-aligned
 * tabular numbers, and a totals row in weight 600 under a 1 px separator.
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
    backgroundColor: t.background.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.separator,
  },
  headerCell: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
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
    borderBottomColor: t.border.divider,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  /** An expanded row: its details below carry the divider. */
  rowOpen: {
    borderBottomWidth: 0,
  },
  /** Under an expanded row: indented past the chevron. */
  details: {
    paddingLeft: space.md + iconSize.md + space.sm,
    paddingRight: space.md,
    paddingBottom: space.md,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.xs,
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
    borderTopColor: t.border.separator,
    // The last body row's divider would double the separator.
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
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={iconSize.md} color={t.icon.secondary} />
      ) : null}
    </View>
  );
};

/** A muted column heading. */
export const HeaderCell: React.FC<{ children: string; style?: object; numeric?: boolean }> = ({ children, style, numeric }) => {
  const styles = useThemedStyles(makeTableStyles);
  return <Text style={[styles.headerCell, numeric && styles.headerNumber, style]}>{children}</Text>;
};
