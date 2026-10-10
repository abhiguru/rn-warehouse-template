/**
 * GRNDispatchTimeline Component
 *
 * Vertical timeline view for dispatch history
 * Features:
 * - Timeline layout with date markers
 * - Grouped by month with collapsible sections
 * - Object cells for each dispatch (docs/STYLE_GUIDE.md §13.6)
 * - Tap to navigate to dispatch details
 * - Empty state for no dispatches
 * - Mobile-optimized spacing and touch targets
 */

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCount, formatDate, formatNumber, toDate, formatMonth } from '@/utils/formatters';
import { t as tr } from '@/i18n';

export interface DispatchRecord {
  id: string;
  dispatchId: string;
  dispNo: string;
  dispDate: string;
  dispQuantity: number;
}

interface GroupedDispatches {
  month: string; // "January 2024"
  dispatches: DispatchRecord[];
}

interface GRNDispatchTimelineProps {
  dispatches: DispatchRecord[];
  loading?: boolean;
  itemName?: string; // If showing for specific item
}

/** Month group title, "October 2026" (the long date without the day). */
const monthTitle = (date: Date) => formatMonth(date, 'long');

const bagsLabel = (qty: number) => formatCount(qty, 'bag');

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  monthGroup: {
    position: 'relative' as const,
    marginBottom: space.sm,
  },
  monthHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.xs,
    borderRadius: radius.button,
    zIndex: 2,
  },
  monthHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  monthHeaderLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  monthDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    marginRight: space.xs,
  },
  monthText: {
    ...typography.headline,
    color: t.text.primary,
  },
  monthBadge: {
    backgroundColor: t.brand.subtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    minWidth: 18,
    alignItems: 'center' as const,
  },
  monthBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
    fontVariant: ['tabular-nums' as const],
  },
  timelineLine: {
    position: 'absolute' as const,
    left: space.xs + 5,
    top: touchTarget,
    bottom: 0,
    width: 2,
    backgroundColor: t.border.divider,
    zIndex: 0,
  },
  timeline: {
    alignItems: 'center' as const,
    marginRight: space.md,
    paddingTop: space.lg,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: t.icon.secondary,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: t.border.divider,
    marginTop: space.xs,
  },
  dispatchesContainer: {
    marginLeft: space.xxl,
  },
  dispatchWrapper: {
    flexDirection: 'row' as const,
    marginBottom: space.sm,
  },
  card: {
    flex: 1,
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  cardContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: space.md,
    minHeight: layout.rowMinHeight + space.lg,
  },
  cardLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  dispatchIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: space.md,
  },
  dispatchInfo: {
    flex: 1,
  },
  dispatchNo: {
    ...typography.headline,
    color: t.text.primary,
  },
  dispatchDate: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  cardRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  quantityBadge: {
    alignItems: 'flex-end' as const,
  },
  quantityText: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  quantityLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.giant,
  },
  emptyIconContainer: {
    marginBottom: space.lg,
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

export const GRNDispatchTimeline: React.FC<GRNDispatchTimelineProps> = ({
  dispatches,
  loading = false,
  itemName,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Group dispatches by month
  const groupedDispatches: GroupedDispatches[] = React.useMemo(() => {
    if (!dispatches.length) return [];

    const groups = new Map<string, DispatchRecord[]>();

    dispatches.forEach(dispatch => {
      const monthKey = monthTitle(toDate(dispatch.dispDate) ?? new Date(NaN));

      const existing = groups.get(monthKey);
      if (existing) {
        existing.push(dispatch);
      } else {
        groups.set(monthKey, [dispatch]);
      }
    });

    // Convert to array and sort by date (most recent first)
    const result: GroupedDispatches[] = Array.from(groups.entries())
      .map(([month, dispatches]) => ({
        month,
        dispatches: dispatches.sort(
          (a, b) =>
            new Date(b.dispDate).getTime() - new Date(a.dispDate).getTime()
        ),
      }))
      .sort((a, b) => {
        const dateA = new Date(a.dispatches[0].dispDate).getTime();
        const dateB = new Date(b.dispatches[0].dispDate).getTime();
        return dateB - dateA;
      });

    // Auto-expand the most recent month
    if (result.length > 0) {
      setExpandedMonths(new Set([result[0].month]));
    }

    return result;
  }, [dispatches]);

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(month)) {
        newSet.delete(month);
      } else {
        newSet.add(month);
      }
      return newSet;
    });
  };

  const handleDispatchPress = (dispatchId: string) => {
    router.push(`/dispatch-details/${dispatchId}`);
  };

  if (dispatches.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Icon name="truck-delivery-outline" size={iconSize.hero} color={t.icon.secondary} />
        </View>
        <Text style={styles.emptyTitle}>{tr('grn.dispatches.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>
          {itemName
            ? tr('grn.dispatches.emptyForItem', { item: itemName })
            : tr('grn.dispatches.emptyForGrn')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {groupedDispatches.map((group, groupIndex) => {
        const isExpanded = expandedMonths.has(group.month);
        const isLastGroup = groupIndex === groupedDispatches.length - 1;
        const countLabel = formatCount(group.dispatches.length, 'dispatch', 'dispatches');

        return (
          <View key={group.month} style={styles.monthGroup}>
            {/* Month Header */}
            <Pressable
              style={({ pressed }) => [styles.monthHeader, pressed && styles.monthHeaderPressed]}
              onPress={() => toggleMonth(group.month)}
              accessibilityRole="button"
              accessibilityLabel={`${group.month}, ${countLabel}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <View style={styles.monthHeaderLeft}>
                <View style={styles.monthDot} />
                <Text style={styles.monthText} accessibilityRole="header">{group.month}</Text>
                <View style={styles.monthBadge}>
                  <Text style={styles.monthBadgeText} maxFontSizeMultiplier={1.6}>
                    {formatNumber(group.dispatches.length)}
                  </Text>
                </View>
              </View>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={iconSize.md}
                color={t.icon.secondary}
              />
            </Pressable>

            {/* Timeline Line */}
            {!isLastGroup && <View style={styles.timelineLine} />}

            {/* Dispatches List */}
            {isExpanded && (
              <View style={styles.dispatchesContainer}>
                {group.dispatches.map((dispatch, dispatchIndex) => {
                  const isLast = dispatchIndex === group.dispatches.length - 1;
                  const dateLabel = formatDate(dispatch.dispDate, 'short');

                  return (
                    <View key={dispatch.id} style={styles.dispatchWrapper}>
                      {/* Timeline Connector */}
                      <View style={styles.timeline}>
                        <View style={styles.timelineDot} />
                        {!isLast && <View style={styles.timelineConnector} />}
                      </View>

                      {/* Dispatch Card */}
                      <Pressable
                        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                        onPress={() => handleDispatchPress(dispatch.dispatchId)}
                        accessibilityRole="button"
                        accessibilityLabel={tr('grn.dispatches.rowLabel', { number: String(dispatch.dispNo), bags: bagsLabel(dispatch.dispQuantity), date: dateLabel })}
                        accessibilityHint={tr('grn.dispatches.openHint')}
                      >
                        <View style={styles.cardContent}>
                          {/* Left: Icon and Info */}
                          <View style={styles.cardLeft}>
                            <View style={styles.dispatchIcon}>
                              <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
                            </View>
                            <View style={styles.dispatchInfo}>
                              <Text style={styles.dispatchNo}>{dispatch.dispNo}</Text>
                              <Text style={styles.dispatchDate}>{dateLabel}</Text>
                            </View>
                          </View>

                          {/* Right: Quantity and Arrow */}
                          <View style={styles.cardRight}>
                            <View style={styles.quantityBadge}>
                              <Text style={styles.quantityText}>{formatNumber(dispatch.dispQuantity)}</Text>
                              <Text style={styles.quantityLabel}>
                                {tr('grn.dispatches.bagUnit', { count: dispatch.dispQuantity })}
                              </Text>
                            </View>
                            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

