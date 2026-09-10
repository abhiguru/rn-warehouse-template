/**
 * KPIGrid Component - SAP Fiori Compliant
 *
 * A card container for displaying multiple KPI metrics in a 2-column grid.
 * Follows SAP Fiori Card spec with collapsible header.
 * Uses theme.colors.fiori for consistency with GRN/Dispatch/Invoice lists.
 *
 * @see design/sap-fiori-specs/13-card.md
 * @see design/sap-fiori-specs/14-section-header.md
 * @see src/theme/index.ts - FioriColors interface
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KPICard, KPIVariant } from './KPICard';
import { useListColors } from '@/hooks/useListColors';
import theme from '@/theme';

// ============================================================================
// SAP Fiori Design Tokens (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  dimensions: {
    cardCornerRadius: 12,
    cardPadding: 16,
    headerIconSize: 32,
    headerIconRadius: 8,
  },
  typography: {
    headerTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
    },
  },
};

export interface KPIItem {
  icon: string;
  value: string | number;
  label: string;
  variant?: KPIVariant;
  unit?: string;
  trend?: -1 | 0 | 1;
  trendValue?: string;
}

interface KPIGridProps {
  /** Title for the KPI section */
  title?: string;
  /** Array of KPI items to display */
  items: KPIItem[];
  /** Whether the grid is in loading state */
  isLoading?: boolean;
  /** Whether the grid is collapsible */
  collapsible?: boolean;
  /** Initial expanded state (default: true) */
  initialExpanded?: boolean;
  /** Compact mode - smaller cards, 3 columns, no header */
  compact?: boolean;
}

export const KPIGrid: React.FC<KPIGridProps> = ({
  title = 'Summary',
  items,
  isLoading = false,
  collapsible = true,
  initialExpanded = true,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: colors.cellBackground,
      marginHorizontal: FIORI_STATIC.dimensions.cardPadding,
      marginTop: 16,
      marginBottom: 8,
      borderRadius: FIORI_STATIC.dimensions.cardCornerRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      ...theme.shadows.sm,
      overflow: 'hidden',
    },
    containerCompact: {
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
      backgroundColor: colors.cellBackground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.cellDivider,
    },
    headerPressed: {
      backgroundColor: colors.cellBackgroundPressed,
    },
    headerIconContainer: {
      width: FIORI_STATIC.dimensions.headerIconSize,
      height: FIORI_STATIC.dimensions.headerIconSize,
      borderRadius: FIORI_STATIC.dimensions.headerIconRadius,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: FIORI_STATIC.typography.headerTitle.fontSize,
      fontWeight: FIORI_STATIC.typography.headerTitle.fontWeight,
      color: colors.textPrimary,
    },
  }), [colors]);

  const toggleExpand = () => {
    if (!collapsible || compact) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  // Create rows: 3 items per row in compact mode, 2 items otherwise
  const itemsPerRow = compact ? 3 : 2;
  const rows: KPIItem[][] = [];
  for (let i = 0; i < items.length; i += itemsPerRow) {
    rows.push(items.slice(i, i + itemsPerRow));
  }

  // Compact mode: no header, just the grid
  if (compact) {
    return (
      <View style={[dynamicStyles.container, dynamicStyles.containerCompact]}>
        <View style={styles.contentCompact}>
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((item, itemIndex) => (
                  <KPICard
                    key={`${rowIndex}-${itemIndex}`}
                    icon={item.icon}
                    value={item.value}
                    label={item.label}
                    variant={item.variant}
                    unit={item.unit}
                    trend={item.trend}
                    trendValue={item.trendValue}
                    isLoading={isLoading}
                    compact
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      {/* Fiori Card Header - Using Pressable for better feedback */}
      <Pressable
        style={({ pressed }) => [
          dynamicStyles.header,
          pressed && collapsible && dynamicStyles.headerPressed,
        ]}
        onPress={toggleExpand}
        accessibilityLabel={`${title}, ${isExpanded ? 'collapse' : 'expand'}`}
        accessibilityRole="button"
        accessibilityHint={collapsible ? 'Tap to toggle visibility' : undefined}
        disabled={!collapsible}
      >
        <View style={styles.headerLeft}>
          <View style={dynamicStyles.headerIconContainer}>
            <Icon name="chart-box-outline" size={18} color={colors.primary} />
          </View>
          <Text style={dynamicStyles.headerTitle}>{title}</Text>
        </View>
        {collapsible && (
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        )}
      </Pressable>

      {/* Card Body with KPI Grid */}
      {isExpanded && (
        <View style={styles.content}>
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((item, itemIndex) => (
                  <KPICard
                    key={`${rowIndex}-${itemIndex}`}
                    icon={item.icon}
                    value={item.value}
                    label={item.label}
                    variant={item.variant}
                    unit={item.unit}
                    trend={item.trend}
                    trendValue={item.trendValue}
                    isLoading={isLoading}
                  />
                ))}
                {/* Fill empty space if odd number of items in last row */}
                {row.length === 1 && <View style={styles.emptyCell} />}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// SAP Fiori Compliant Styles (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  content: {
    padding: 12,
  },
  contentCompact: {
    padding: 8,
  },
  grid: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyCell: {
    flex: 1,
  },
});

export default KPIGrid;
