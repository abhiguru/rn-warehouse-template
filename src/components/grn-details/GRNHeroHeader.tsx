/**
 * GRNHeroHeader: the object page header of a GRN (style guide §13.8, §14.2).
 *
 * Sits on surface.card: document type, GRN number, customer and date, a stock
 * status tag (icon plus word), the three key quantities, and a segmented bar
 * showing how the received quantity splits into stock and dispatched.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { FioriSegmentedProgress } from '@/components/FioriLinearProgress';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatDate, formatNumber } from '@/utils/formatters';
import { StatusTag } from '@/components/ui/StatusTag';
import { getGRNStockStatus } from '@/features/grn/utils/grnStockStatus';

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
  tag: { marginTop: space.xs },
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

  // Fully dispatched is neutral; otherwise the app-wide low-stock rule.
  const stockStatus = getGRNStockStatus(safeStock, safeQty);

  const shownDate = formatDate(date);
  const formattedDate = shownDate === '—' ? null : shownDate;
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
          <StatusTag
            status={stockStatus.status}
            label={stockStatus.label}
            icon={stockStatus.icon}
            style={styles.tag}
          />
        )}
      </View>

      {/* Key facts */}
      <View style={styles.facts}>
        {facts.map(fact => (
          <View
            key={fact.key}
            style={styles.fact}
            accessible
            accessibilityLabel={`${fact.label}: ${formatNumber(fact.value)}`}
          >
            <Text style={styles.factLabel} numberOfLines={1}>
              {fact.label}
            </Text>
            <Text style={styles.factValue}>{formatNumber(fact.value)}</Text>
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
