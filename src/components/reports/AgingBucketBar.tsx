/**
 * AgingBucketBar: how a customer's stock is spread over the four stock-age
 * buckets (0–120, 121–240, 241–364 and over 364 days).
 *
 * Shared by the stock aging and customer activity reports (docs/STYLE_GUIDE.md
 * §13.11). Each bucket shows its status tag (§3.5: positive, informative,
 * critical, negative), its share of the whole stock and its quantity with the
 * unit, then a bar whose length is that share of the full track: the bars
 * together add up to 100%, so a short bar means little stock, not "less than the
 * largest bucket". Colour is never the only sign of a bucket; the tag word and
 * the figures carry it.
 *
 * The group is one element for screen readers, with one sentence per bucket
 * (§11.3, "charts have a text summary"). Nothing in it is pressable.
 *
 * Text size: the tag and the figures sit on one line that wraps; at a large
 * font the figures move under the tag and stay right aligned. No figure has
 * numberOfLines.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { formatCount, formatPercentage } from '@/utils/formatters';
import { t as tr, type TranslationKey } from '@/i18n';

/** The stock-age buckets, youngest first. */
export type AgingBucketId = '0-120' | '121-240' | '241-364' | 'over-364';

export const AGING_BUCKET_IDS: readonly AgingBucketId[] = ['0-120', '121-240', '241-364', 'over-364'];

export interface AgingBucket {
  id: AgingBucketId;
  /** Quantity in the bucket, in `unit`. */
  quantity: number;
}

export interface AgingBucketBarProps {
  /** The buckets to draw, in the order given (use `agingBucketsFrom` for report data). */
  buckets: AgingBucket[];
  /**
   * The counted noun of the quantity, as `formatCount` takes it (English
   * singular, translated by `src/i18n/locales/common.ts`). Default `'unit'`,
   * which reads "1,200 units" / "૧,૨૦૦ નંગ" like `reports.shared.unitsValue`.
   */
  unit?: string;
  /** Optional heading drawn above the bars. Screens that have a section header leave it out. */
  title?: string;
  /** Tighter spacing and smaller figures, for a card that holds other content. */
  compact?: boolean;
  /**
   * Reserved for filtering a list by bucket. Not wired in this version: no row
   * is pressable until both report screens have a handler for it.
   */
  onPress?: (id: AgingBucketId) => void;
  testID?: string;
}

/** Status of each bucket (STYLE_GUIDE §3.5, "Stock age"). */
export const AGING_BUCKET_STATUS: Record<AgingBucketId, StatusKind> = {
  '0-120': 'positive',
  '121-240': 'informative',
  '241-364': 'critical',
  'over-364': 'negative',
};

// Keys, not text: the label is looked up when drawn (docs/I18N.md rule 2).
const LABEL_KEYS: Record<AgingBucketId, TranslationKey> = {
  '0-120': 'reports.stockAging.bucket0to120',
  '121-240': 'reports.stockAging.bucket121to240',
  '241-364': 'reports.stockAging.bucket241to364',
  'over-364': 'reports.stockAging.bucketOver364',
};

/** The bucket keys the report RPCs send in `by_bucket` (thresholds 120 / 240 / 364). */
const RPC_KEYS: Record<AgingBucketId, string> = {
  '0-120': '0-120',
  '121-240': '121-240',
  '241-364': '241-364',
  'over-364': '364+',
};

/** The word for a bucket, in the app language. */
export const agingBucketLabel = (id: AgingBucketId): string => tr(LABEL_KEYS[id]);

/** The bucket for a key sent by the backend ('0-120' … '364+'); undefined for anything else. */
export const agingBucketIdFromKey = (key: string): AgingBucketId | undefined =>
  AGING_BUCKET_IDS.find((id) => RPC_KEYS[id] === key);

/**
 * The four buckets from a report's `by_bucket`, youngest first. A bucket the
 * backend left out counts as 0; keys outside the four are ignored.
 */
export function agingBucketsFrom(
  byBucket: Record<string, { total_quantity?: number | null } | null | undefined> | null | undefined,
): AgingBucket[] {
  return AGING_BUCKET_IDS.map((id) => ({ id, quantity: byBucket?.[RPC_KEYS[id]]?.total_quantity ?? 0 }));
}

/** A quantity that can be drawn: missing, negative or not a number counts as 0. */
const drawable = (quantity: number): number => (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    root: { gap: space.md },
    title: { ...typography.headline, color: t.text.primary },
    rows: { gap: space.md },
    rowsCompact: { gap: space.sm },
    row: { gap: space.xs },
    // Tag and figures share a line that wraps: at a large font the figures drop
    // under the tag instead of squeezing it.
    topLine: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: space.sm,
      rowGap: space.xxs,
    },
    tag: { flexShrink: 1 },
    figures: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      alignItems: 'baseline',
      columnGap: space.sm,
      marginLeft: 'auto',
    },
    share: {
      ...typography.subhead,
      fontWeight: fontWeight.semibold,
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    shareCompact: { ...typography.footnote, fontWeight: fontWeight.semibold },
    quantity: {
      ...typography.footnote,
      color: t.text.secondary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    // Full width on every row, so the bars can be compared with each other.
    track: {
      height: space.sm,
      borderRadius: radius.pill,
      overflow: 'hidden',
      backgroundColor: t.brand.subtleStrong,
    },
    fill: { height: '100%', borderRadius: radius.pill },
    empty: { ...typography.subhead, color: t.text.secondary },
  });

export function AgingBucketBar({ buckets, unit = 'unit', title, compact = false, testID }: AgingBucketBarProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const total = buckets.reduce((sum, b) => sum + drawable(b.quantity), 0);
  const rows = buckets.map((b) => {
    const quantity = drawable(b.quantity);
    const share = total > 0 ? (quantity / total) * 100 : 0;
    const label = agingBucketLabel(b.id);
    const shareText = formatPercentage(share);
    const quantityText = formatCount(quantity, unit);
    return { id: b.id, kind: AGING_BUCKET_STATUS[b.id], label, share, shareText, quantityText };
  });

  const summary =
    total > 0
      ? rows
          .map((r) => tr('reports.stockAging.bucketShareA11y', { label: r.label, share: r.shareText, quantity: r.quantityText }))
          .join(' ')
      : tr('reports.shared.noStockYet');

  return (
    <View style={styles.root} testID={testID}>
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View accessible accessibilityLabel={summary}>
        {/* The summary above is what a screen reader reads; the parts are hidden from it. */}
        <View
          style={[styles.rows, compact && styles.rowsCompact]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {total > 0 ? (
            rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={styles.topLine}>
                  <View style={styles.tag}>
                    <StatusTag status={r.kind} label={r.label} />
                  </View>
                  <View style={styles.figures}>
                    <Text style={[styles.share, compact && styles.shareCompact]}>{r.shareText}</Text>
                    <Text style={styles.quantity}>{r.quantityText}</Text>
                  </View>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${r.share}%`, backgroundColor: t.status[r.kind].element }]} />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{tr('reports.shared.noStockYet')}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default AgingBucketBar;
