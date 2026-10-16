/**
 * Shared look of the object-page tables (docs/STYLE_GUIDE.md §13.7): the Dispatch page's
 * Items, GRNs and Invoices tabs and the GRN page's Items, Dispatches and Invoices tabs.
 * An outlined card, a header row of muted headings on table.headerFill, thin dividers,
 * right-aligned tabular numbers, and a totals row in weight 600 under a 1 px separator.
 * An open row and its details share one panel (table.insetFill) with an accent bar at the
 * start; a table inside the details is a small outlined card of its own.
 *
 * Number columns are as wide as their widest value (the totals included) at the current text
 * size, so a number never splits. From font scale 1.5 (the stacking point of ItemRateRow), or
 * when the number columns would leave the first column less than 25 % of the row, the middle
 * columns move under the first one.
 *
 * On a FlatList the card is drawn in parts, so its end always scrolls into view: Android leaves
 * the margins of a list's content container out of the scroll range. The header row sits in
 * `cardTop`, every row in `cardSides`, the totals in `cardBottom`, and the list content takes
 * `content` (padding only).
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { getLanguage } from '@/i18n/language';
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

/** The width of a row's content: the window less the card's margins, outline and padding. */
export const rowWidth = (table: Pick<TableLayout, 'width'>): number =>
  table.width - 2 * layout.marginCompact - 2 * TABLE_OUTLINE - 2 * space.md;

/** The width of a row's content in a table inside an open row's details (less its outline and padding). */
export const nestedRowWidth = (table: Pick<TableLayout, 'width'>): number =>
  rowWidth(table) - 2 * TABLE_OUTLINE - 2 * space.sm;

/** The chevron cell and the gap after it, at the start of a row of an expandable table. */
export const CHEVRON_LEAD = iconSize.md + space.sm;

// Widths of a number's characters, as a share of the font size, a little above Roboto's: tabular
// digits 0.57 em (0.6 in weight 600), separators 0.28 em, ₹ and anything else 0.62 em. Gujarati
// digits are a little wider. A cell may still shrink a little (ONE_LINE) if the estimate is short.
const GUJARATI_DIGITS = 1.08;
const charEm = (char: string, strong: boolean): number =>
  /[\d૦-૯]/.test(char) ? (strong ? 0.6 : 0.57) : /[,.\s]/.test(char) ? 0.28 : 0.62;
const emWidth = (text: string, strong: boolean): number => Array.from(text).reduce((sum, char) => sum + charEm(char, strong), 0);

/**
 * A number column's width for a whole table: its width at font scale 1 grown with the text, or
 * more when a value (`values` in the regular weight, `strong` in weight 600, like the totals)
 * needs it, so a number never splits or moves from row to row.
 */
export function numberColumnWidth(
  table: Pick<TableLayout, 'scale' | 'numberWidth'>,
  base: number,
  values: readonly string[],
  strong: readonly string[] = [],
  size: number = typography.subhead.fontSize ?? 15
): number {
  const factor = size * table.scale * (getLanguage() === 'gu' ? GUJARATI_DIGITS : 1);
  const longest = (texts: readonly string[], bold: boolean) => texts.reduce((max, text) => Math.max(max, emWidth(text, bold) * factor), 0);
  return Math.max(table.numberWidth(base), Math.ceil(Math.max(longest(values, false), longest(strong, true))) + space.xxs);
}

/**
 * The least share of the row the first column keeps before the middle columns stack. At 25 %
 * ordinary data keeps its columns (an invoice with lakh totals at font scale 1.3 on a 411 dp
 * phone leaves the item column about 29 %, names wrapping by whole words), while amounts in
 * crores or six-digit quantities, which left 3–15 %, stack.
 */
export const FIRST_COLUMN_SHARE = 0.25;

/** The least width the first column keeps at any text size, in em of its text: room for an ordinary word. */
export const FIRST_COLUMN_EM = 5;

/**
 * Whether columns of these widths, with the gaps before them, leave the first column less than
 * FIRST_COLUMN_SHARE of `row`, or less than FIRST_COLUMN_EM at text size `scale` (at font scale
 * 2.0 a quarter of the row held only four or five letters, and words broke mid-word).
 */
export function crowded(row: number, columns: readonly number[], lead: number = CHEVRON_LEAD, scale = 1): boolean {
  const taken = columns.reduce((sum, width) => sum + width + space.sm, lead);
  const least = Math.max(row * FIRST_COLUMN_SHARE, FIRST_COLUMN_EM * (typography.subhead.fontSize ?? 15) * scale);
  return row - taken < least;
}

/** The layout with the middle columns stacked when the table's own columns crowd the first one. */
export function useStackedWhen(table: TableLayout, crowd: boolean): TableLayout {
  return useMemo(() => (crowd && !table.stacked ? { ...table, stacked: true } : table), [table, crowd]);
}

const NBSP = ' ';
/**
 * Keeps a number with the word after it and a label with the amount after it at a line break
 * ("50 kg each", "21 months", "Tax 18%", "Rate ₹9.00"), leaving the breaks around "·".
 */
export const nb = (text: string): string =>
  text
    .replace(/([\d૦-૯]) (?=[^\s·\d૦-૯])/g, `$1${NBSP}`)
    .replace(/([^\s·]) (?=[₹\d૦-૯])/g, `$1${NBSP}`)
    // A line never starts with "·": it stays at the end of the line before.
    .replace(/ ·/g, `${NBSP}·`);

export const makeTableStyles = (t: ThemeTokens) => ({
  list: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  /** The content of a table's FlatList: the space round the card, as padding (see the file comment). */
  content: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },
  /** The top of the card, round the header row. */
  cardTop: {
    backgroundColor: t.surface.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: TABLE_OUTLINE,
    borderBottomWidth: 0,
    borderColor: t.table.outline,
    overflow: 'hidden' as const,
  },
  /** Round every body row: the card's sides. Rows overlap by a pixel, so rounding leaves no seam in the edge. */
  cardSides: {
    borderLeftWidth: TABLE_OUTLINE,
    borderRightWidth: TABLE_OUTLINE,
    borderColor: t.table.outline,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  /** The bottom of the card, round the totals row and anything under it. */
  cardBottom: {
    // Covers the last body row's divider (or an open panel's separator) with the totals separator.
    marginTop: -1,
    backgroundColor: t.surface.card,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    borderWidth: TABLE_OUTLINE,
    borderTopWidth: 0,
    borderColor: t.table.outline,
    overflow: 'hidden' as const,
  },
  /** A card in one piece, for a table that is not a FlatList (InvoicesTable). */
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
    // 1 dp: a hairline drew faint, and at some text sizes not at all.
    borderBottomWidth: 1,
    borderBottomColor: t.table.divider,
  },
  rowPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  /**
   * An open row with its details: one panel on table.insetFill, closed by a separator, with an
   * accent bar (OpenBar) laid over its start. The bar is its own view: as a 3 dp border beside
   * the 1 dp card edges it drew as two thin lines on a 420 dpi phone.
   */
  group: {
    backgroundColor: t.table.insetFill,
    borderBottomWidth: 1,
    borderBottomColor: t.table.separator,
  },
  groupBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: OPEN_ACCENT,
    backgroundColor: t.table.accent,
  },
  rowOpen: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  /** Under an open row, the full width of the panel, starting in line with the chevron. */
  details: {
    paddingLeft: space.md,
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
    borderBottomWidth: 1,
    borderBottomColor: t.table.separator,
  },
  nestedRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    // A one-line row sits in the middle of its touchTarget height.
    paddingVertical: (touchTarget - (typography.subhead.lineHeight ?? 20)) / 2,
  },
  nestedDivider: {
    borderTopWidth: 1,
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
  },
  /** On the totals row of a one-piece card: covers the last body row's divider. */
  footerAfterRows: {
    marginTop: -1,
  },
  /** The column that takes the remaining width. */
  grow: {
    flex: 1,
    minWidth: 0,
  },
  chevronCell: {
    width: iconSize.md,
    alignItems: 'center' as const,
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
});

/** The accent bar of an open row and its details: the last child of the `group` view, so it draws on top. */
export const OpenBar: React.FC = () => {
  const styles = useThemedStyles(makeTableStyles);
  return <View style={styles.groupBar} pointerEvents="none" testID="table-open-bar" />;
};

/** The chevron of an expandable row, or the same width of space for one that is not. */
export const RowChevron: React.FC<{ expandable: boolean; expanded: boolean }> = ({ expandable, expanded }) => {
  const styles = useThemedStyles(makeTableStyles);
  const t = useTokens();
  const { fontScale } = useWindowDimensions();
  // Centred on the first line of subhead text, which grows with the text size.
  const lineHeight = (typography.subhead.lineHeight ?? 20) * Math.max(1, fontScale || 1);
  return (
    <View style={[styles.chevronCell, { paddingTop: Math.max(0, (lineHeight - iconSize.md) / 2) }]}>
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

/**
 * One line that shrinks rather than wrap, for a cell whose column is sized to fit it, so the shrink
 * only covers a small error in the estimate. Android ignores minimumFontScale: never use it on
 * text the column is not sized for (a long mark would shrink until it cannot be read).
 */
export const ONE_LINE = { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 } as const;
/** One line cut with "…" at the normal size, for text the column is not sized for (a package mark). */
export const CUT_LINE = { numberOfLines: 1, ellipsizeMode: 'tail' } as const;

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
