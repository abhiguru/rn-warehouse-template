/**
 * DispatchItemCard Component - SAP Fiori Design
 *
 * Card displaying individual dispatch item with GRN reference.
 * @see design/sap-fiori-specs/13-card.md
 *
 * Features:
 * - Fiori Card structure (header/body layout)
 * - Clickable GRN reference with 44pt touch targets
 * - Platform-specific shadows
 * - Dynamic colors for dark mode support
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI = {
  card: {
    cornerRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    title: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
    label: {
      fontSize: 11,
      fontWeight: '500' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    body: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    chip: {
      fontSize: 12,
      fontWeight: '500' as const,
    },
  },
  touchTarget: 44,
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
} as const;

// ============================================================================
// UTILITIES
// ============================================================================

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ============================================================================
// TYPES - Using snake_case to match backend
// ============================================================================

export interface DispatchItemCardProps {
  item_name: string;
  dispatch_quantity: number;
  grn_no: string;
  grn_date: string;
  grn_id?: string;
  original_quantity?: number;
  weight?: number;
  package_mark?: string;
  onViewGRN?: (grn_id: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

const DispatchItemCardComponent: React.FC<DispatchItemCardProps> = ({
  item_name,
  dispatch_quantity,
  grn_no,
  grn_date,
  grn_id,
  original_quantity,
  weight,
  package_mark,
  onViewGRN,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  const handleGRNPress = useCallback(() => {
    if (grn_id && onViewGRN) {
      onViewGRN(grn_id);
    }
  }, [grn_id, onViewGRN]);

  const formattedGrnDate = useMemo(() => formatDate(grn_date), [grn_date]);
  const hasDetails = original_quantity !== undefined || weight !== undefined || package_mark;
  const isGrnClickable = grn_id && onViewGRN;

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    card: {
      marginHorizontal: FIORI.card.marginHorizontal,
      marginBottom: FIORI.card.marginBottom,
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI.card.cornerRadius,
      borderWidth: FIORI.card.borderWidth,
      borderColor: colors.cellDivider,
      overflow: 'hidden',
      ...FIORI.shadow,
    },
    itemName: {
      flex: 1,
      ...FIORI.typography.title,
      color: colors.gray900,
      marginRight: FIORI.spacing.sm,
    },
    quantityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      gap: FIORI.spacing.xs,
    },
    quantityText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    grnSection: {
      paddingHorizontal: FIORI.spacing.lg,
      paddingBottom: FIORI.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
    },
    grnIconBg: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: colors.tealLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    grnLabel: {
      ...FIORI.typography.label,
      color: colors.gray600,
    },
    grnButton: {
      backgroundColor: colors.gray50,
      borderRadius: 8,
      padding: FIORI.spacing.md,
      marginBottom: FIORI.spacing.sm,
      minHeight: FIORI.touchTarget,
      justifyContent: 'center',
    },
    grnButtonPressed: {
      backgroundColor: colors.gray100,
    },
    grnNo: {
      ...FIORI.typography.subtitle,
      color: colors.gray900,
      marginBottom: 2,
    },
    grnDate: {
      ...FIORI.typography.body,
      color: colors.gray600,
    },
    detailChip: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      paddingHorizontal: FIORI.spacing.md,
      backgroundColor: colors.gray100,
      borderRadius: 16,
      gap: FIORI.spacing.xs,
    },
    detailChipText: {
      ...FIORI.typography.chip,
      color: colors.gray600,
    },
  }), [colors]);

  return (
    <View style={dynamicStyles.card}>
      {/* Header - Item name with dispatch quantity badge */}
      <View style={styles.header}>
        <Text style={dynamicStyles.itemName} numberOfLines={2}>
          {item_name}
        </Text>
        <View style={dynamicStyles.quantityBadge}>
          <Icon name="package-variant" size={16} color={colors.primary} />
          <Text style={dynamicStyles.quantityText}>{dispatch_quantity}</Text>
        </View>
      </View>

      {/* GRN Reference Section */}
      <View style={dynamicStyles.grnSection}>
        <View style={styles.grnSectionHeader}>
          <View style={dynamicStyles.grnIconBg}>
            <Icon name="file-document-outline" size={16} color={colors.teal} />
          </View>
          <Text style={dynamicStyles.grnLabel}>From GRN</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            dynamicStyles.grnButton,
            pressed && isGrnClickable && dynamicStyles.grnButtonPressed,
          ]}
          onPress={handleGRNPress}
          disabled={!isGrnClickable}
          accessibilityRole="button"
          accessibilityLabel={`View GRN ${grn_no}`}
          accessibilityHint="Opens GRN details"
        >
          <View style={styles.grnContent}>
            <View style={styles.grnInfo}>
              <Text style={dynamicStyles.grnNo}>{grn_no}</Text>
              <Text style={dynamicStyles.grnDate}>{formattedGrnDate}</Text>
            </View>
            {isGrnClickable && (
              <Icon name="chevron-right" size={20} color={colors.primary} />
            )}
          </View>
        </Pressable>

        {/* GRN Details Chips */}
        {hasDetails && (
          <View style={styles.detailsRow}>
            {original_quantity !== undefined && (
              <View style={dynamicStyles.detailChip}>
                <Icon name="package-variant-closed" size={14} color={colors.gray500} />
                <Text style={dynamicStyles.detailChipText}>Orig: {original_quantity}</Text>
              </View>
            )}
            {weight !== undefined && (
              <View style={dynamicStyles.detailChip}>
                <Icon name="weight-kilogram" size={14} color={colors.gray500} />
                <Text style={dynamicStyles.detailChipText}>{weight}kg</Text>
              </View>
            )}
            {package_mark && (
              <View style={dynamicStyles.detailChip}>
                <Icon name="label-outline" size={14} color={colors.gray500} />
                <Text style={dynamicStyles.detailChipText}>{package_mark}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: FIORI.spacing.lg,
    paddingBottom: FIORI.spacing.md,
  },
  // GRN Section
  grnSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: FIORI.spacing.md,
    marginBottom: FIORI.spacing.sm,
    gap: FIORI.spacing.sm,
  },
  grnContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grnInfo: {
    flex: 1,
  },
  // Details Row
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI.spacing.sm,
  },
});

// Export memoized component for performance
export const DispatchItemCard = React.memo(DispatchItemCardComponent);
