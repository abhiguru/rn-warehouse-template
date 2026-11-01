/**
 * StockItemCard: one item of a stock report, with its GRNs under it when opened.
 *
 * Used by the stock summary (items of one customer, in stock and out of stock) and
 * the item stock summary (items across customers, GRNs read when the card opens).
 * The screens turn their own rows into the plain props below.
 *
 * Follows docs/STYLE_GUIDE.md:
 * - object cell (§13.6): 44 icon, title `headline` in two lines, facts `subhead`,
 *   value on the right (`headline`, tabular, right-aligned), chevron, pressed
 *   `surface.cardPressed`; at most one status tag (§3.5)
 * - GRN rows: the GRN number and the package mark are never cut short (§4): the
 *   mark is the first fact of the row's footnote line, which has no line limit; a
 *   row that opens the GRN is a button with a chevron, a row that does not is read
 *   as one element with neither
 * - expanding uses `motion.standard` and does not animate with Reduce Motion (§9)
 * - loading, error with "Try again" and empty states for GRNs read on demand (§14)
 * - search (§14.6): the item name and each GRN number show the searched words in
 *   bold (`highlightWords`); a match the closed card does not show is named in a
 *   short line under its facts (`matchLine`), read with the header
 *
 * An item can hold hundreds of GRNs. A screen whose list has no cap on them sets
 * `grnsInList`: the card then draws only its header (and the loading, error and
 * empty states), and the screen gives each GRN a row of its own in the same
 * FlashList, drawn by `StockGRNListRow`, so the list mounts only the GRNs on
 * screen instead of all of them inside one cell.
 */

import React, { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { EXPAND_ANIMATION, animateExpand } from '@/utils/layoutMotion';
import { StatusTag } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { formatCount, formatIndiaDate, formatIndiaSpokenDate, formatNumber, formatWeightEach } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { HighlightedText } from '@/features/filters/components/HighlightedText';
import { FactLines, joinFacts } from './FactLines';
import { ReportLoadMoreFooter, type ReportLoadMoreState } from './ReportLoadMoreFooter';

// ============================================================================
// TYPES
// ============================================================================

/** One GRN under an item, already taken out of the screen's data. */
export interface StockGRNRowData {
  /** Unique within the item. */
  key: string;
  /** Opens the GRN when set (and the card has `onOpenGRN`); otherwise the row is read-only. */
  grnId?: string | null;
  /** GRN number as stored; shown in full. */
  grNo: string | number;
  packageMark?: string | null;
  customerName?: string | null;
  /** Date the goods were received. */
  receivedDate?: string | null;
  /** Date the last bag left (out-of-stock items). */
  emptiedDate?: string | null;
  packaging?: string | null;
  rack?: string | number | null;
  /**
   * Weight of one bag, box or crate in kg: the lot's stored weight, never a total. Drawn as a
   * fact of the footnote line ("Rack B-14 · 50 kg each") when above 0. The item stock summary
   * gives the weight here.
   */
  weight?: number | null;
  /**
   * The same weight of one bag, box or crate in kg, drawn under the stock figure instead
   * ("50 kg each") when above 0. The stock summary gives the weight here.
   */
  weightEach?: number | null;
  /** Units still in stock. */
  stock: number;
  /** Units received; "of {total}" is shown when above 0. */
  total?: number | null;
}

/** "Show more GRN lines" under the loaded GRN lines of an item that has more (`ReportLoadMoreFooter`). */
export interface StockGRNMore {
  /** `more`: the button; `loading`: the next lines are being read; `failed`: "Try again"; `none`: nothing. */
  state: ReportLoadMoreState;
  onLoadMore: () => void;
  onRetry: () => void;
}

/** Where the GRNs of an opened card are. */
export type StockGRNState =
  | { status: 'loading' }
  | { status: 'failed'; onRetry: () => void }
  | { status: 'loaded'; rows: StockGRNRowData[] };

export interface StockItemCardProps {
  name: string;
  packaging?: string | null;
  grnCount: number;
  /** Units in stock. */
  stock: number;
  /** Units received; with it the value reads "10 / of 100", without it "10 / units". */
  total?: number | null;
  /** An out-of-stock item: muted icon, "Out of stock" tag, no value, GRNs "dispatched". */
  outOfStock?: boolean;
  /** Shows the "Low stock" tag (see `isLowStock`). */
  lowStock?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  grns: StockGRNState;
  /** Shown when the GRNs are loaded and there are none. Without it nothing is shown. */
  emptyGRNsText?: string;
  /**
   * A footnote under the loaded GRN rows, such as "Showing 100 of 240" when not all were read.
   * Not drawn with `grnsInList`: the screen draws its own rows, and any line under them.
   */
  grnsFooter?: string;
  /**
   * More GRN lines to read for an item whose drill-down reads them a page at a time: drawn under
   * the loaded lines and `grnsFooter`. Not drawn with `grnsInList`, nor before the lines are loaded.
   */
  grnsMore?: StockGRNMore;
  /**
   * The screen's list draws the loaded GRNs, each as a row of its own (`StockGRNListRow`)
   * right under this card. The card then draws only its header while it has GRNs to show,
   * squared off at the bottom so the rows under it read as its body. Loading, a failure
   * and "no GRNs" are still drawn inside the card.
   */
  grnsInList?: boolean;
  /** Opens a GRN; rows with a GRN id become buttons only when this is given. */
  onOpenGRN?: (grnId: string) => void;
  /**
   * Lower-cased search words (see `searchWords`), shown in bold in the item name and
   * in each GRN number (§14.6). Without words the card is drawn as it always was.
   */
  highlightWords?: string[];
  /**
   * What a search found that the closed card does not show ("GRN A0042"), drawn
   * under the facts while the card is closed and read with its header (§14.6).
   * Once opened, the GRNs show it themselves and the line is not drawn.
   */
  matchLine?: string;
  style?: StyleProp<ViewStyle>;
}

// ============================================================================
// LOW STOCK AND MOTION
// ============================================================================

/** Below this share of the received quantity still in stock, an item is low on stock. */
export const LOW_STOCK_PERCENT = 20;

/**
 * Whether an item is low on stock: under LOW_STOCK_PERCENT of what was received,
 * rounded to a whole percent. Nothing received counts as 0 %.
 */
export const isLowStock = (stock: number, total: number): boolean => {
  const percent = total > 0 ? Math.round((stock / total) * 100) : 0;
  return percent < LOW_STOCK_PERCENT;
};

// The expand animation is shared with the GRN list (src/utils/layoutMotion.ts).
export { EXPAND_ANIMATION, animateExpand };

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.surface.card,
      borderRadius: radius.card,
      ...t.shadow[2],
    },
    clip: { borderRadius: radius.card, overflow: 'hidden' },

    // Header (object cell)
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: Math.max(touchTarget, layout.objectCellMinHeight),
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    pressed: { backgroundColor: t.surface.cardPressed },
    image: {
      width: layout.avatar.md,
      height: layout.avatar.md,
      borderRadius: radius.button,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.brand.subtle,
    },
    imageMuted: { backgroundColor: t.status.neutral.background },
    content: { flex: 1, justifyContent: 'center', gap: space.xxs },
    title: { ...typography.headline, color: t.text.primary },
    subtitle: { ...typography.subhead, color: t.text.secondary },
    tag: { marginTop: space.xxs },
    // The line naming a match the closed card does not show (as on the GRN activity card).
    matchLine: { ...typography.footnote, color: t.text.secondary },
    // The value keeps its width; the title and facts take what is left.
    value: { alignItems: 'flex-end', flexShrink: 0 },
    valueText: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums'], textAlign: 'right' },
    valueLabel: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums'], textAlign: 'right' },

    // Opened body
    body: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border.divider,
      backgroundColor: t.background.base,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.xl,
      gap: space.sm,
    },
    loadingText: { ...typography.footnote, color: t.text.secondary },
    empty: {
      ...typography.footnote,
      color: t.text.secondary,
      textAlign: 'center',
      paddingVertical: space.xl,
      paddingHorizontal: space.lg,
    },
    error: { alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.lg, gap: space.sm },
    errorText: { ...typography.footnote, color: t.status.negative.text, textAlign: 'center' },
    grnsFooter: { ...typography.footnote, color: t.text.secondary, paddingVertical: space.md, paddingHorizontal: space.lg },

    // GRN row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: Math.max(touchTarget, layout.rowMinHeight + space.md),
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      gap: space.md,
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border.divider },
    rowContent: { flex: 1, gap: space.xxs },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
    // No line limit: a GRN number is never cut short (§4); it wraps instead.
    rowTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, flexShrink: 1 },
    rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    rowFootnote: { ...typography.footnote, color: t.text.secondary, flexShrink: 1 },
    rowValue: { alignItems: 'flex-end', flexShrink: 0 },
    rowStock: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    rowStockMuted: { color: t.text.secondary },
    rowSecondary: { ...typography.caption1, color: t.text.secondary, fontVariant: ['tabular-nums'], textAlign: 'right' },

    // An opened card whose GRNs are rows of the list (`grnsInList`): the header is the top of
    // one frame and the GRN rows under it are the rest. No shadow, which would fall across the
    // rows under it; a hairline frame instead.
    cardJoined: {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: 0,
      borderColor: t.border.divider,
    },
    clipJoined: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
    listRow: {
      backgroundColor: t.background.base,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: t.border.divider,
    },
    listRowFirst: { borderTopWidth: StyleSheet.hairlineWidth },
    listRowLast: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomLeftRadius: radius.card,
      borderBottomRightRadius: radius.card,
      overflow: 'hidden',
    },
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// GRN ROW
// ============================================================================

/** "10 of 100 in stock", or "10 units" when what was received is not known. */
const stockPhrase = (stock: number, total: number | null | undefined): string =>
  total && total > 0
    ? tr('reports.itemStockSummary.stockOfInStock', { stock: formatNumber(stock), total: formatNumber(total) })
    : tr('reports.shared.unitsValue', { value: formatNumber(stock), count: stock });

export interface StockGRNRowProps {
  grn: StockGRNRowData;
  isLast?: boolean;
  /** Muted stock figure (out-of-stock items). */
  muted?: boolean;
  onOpen?: (grnId: string) => void;
  /** Lower-cased search words, shown in bold in the GRN number. */
  highlightWords?: string[];
}

export const StockGRNRow: React.FC<StockGRNRowProps> = ({ grn, isLast = false, muted = false, onOpen, highlightWords }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return <GRNRowView grn={grn} isLast={isLast} muted={muted} onOpen={onOpen} highlightWords={highlightWords} styles={styles} t={t} />;
};

export interface StockGRNListRowProps extends StockGRNRowProps {
  /** The first GRN under its card: draws the line between the card's header and its GRNs. */
  isFirst?: boolean;
  /** The screen's spacing of the row (side margins; a bottom margin on the last one). */
  style?: StyleProp<ViewStyle>;
}

/**
 * One GRN of an opened `StockItemCard` with `grnsInList`, as a row of the screen's
 * list. Together the rows under the card read as its body: the first draws the
 * line under the header, the last rounds the frame off.
 */
export const StockGRNListRow = memo(function StockGRNListRow({
  grn,
  isFirst = false,
  isLast = false,
  muted = false,
  onOpen,
  highlightWords,
  style,
}: StockGRNListRowProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return (
    <View style={[styles.listRow, isFirst && styles.listRowFirst, isLast && styles.listRowLast, style]}>
      <GRNRowView grn={grn} isLast={isLast} muted={muted} onOpen={onOpen} highlightWords={highlightWords} styles={styles} t={t} />
    </View>
  );
});

const GRNRowView: React.FC<StockGRNRowProps & { styles: Styles; t: ThemeTokens }> = ({
  grn,
  isLast = false,
  muted = false,
  onOpen,
  highlightWords,
  styles,
  t,
}) => {
  const grnId = grn.grnId || null;
  const isNavigable = !!grnId && !!onOpen;

  const title = tr('reports.shared.grnNumber', { number: formatIdentifier(grn.grNo) });
  const received = grn.receivedDate ? tr('reports.shared.receivedOn', { date: formatIndiaDate(grn.receivedDate) }) : null;
  const emptied = grn.emptiedDate ? tr('reports.stockSummary.emptiedOn', { date: formatIndiaDate(grn.emptiedDate) }) : null;
  // The mark is an identifier: a fact of the footnote line, which wraps rather than cuts it (§4).
  const facts = [
    grn.packageMark ? tr('reports.stockSummary.packageMark', { mark: grn.packageMark }) : null,
    grn.packaging || null,
    grn.rack ? tr('reports.shared.rack', { rack: formatIdentifier(grn.rack) }) : null,
    // "50 kg each": null when the lot has no weight, and the fact is then left out.
    formatWeightEach(grn.weight),
  ];
  const hasTotal = !!grn.total && grn.total > 0;
  const weightEach = formatWeightEach(grn.weightEach);

  // The mark is read once, after the title, in its own words; the other facts after the dates.
  const a11yLabel = [
    title,
    grn.packageMark ? tr('reports.shared.markA11y', { mark: grn.packageMark }) : null,
    grn.customerName || null,
    grn.receivedDate ? tr('reports.shared.receivedOn', { date: formatIndiaSpokenDate(grn.receivedDate) }) : null,
    grn.emptiedDate ? tr('reports.stockSummary.emptiedOn', { date: formatIndiaSpokenDate(grn.emptiedDate) }) : null,
    joinFacts(facts.slice(1)) || null,
    stockPhrase(grn.stock, grn.total),
    weightEach,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <HighlightedText style={styles.rowTitle} text={title} words={highlightWords} />
        </View>
        {grn.customerName ? (
          <View style={styles.rowLine}>
            <Icon name="account-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.rowFootnote} numberOfLines={2}>
              {grn.customerName}
            </Text>
          </View>
        ) : null}
        {received ? (
          <View style={styles.rowLine}>
            <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.rowFootnote}>{received}</Text>
          </View>
        ) : null}
        {emptied ? (
          <View style={styles.rowLine}>
            <Icon name="truck-delivery-outline" size={iconSize.sm} color={t.icon.secondary} />
            <Text style={styles.rowFootnote}>{emptied}</Text>
          </View>
        ) : null}
        <FactLines facts={facts} style={styles.rowFootnote} />
      </View>

      <View style={styles.rowValue}>
        <Text style={[styles.rowStock, muted && styles.rowStockMuted]}>{formatNumber(grn.stock)}</Text>
        {hasTotal ? (
          <Text style={styles.rowSecondary}>{tr('reports.itemStockSummary.ofTotal', { total: formatNumber(grn.total) })}</Text>
        ) : null}
        {weightEach ? <Text style={styles.rowSecondary}>{weightEach}</Text> : null}
      </View>

      {isNavigable ? <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} /> : null}
    </>
  );

  if (isNavigable && grnId && onOpen) {
    return (
      <Pressable
        style={({ pressed }) => [styles.row, !isLast && styles.rowDivider, pressed && styles.pressed]}
        onPress={() => onOpen(grnId)}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={tr('reports.shared.opensGrnHint')}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]} accessible accessibilityLabel={a11yLabel}>
      {content}
    </View>
  );
};

// ============================================================================
// CARD
// ============================================================================

export const StockItemCard: React.FC<StockItemCardProps> = ({
  name,
  packaging,
  grnCount,
  stock,
  total,
  outOfStock = false,
  lowStock = false,
  isExpanded,
  onToggle,
  grns,
  emptyGRNsText,
  grnsFooter,
  grnsMore,
  onOpenGRN,
  highlightWords,
  matchLine,
  grnsInList = false,
  style,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const reduceMotion = useReducedMotion();

  const grnCountText = formatCount(grnCount, 'GRN');
  const grnText = outOfStock ? tr('reports.stockSummary.grnsDispatched', { grns: grnCountText }) : grnCountText;
  const facts = [packaging || null, grnText];
  const hasTotal = !!total && total > 0;
  const status = outOfStock
    ? { status: 'negative' as const, label: tr('common.outOfStock') }
    : lowStock
      ? { status: 'critical' as const, label: tr('common.lowStock') }
      : null;

  // Only a closed card names the match; an open one shows it in its GRNs.
  const shownMatch = !isExpanded && matchLine ? matchLine : null;

  // "Potato, 50 kg bag, 10 of 100 in stock, 1 GRN, Low stock, GRN A0042"
  const a11yLabel = [name, packaging || null, outOfStock ? null : stockPhrase(stock, total), grnText, status?.label, shownMatch]
    .filter(Boolean)
    .join(', ');

  const handlePress = () => {
    animateExpand(reduceMotion);
    onToggle();
  };

  const rows = grns.status === 'loaded' ? grns.rows : [];
  // With `grnsInList` the loaded GRNs are the list's rows under this card, not its body.
  const rowsInList = grnsInList && rows.length > 0;
  const joined = isExpanded && rowsInList;
  const showBody = isExpanded && !rowsInList && (grns.status !== 'loaded' || rows.length > 0 || !!emptyGRNsText);

  return (
    <View style={[styles.card, joined && styles.cardJoined, style]}>
      <View style={[styles.clip, joined && styles.clipJoined]}>
        <Pressable
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityState={{ expanded: isExpanded }}
          accessibilityHint={isExpanded ? tr('reports.shared.hidesGrnsHint') : tr('reports.stockSummary.showsGrnsHint')}
        >
          <View style={[styles.image, outOfStock && styles.imageMuted]}>
            <Icon
              name={outOfStock ? 'cube-off-outline' : 'cube-outline'}
              size={iconSize.lg}
              color={outOfStock ? t.status.neutral.text : t.brand.tint}
            />
          </View>

          <View style={styles.content}>
            <HighlightedText style={styles.title} numberOfLines={2} text={name} words={highlightWords} />
            <FactLines facts={facts} style={styles.subtitle} numberOfLines={2} />
            {status ? <StatusTag status={status.status} label={status.label} style={styles.tag} /> : null}
            {shownMatch ? (
              <HighlightedText
                style={styles.matchLine}
                numberOfLines={2}
                text={shownMatch}
                words={highlightWords}
                testID="stock-item-match-line"
              />
            ) : null}
          </View>

          {!outOfStock ? (
            <View style={styles.value}>
              <Text style={styles.valueText}>{formatNumber(stock)}</Text>
              <Text style={styles.valueLabel}>
                {hasTotal ? tr('reports.itemStockSummary.ofTotal', { total: formatNumber(total) }) : tr('reports.shared.units', { count: stock })}
              </Text>
            </View>
          ) : null}

          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {showBody ? (
          <View style={styles.body}>
            {grns.status === 'loading' ? (
              <View style={styles.loading} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={t.brand.tint} />
                <Text style={styles.loadingText}>{tr('reports.itemStockSummary.loadingGrns')}</Text>
              </View>
            ) : grns.status === 'failed' ? (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{tr('reports.itemStockSummary.grnsLoadError')}</Text>
                <Button type="tertiary" size="compact" onPress={grns.onRetry}>
                  {tr('common.retry')}
                </Button>
              </View>
            ) : rows.length > 0 ? (
              rows.map((row, index) => (
                <GRNRowView
                  key={row.key}
                  grn={row}
                  isLast={index === rows.length - 1}
                  muted={outOfStock}
                  onOpen={onOpenGRN}
                  highlightWords={highlightWords}
                  styles={styles}
                  t={t}
                />
              ))
            ) : (
              <Text style={styles.empty}>{emptyGRNsText}</Text>
            )}
            {grnsFooter && rows.length > 0 ? <Text style={styles.grnsFooter}>{grnsFooter}</Text> : null}
            {grnsMore && rows.length > 0 ? (
              <ReportLoadMoreFooter
                state={grnsMore.state}
                loadingText={tr('reports.itemStockSummary.grnLinesLoading')}
                failedText={tr('reports.itemStockSummary.grnLinesLoadError')}
                moreLabel={tr('reports.itemStockSummary.grnLinesMore')}
                onLoadMore={grnsMore.onLoadMore}
                onRetry={grnsMore.onRetry}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default StockItemCard;
