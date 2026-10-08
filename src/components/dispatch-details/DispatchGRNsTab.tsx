/**
 * DispatchGRNsTab Component - 100% SAP Fiori Compliant
 *
 * Shows all GRNs involved in this dispatch
 * Features:
 * - List of GRN cards in Fiori style
 * - Each GRN shows items from that GRN
 * - Clickable to navigate to GRN details
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  typography: {
    headline: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
  },
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
    avatarSize: 44,
    touchTarget: 44,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }) as ViewStyle,
  },
} as const;

// Using snake_case to match backend RPC types
interface GRNItemSummary {
  item_name: string;
  dispatch_quantity: number;
  original_quantity?: number;
  weight?: number;
  package_mark?: string;
}

export interface GRNInfo {
  grn_id: string;
  grn_no: string;
  grn_date: string;
  items: GRNItemSummary[];
}

interface DispatchGRNsTabProps {
  grns: GRNInfo[];
  onViewGRN?: (grn_id: string) => void;
}

export const DispatchGRNsTab: React.FC<DispatchGRNsTabProps> = ({
  grns,
  onViewGRN,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray50,
    },
    sectionHeaderText: {
      ...FIORI_STATIC.typography.sectionHeader,
      color: colors.gray600,
    },
    card: {
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.cardRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      marginBottom: FIORI_STATIC.spacing.md,
      overflow: 'hidden',
      ...FIORI_STATIC.shadows.card,
    },
    cardPressed: {
      backgroundColor: colors.gray100,
    },
    iconCircle: {
      width: FIORI_STATIC.dimensions.avatarSize,
      height: FIORI_STATIC.dimensions.avatarSize,
      borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
      backgroundColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: FIORI_STATIC.spacing.md,
    },
    grnNo: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
      marginBottom: 2,
    },
    grnDate: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
    },
    itemsSection: {
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
      paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
      paddingTop: FIORI_STATIC.spacing.sm,
      paddingBottom: FIORI_STATIC.spacing.md,
    },
    itemsLabel: {
      ...FIORI_STATIC.typography.sectionHeader,
      color: colors.gray600,
    },
    itemCard: {
      backgroundColor: colors.gray50,
      borderRadius: 8,
      padding: FIORI_STATIC.spacing.sm,
      marginBottom: 6,
    },
    itemName: {
      flex: 1,
      ...FIORI_STATIC.typography.body,
      color: colors.gray900,
      marginRight: FIORI_STATIC.spacing.sm,
    },
    quantityChip: {
      paddingHorizontal: FIORI_STATIC.spacing.md,
      paddingVertical: FIORI_STATIC.spacing.sm,
      backgroundColor: colors.primaryLight,
      borderRadius: 12,
    },
    quantityChipText: {
      ...FIORI_STATIC.typography.caption,
      fontWeight: '700' as const,
      color: colors.primary,
    },
    detailPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cellBackground,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      gap: 3,
      borderWidth: 1,
      borderColor: colors.cellDivider,
    },
    detailPillText: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.gray600,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing.xl,
      minHeight: 400,
      backgroundColor: colors.gray50,
    },
    emptyTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
      marginBottom: FIORI_STATIC.spacing.sm,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
      textAlign: 'center',
      lineHeight: 20,
    },
  }), [colors]);

  const handleGRNPress = (grn_id: string) => {
    if (onViewGRN) {
      onViewGRN(grn_id);
    }
  };

  const renderEmpty = () => (
    <View style={dynamicStyles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Icon name="receipt" size={56} color={colors.gray500} />
      </View>
      <Text style={dynamicStyles.emptyTitle}>No GRNs found</Text>
      <Text style={dynamicStyles.emptySubtitle}>
        No GRNs are associated with this dispatch
      </Text>
    </View>
  );

  if (grns.length === 0) {
    return renderEmpty();
  }

  return (
    <ScrollView
      style={dynamicStyles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeader}>
        <Text style={dynamicStyles.sectionHeaderText}>Source GRNs</Text>
      </View>

      {grns.map((grn) => (
        <Pressable
          key={grn.grn_id}
          onPress={() => handleGRNPress(grn.grn_id)}
          disabled={!onViewGRN}
          accessibilityRole="button"
          accessibilityLabel={`View GRN ${grn.grn_no}`}
          style={({ pressed }) => [
            dynamicStyles.card,
            pressed && onViewGRN && dynamicStyles.cardPressed,
          ]}
        >
          {/* GRN Header */}
          <View style={styles.grnHeader}>
            <View style={styles.grnHeaderLeft}>
              <View style={dynamicStyles.iconCircle}>
                <Icon name="receipt" size={20} color={colors.primary} />
              </View>
              <View style={styles.grnInfo}>
                <Text style={dynamicStyles.grnNo}>{grn.grn_no}</Text>
                <Text style={dynamicStyles.grnDate}>
                  {new Date(grn.grn_date).toLocaleDateString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
            {onViewGRN && (
              <Icon name="chevron-right" size={20} color={colors.primary} />
            )}
          </View>

          {/* Items Section */}
          <View style={dynamicStyles.itemsSection}>
            <View style={styles.itemsHeader}>
              <Icon name="package-variant" size={14} color={colors.gray600} />
              <Text style={dynamicStyles.itemsLabel}>
                {grn.items.length} {grn.items.length === 1 ? 'Item' : 'Items'} Dispatched
              </Text>
            </View>

            <View style={styles.itemsContainer}>
              {grn.items.map((item, index) => (
                <View key={index} style={dynamicStyles.itemCard}>
                  <View style={styles.itemRow}>
                    <Text style={dynamicStyles.itemName} numberOfLines={1}>
                      {item.item_name}
                    </Text>
                    <View style={dynamicStyles.quantityChip}>
                      <Text style={dynamicStyles.quantityChipText}>
                        {item.dispatch_quantity}
                      </Text>
                    </View>
                  </View>
                  {/* Item Details Row */}
                  {(item.original_quantity !== undefined || item.weight !== undefined || item.package_mark) && (
                    <View style={styles.itemDetailsRow}>
                      {item.original_quantity !== undefined && (
                        <View style={dynamicStyles.detailPill}>
                          <Icon name="package-variant-closed" size={11} color={colors.gray600} />
                          <Text style={dynamicStyles.detailPillText}>Orig: {item.original_quantity}</Text>
                        </View>
                      )}
                      {item.weight !== undefined && (
                        <View style={dynamicStyles.detailPill}>
                          <Icon name="weight-kilogram" size={11} color={colors.gray600} />
                          <Text style={dynamicStyles.detailPillText}>{item.weight}kg</Text>
                        </View>
                      )}
                      {item.package_mark && (
                        <View style={dynamicStyles.detailPill}>
                          <Icon name="tag-outline" size={11} color={colors.gray600} />
                          <Text style={dynamicStyles.detailPillText}>{item.package_mark}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    paddingTop: FIORI_STATIC.spacing.md,
    paddingBottom: FIORI_STATIC.spacing.xl,
  },
  sectionHeader: {
    paddingBottom: FIORI_STATIC.spacing.sm,
  },
  grnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: FIORI_STATIC.dimensions.cardPadding,
    paddingBottom: FIORI_STATIC.spacing.sm,
  },
  grnHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  grnInfo: {
    flex: 1,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
    gap: 6,
  },
  itemsContainer: {
    gap: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  emptyIconContainer: {
    marginBottom: FIORI_STATIC.spacing.md,
  },
});
