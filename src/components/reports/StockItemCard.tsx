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
 * - GRN rows: the GRN number is never cut short (§4); a row that opens the GRN is a
 *   button with a chevron, a row that does not is read as one element with neither
 * - expanding uses `motion.standard` and does not animate with Reduce Motion (§9)
 * - loading, error with "Try again" and empty states for GRNs read on demand (§14)
 */

import React from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutAnimationConfig,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  motion,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { StatusTag } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { formatCount, formatDate, formatNumber, formatWeight } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import { FactLines, joinFacts } from './FactLines';

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
  /** Total weight in kg; shown when above 0. */
  weight?: number | null;
  /** Weight of one unit in kg; shown when above 0. */
  weightEach?: number | null;
  /** Units still in stock. */
  stock: number;
  /** Units received; "of {total}" is shown when above 0. */
  total?: number | null;
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
  /** Opens a GRN; rows with a GRN id become buttons only when this is given. */
  onOpenGRN?: (grnId: string) => void;
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

/** Opening or closing a section (§9): 200 ms, ease-out in, ease-in out. */
export const EXPAND_ANIMATION: LayoutAnimationConfig = {
  duration: motion.standard,
  create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeIn, property: LayoutAnimation.Properties.opacity },
};

/** Animates the next layout change as an expanding section, unless Reduce Motion is on. */
export const animateExpand = (reduceMotion: boolean): void => {
  if (!reduceMotion) LayoutAnimation.configureNext(EXPAND_ANIMATION);
};

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
  });

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// GRN ROW
// ============================================================================

/** "10 of 100 in stock", or "10 units" when what was received is not known. */
const stockPhrase = (stock: number, total: number | null | undefined): string =>
  total && total > 0
    ? tr('reports.itemStockSummary.stockOfInStock', { stock: formatNumber(stock), total: formatNumber(total) })
    : tr('reports.shared.unitsValue', { value: formatNumber(stock) });

export interface StockGRNRowProps {
  grn: StockGRNRowData;
  isLast?: boolean;
  /** Muted stock figure (out-of-stock items). */
  muted?: boolean;
  onOpen?: (grnId: string) => void;
}

export const StockGRNRow: React.FC<StockGRNRowProps> = ({ grn, isLast = false, muted = false, onOpen }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  return <GRNRowView grn={grn} isLast={isLast} muted={muted} onOpen={onOpen} styles={styles} t={t} />;
};

const GRNRowView: React.FC<StockGRNRowProps & { styles: Styles; t: ThemeTokens }> = ({
  grn,
  isLast = false,
  muted = false,
  onOpen,
  styles,
  t,
}) => {
  const grnId = grn.grnId || null;
  const isNavigable = !!grnId && !!onOpen;

  const title = tr('reports.shared.grnNumber', { number: formatIdentifier(grn.grNo) });
  const received = grn.receivedDate ? tr('reports.shared.receivedOn', { date: formatDate(grn.receivedDate, 'short') }) : null;
  const emptied = grn.emptiedDate ? tr('reports.stockSummary.emptiedOn', { date: formatDate(grn.emptiedDate, 'short') }) : null;
  const facts = [
    grn.packaging || null,
    grn.rack ? tr('reports.shared.rack', { rack: formatIdentifier(grn.rack) }) : null,
    grn.weight && grn.weight > 0 ? formatWeight(grn.weight) : null,
  ];
  const hasTotal = !!grn.total && grn.total > 0;
  const weightEach =
    grn.weightEach && grn.weightEach > 0 ? tr('reports.stockSummary.weightEach', { weight: formatWeight(grn.weightEach) }) : null;

  const a11yLabel = [
    title,
    grn.packageMark ? tr('reports.shared.markA11y', { mark: grn.packageMark }) : null,
    grn.customerName || null,
    received,
    emptied,
    joinFacts(facts) || null,
    stockPhrase(grn.stock, grn.total),
    weightEach,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {grn.packageMark ? <StatusTag status="neutral" label={grn.packageMark} icon={null} /> : null}
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
  onOpenGRN,
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

  // "Potato, 50 kg bag, 10 of 100 in stock, 1 GRN, Low stock"
  const a11yLabel = [name, packaging || null, outOfStock ? null : stockPhrase(stock, total), grnText, status?.label]
    .filter(Boolean)
    .join(', ');

  const handlePress = () => {
    animateExpand(reduceMotion);
    onToggle();
  };

  const rows = grns.status === 'loaded' ? grns.rows : [];
  const showBody = isExpanded && (grns.status !== 'loaded' || rows.length > 0 || !!emptyGRNsText);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.clip}>
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
            <Text style={styles.title} numberOfLines={2}>
              {name}
            </Text>
            <FactLines facts={facts} style={styles.subtitle} numberOfLines={2} />
            {status ? <StatusTag status={status.status} label={status.label} style={styles.tag} /> : null}
          </View>

          {!outOfStock ? (
            <View style={styles.value}>
              <Text style={styles.valueText}>{formatNumber(stock)}</Text>
              <Text style={styles.valueLabel}>
                {hasTotal ? tr('reports.itemStockSummary.ofTotal', { total: formatNumber(total) }) : tr('reports.shared.units')}
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
                  styles={styles}
                  t={t}
                />
              ))
            ) : (
              <Text style={styles.empty}>{emptyGRNsText}</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default StockItemCard;
