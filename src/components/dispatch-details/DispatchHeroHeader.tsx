/**
 * DispatchHeroHeader Component (SAP Fiori object header)
 *
 * Object page header on surface.card (docs/STYLE_GUIDE.md §13.8):
 * document type, number, customer and date, then key facts
 * (items and bags). Never brand-filled.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, toDate } from '@/utils/formatters';

// ============================================================================
// TYPES - Using snake_case to match backend
// ============================================================================

interface DispatchHeroHeaderProps {
  disp_no: string;
  date: string;
  total_items: number;
  total_quantity: number;
  customer_name?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  surface: {
    backgroundColor: t.surface.card,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  docType: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  number: {
    ...typography.title2,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  subtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  statsContainer: {
    flexDirection: 'row' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    backgroundColor: t.background.base,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.button,
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  statLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

export const DispatchHeroHeader: React.FC<DispatchHeroHeaderProps> = ({
  disp_no,
  date,
  total_items,
  total_quantity,
  customer_name,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Ensure all numeric values are valid numbers (handle null/undefined)
  const safeItems = Number(total_items) || 0;
  const safeQuantity = Number(total_quantity) || 0;
  const dateLabel = toDate(date) ? formatDate(date) : '';
  const subtitle = [customer_name, dateLabel].filter(Boolean).join(' · ');

  return (
    <View style={styles.surface}>
      <Text style={styles.docType}>Dispatch</Text>
      {!!disp_no && (
        <Text style={styles.number} accessibilityRole="header">
          {disp_no}
        </Text>
      )}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {/* Key facts */}
      <View style={styles.statsContainer}>
        <View
          style={styles.statChip}
          accessible
          accessibilityLabel={formatCount(safeItems, 'item')}
        >
          <Icon name="cube-outline" size={iconSize.md} color={t.icon.secondary} />
          <View style={styles.statContent}>
            <Text style={styles.statValue}>{formatNumber(safeItems)}</Text>
            <Text style={styles.statLabel}>{safeItems === 1 ? 'Item' : 'Items'}</Text>
          </View>
        </View>

        <View
          style={styles.statChip}
          accessible
          accessibilityLabel={`${formatCount(safeQuantity, 'bag')} dispatched`}
        >
          <Icon name="truck-delivery-outline" size={iconSize.md} color={t.icon.secondary} />
          <View style={styles.statContent}>
            <Text style={styles.statValue}>{formatNumber(safeQuantity)}</Text>
            <Text style={styles.statLabel}>{safeQuantity === 1 ? 'Bag' : 'Bags'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};
