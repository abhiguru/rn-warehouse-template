/**
 * GRNItemCard: one received item on the GRN object page (style guide §13.6).
 *
 * Title and received quantity on top, a stock status tag (icon plus word),
 * then stock, dispatched and weight as key facts, and the lot mark, packaging
 * and rack as neutral tags.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { StatusTag } from '@/components/ui';
import { formatNumber, formatWeight } from '@/utils/formatters';
import { getGRNStockStatus } from '@/features/grn/utils/grnStockStatus';

// ============================================================================
// TYPES - Using snake_case to match backend RPC types
// ============================================================================

interface GRNItemCardProps {
  item_name: string;
  qty: number;
  stock: number;
  total_dispatched: number;
  weight?: number | null;
  packaging?: string | null;
  rack?: string | null;
  package_mark?: string | null;
  processed_images?: Array<{ id: string; image_url: string }>;
  onViewImages?: () => void;
  onViewDispatches?: () => void;
}


// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  card: {
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  titleBlock: { flex: 1 },
  itemName: { ...typography.headline, color: t.text.primary },
  tag: { marginTop: space.xs },
  qtyBlock: { alignItems: 'flex-end' as const },
  qtyValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  qtyLabel: { ...typography.footnote, color: t.text.secondary },
  metricsSection: {
    flexDirection: 'row' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  metricItem: { flex: 1 },
  metricLabel: { ...typography.footnote, color: t.text.secondary },
  metricValue: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  detailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.divider,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

const GRNItemCardComponent: React.FC<GRNItemCardProps> = ({
  item_name,
  qty,
  stock,
  total_dispatched,
  weight,
  packaging,
  rack,
  package_mark,
}) => {
  const styles = useThemedStyles(makeStyles);

  // Fully dispatched is neutral; otherwise the app-wide low-stock rule.
  const stockStatus = getGRNStockStatus(stock, qty);
  const hasDetails = package_mark || packaging || rack;
  const showWeight = weight !== undefined && weight !== null;

  const details = [
    package_mark ? { icon: 'label-outline', text: `Mark ${package_mark}` } : null,
    packaging ? { icon: 'package-variant-closed', text: packaging } : null,
    rack ? { icon: 'view-grid-outline', text: `Rack ${rack}` } : null,
  ].filter((d): d is { icon: string; text: string } => d !== null);

  const a11yLabel = [
    item_name,
    `${formatNumber(qty)} received`,
    stockStatus?.label,
    `${formatNumber(stock)} in stock`,
    `${formatNumber(total_dispatched)} dispatched`,
    showWeight ? formatWeight(Number(weight)) : null,
    ...details.map(d => d.text),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item_name}
          </Text>
          {stockStatus && (
            <StatusTag
              status={stockStatus.status}
              label={stockStatus.label}
              icon={stockStatus.icon}
              style={styles.tag}
            />
          )}
        </View>
        <View style={styles.qtyBlock}>
          <Text style={styles.qtyValue}>{formatNumber(qty)}</Text>
          <Text style={styles.qtyLabel}>Received</Text>
        </View>
      </View>

      <View style={styles.metricsSection}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>In stock</Text>
          <Text style={styles.metricValue}>{formatNumber(stock)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Dispatched</Text>
          <Text style={styles.metricValue}>{formatNumber(total_dispatched)}</Text>
        </View>
        {showWeight && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Weight</Text>
            <Text style={styles.metricValue}>{formatWeight(Number(weight))}</Text>
          </View>
        )}
      </View>

      {hasDetails && (
        <View style={styles.detailsRow}>
          {details.map(detail => (
            <StatusTag key={detail.icon} status="neutral" label={detail.text} icon={detail.icon} />
          ))}
        </View>
      )}
    </View>
  );
};

// Export memoized component for performance
export const GRNItemCard = React.memo(GRNItemCardComponent);
