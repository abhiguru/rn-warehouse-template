/**
 * DispatchGRNsTab Component - SAP Fiori object cells (docs/STYLE_GUIDE.md §13.6)
 *
 * Shows all GRNs involved in this dispatch
 * Features:
 * - List of GRN cards
 * - Each GRN shows items from that GRN
 * - Pressable to navigate to GRN details
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

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

const formatDate = (value: string) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const bags = (qty: number) => `${qty} ${qty === 1 ? 'bag' : 'bags'}`;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  content: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    paddingBottom: space.sm,
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.sm,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  grnHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    paddingBottom: space.md,
    minHeight: layout.objectCellMinHeight,
  },
  grnHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  iconCircle: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: space.md,
  },
  grnInfo: {
    flex: 1,
  },
  grnNo: {
    ...typography.headline,
    color: t.text.primary,
  },
  grnDate: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  itemsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  itemsLabel: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  itemsContainer: {
    gap: space.xs,
  },
  itemCard: {
    backgroundColor: t.background.base,
    borderRadius: radius.button,
    padding: space.sm,
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  itemName: {
    ...typography.subhead,
    flex: 1,
    color: t.text.primary,
  },
  quantityText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  itemDetailsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: space.s6,
    gap: space.s6,
  },
  detailPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    gap: space.xs,
  },
  detailPillText: {
    ...typography.caption1,
    color: t.status.neutral.text,
    fontVariant: ['tabular-nums' as const],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xl,
    minHeight: 400,
    backgroundColor: t.background.base,
  },
  emptyIcon: {
    marginBottom: space.md,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

export const DispatchGRNsTab: React.FC<DispatchGRNsTabProps> = ({
  grns,
  onViewGRN,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleGRNPress = (grn_id: string) => {
    if (onViewGRN) {
      onViewGRN(grn_id);
    }
  };

  if (grns.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>No GRNs for this dispatch</Text>
        <Text style={styles.emptySubtitle}>
          GRNs whose items are in this dispatch appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionHeaderText} accessibilityRole="header">Source GRNs</Text>

      {grns.map((grn) => {
        const dateLabel = formatDate(grn.grn_date);
        const itemCount = `${grn.items.length} ${grn.items.length === 1 ? 'item' : 'items'} dispatched`;
        return (
          <Pressable
            key={grn.grn_id}
            onPress={() => handleGRNPress(grn.grn_id)}
            disabled={!onViewGRN}
            accessibilityRole={onViewGRN ? 'button' : undefined}
            accessibilityLabel={`GRN ${grn.grn_no}${dateLabel ? `, ${dateLabel}` : ''}, ${itemCount}`}
            accessibilityHint={onViewGRN ? 'Opens the GRN' : undefined}
            style={({ pressed }) => [
              styles.card,
              pressed && onViewGRN && styles.cardPressed,
            ]}
          >
            {/* GRN Header */}
            <View style={styles.grnHeader}>
              <View style={styles.grnHeaderLeft}>
                <View style={styles.iconCircle}>
                  <Icon name="package-down" size={iconSize.md} color={t.brand.tint} />
                </View>
                <View style={styles.grnInfo}>
                  <Text style={styles.grnNo}>GRN {grn.grn_no}</Text>
                  {!!dateLabel && <Text style={styles.grnDate}>{dateLabel}</Text>}
                </View>
              </View>
              {onViewGRN && (
                <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
              )}
            </View>

            {/* Items Section */}
            <View style={styles.itemsSection}>
              <Text style={styles.itemsLabel}>{itemCount}</Text>

              <View style={styles.itemsContainer}>
                {grn.items.map((item, index) => (
                  <View key={index} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                      <Text style={styles.quantityText}>{bags(item.dispatch_quantity)}</Text>
                    </View>
                    {/* Item Details Row */}
                    {(item.original_quantity !== undefined || item.weight !== undefined || item.package_mark) && (
                      <View style={styles.itemDetailsRow}>
                        {item.original_quantity !== undefined && (
                          <View style={styles.detailPill}>
                            <Icon name="package-variant-closed" size={iconSize.sm} color={t.status.neutral.text} />
                            <Text style={styles.detailPillText} maxFontSizeMultiplier={1.6}>
                              Received {bags(item.original_quantity)}
                            </Text>
                          </View>
                        )}
                        {item.weight !== undefined && (
                          <View style={styles.detailPill}>
                            <Icon name="weight-kilogram" size={iconSize.sm} color={t.status.neutral.text} />
                            <Text style={styles.detailPillText} maxFontSizeMultiplier={1.6}>
                              {item.weight} kg
                            </Text>
                          </View>
                        )}
                        {item.package_mark && (
                          <View style={styles.detailPill}>
                            <Icon name="tag-outline" size={iconSize.sm} color={t.status.neutral.text} />
                            <Text style={styles.detailPillText} maxFontSizeMultiplier={1.6}>
                              {item.package_mark}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};
