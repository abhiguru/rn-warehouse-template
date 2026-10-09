/**
 * GRNHeroHeader: the object page header of a GRN (style guide §13.8, §14.2).
 *
 * Sits on surface.card: document type, GRN number, customer and date, a stock
 * status tag (icon plus word), the three key quantities, and a segmented bar
 * showing how the received quantity splits into stock and dispatched.
 */

import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { FioriSegmentedProgress } from '@/components/FioriLinearProgress';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { parseLocalISODate } from '@/utils/formatters';

// ============================================================================
// TYPES
// ============================================================================
interface GRNHeroHeaderProps {
  gr_no: string;
  date: string;
  total_qty: number;
  total_stock: number;
  total_dispatched: number;
  customer_name?: string;
}

type StockStatus = 'negative' | 'critical' | 'positive';

const STATUS_ICON: Record<StockStatus, string> = {
  negative: 'alert-circle',
  critical: 'alert',
  positive: 'check-circle',
};

const STATUS_LABEL: Record<StockStatus, string> = {
  negative: 'No stock left',
  critical: 'Low stock',
  positive: 'In stock',
};

const numberFormat = new Intl.NumberFormat('en-IN');

/** "9 Oct 2026" (style guide §12.3). Date-only strings are read in local time. */
export function formatGRNDate(value?: string | null): string | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalISODate(value) : new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  titleBlock: { flex: 1 },
  docType: { ...typography.footnote, color: t.text.secondary },
  number: { ...typography.title2, color: t.text.primary },
  meta: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  tag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.field,
    marginTop: space.xs,
  },
  tagText: { ...typography.caption1, fontWeight: fontWeight.semibold },
  facts: {
    flexDirection: 'row' as const,
    marginTop: space.lg,
    gap: space.sm,
  },
  fact: { flex: 1 },
  factLabel: { ...typography.footnote, color: t.text.secondary },
  factValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  progressSection: { marginTop: space.md },
  legendRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    columnGap: space.lg,
    rowGap: space.xs,
    marginBottom: space.sm,
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  legendDot: { width: space.sm, height: space.sm, borderRadius: radius.pill },
  legendText: { ...typography.footnote, color: t.text.secondary },
  legendValue: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
});

// ============================================================================
// COMPONENT
// ============================================================================
export const GRNHeroHeader: React.FC<GRNHeroHeaderProps> = ({
  gr_no,
  date,
  total_qty,
  total_stock,
  total_dispatched,
  customer_name,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeQty = Number(total_qty) || 0;
  const safeStock = Number(total_stock) || 0;
  const safeDispatched = Number(total_dispatched) || 0;

  const stockPercentage = safeQty > 0 ? Math.round((safeStock / safeQty) * 100) : 0;
  const dispatchPercentage = safeQty > 0 ? Math.round((safeDispatched / safeQty) * 100) : 0;

  // Stock level: empty is negative, under 20% is critical, otherwise positive.
  let stockStatus: StockStatus | null = null;
  if (safeQty > 0) {
    if (safeStock === 0) stockStatus = 'negative';
    else if (safeStock < safeQty * 0.2) stockStatus = 'critical';
    else stockStatus = 'positive';
  }

  const formattedDate = formatGRNDate(date);
  const meta = [customer_name, formattedDate].filter(Boolean).join(' · ');

  const stockSegmentColor = t.chart[0];
  const dispatchSegmentColor = t.chart[1];

  const facts = [
    { key: 'qty', label: 'Received', value: safeQty },
    { key: 'stock', label: 'In stock', value: safeStock },
    { key: 'dispatched', label: 'Dispatched', value: safeDispatched },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View
          style={styles.titleBlock}
          accessible
          accessibilityRole="header"
          accessibilityLabel={[`GRN ${gr_no}`, customer_name, formattedDate].filter(Boolean).join(', ')}
        >
          <Text style={styles.docType}>GRN</Text>
          <Text style={styles.number}>{gr_no}</Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>

        {stockStatus && (
          <View
            style={[styles.tag, { backgroundColor: t.status[stockStatus].background }]}
            accessible
            accessibilityLabel={`Status: ${STATUS_LABEL[stockStatus]}`}
          >
            <Icon name={STATUS_ICON[stockStatus]} size={iconSize.sm} color={t.status[stockStatus].text} />
            <Text
              style={[styles.tagText, { color: t.status[stockStatus].text }]}
              maxFontSizeMultiplier={1.6}
            >
              {STATUS_LABEL[stockStatus]}
            </Text>
          </View>
        )}
      </View>

      {/* Key facts */}
      <View style={styles.facts}>
        {facts.map(fact => (
          <View
            key={fact.key}
            style={styles.fact}
            accessible
            accessibilityLabel={`${fact.label}: ${numberFormat.format(fact.value)}`}
          >
            <Text style={styles.factLabel} numberOfLines={1}>
              {fact.label}
            </Text>
            <Text style={styles.factValue}>{numberFormat.format(fact.value)}</Text>
          </View>
        ))}
      </View>

      {/* Stock and dispatch split */}
      {safeQty > 0 && (
        <View
          style={styles.progressSection}
          accessible
          accessibilityLabel={`${stockPercentage}% in stock, ${dispatchPercentage}% dispatched`}
        >
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: stockSegmentColor }]} />
              <Text style={styles.legendText}>
                In stock <Text style={styles.legendValue}>{stockPercentage}%</Text>
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: dispatchSegmentColor }]} />
              <Text style={styles.legendText}>
                Dispatched <Text style={styles.legendValue}>{dispatchPercentage}%</Text>
              </Text>
            </View>
          </View>

          <FioriSegmentedProgress
            segments={[
              { value: safeStock, color: stockSegmentColor },
              { value: safeDispatched, color: dispatchSegmentColor },
            ]}
            total={safeQty}
            size="prominent"
            showLabels={false}
          />
        </View>
      )}
    </View>
  );
};
