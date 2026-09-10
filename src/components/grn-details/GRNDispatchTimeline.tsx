/**
 * GRNDispatchTimeline Component
 *
 * Vertical timeline view for dispatch history
 * Features:
 * - Timeline layout with date markers
 * - Grouped by month with collapsible sections
 * - Material Design 3 cards for each dispatch
 * - Tap to navigate to dispatch details
 * - Empty state for no dispatches
 * - Mobile-optimized spacing and touch targets
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';

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

export const GRNDispatchTimeline: React.FC<GRNDispatchTimelineProps> = ({
  dispatches,
  loading = false,
  itemName,
}) => {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Group dispatches by month
  const groupedDispatches: GroupedDispatches[] = React.useMemo(() => {
    if (!dispatches.length) return [];

    const groups = new Map<string, DispatchRecord[]>();

    dispatches.forEach(dispatch => {
      const date = new Date(dispatch.dispDate);
      const monthKey = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });

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
          <Icon name="truck-outline" size={64} color="#d1d5db" />
        </View>
        <Text style={styles.emptyTitle}>No Dispatches Yet</Text>
        <Text style={styles.emptySubtitle}>
          {itemName
            ? `No dispatch records found for ${itemName}`
            : 'No dispatch records found for this GRN'}
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

        return (
          <View key={group.month} style={styles.monthGroup}>
            {/* Month Header */}
            <TouchableOpacity
              style={styles.monthHeader}
              onPress={() => toggleMonth(group.month)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${group.month}, ${group.dispatches.length} dispatches, ${isExpanded ? 'expanded' : 'collapsed'}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <View style={styles.monthHeaderLeft}>
                <View style={styles.monthDot} />
                <Text style={styles.monthText}>{group.month}</Text>
                <View style={styles.monthBadge}>
                  <Text style={styles.monthBadgeText}>{group.dispatches.length}</Text>
                </View>
              </View>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#6b7280"
              />
            </TouchableOpacity>

            {/* Timeline Line */}
            {!isLastGroup && <View style={styles.timelineLine} />}

            {/* Dispatches List */}
            {isExpanded && (
              <View style={styles.dispatchesContainer}>
                {group.dispatches.map((dispatch, dispatchIndex) => {
                  const isLast = dispatchIndex === group.dispatches.length - 1;
                  const date = new Date(dispatch.dispDate);

                  return (
                    <View key={dispatch.id} style={styles.dispatchWrapper}>
                      {/* Timeline Connector */}
                      <View style={styles.timeline}>
                        <View style={styles.timelineDot} />
                        {!isLast && <View style={styles.timelineConnector} />}
                      </View>

                      {/* Dispatch Card */}
                      <TouchableOpacity
                        style={styles.dispatchCard}
                        onPress={() => handleDispatchPress(dispatch.dispatchId)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Dispatch ${dispatch.dispNo}, ${dispatch.dispQuantity} units, ${date.toLocaleDateString()}, tap to view details`}
                      >
                        <Card mode="outlined" style={styles.card}>
                          <View style={styles.cardContent}>
                            {/* Left: Icon and Info */}
                            <View style={styles.cardLeft}>
                              <View style={styles.dispatchIcon}>
                                <Icon name="truck-fast" size={20} color="#6366f1" />
                              </View>
                              <View style={styles.dispatchInfo}>
                                <Text style={styles.dispatchNo}>{dispatch.dispNo}</Text>
                                <Text style={styles.dispatchDate}>
                                  {date.toLocaleDateString('en-US', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </Text>
                              </View>
                            </View>

                            {/* Right: Quantity and Arrow */}
                            <View style={styles.cardRight}>
                              <View style={styles.quantityBadge}>
                                <Text style={styles.quantityText}>{dispatch.dispQuantity}</Text>
                                <Text style={styles.quantityLabel}>units</Text>
                              </View>
                              <Icon name="chevron-right" size={20} color="#ed6c02" />
                            </View>
                          </View>
                        </Card>
                      </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 20,
  },

  // Month Group
  monthGroup: {
    position: 'relative',
    marginBottom: 8,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    zIndex: 2,
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ed6c02',
    marginRight: 12,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginRight: 8,
  },
  monthBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ed6c02',
  },

  // Timeline
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 44,
    bottom: 0,
    width: 2,
    backgroundColor: '#e5e7eb',
    zIndex: 0,
  },
  timeline: {
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 2,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 4,
  },

  // Dispatches
  dispatchesContainer: {
    marginLeft: 24,
  },
  dispatchWrapper: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dispatchCard: {
    flex: 1,
  },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dispatchIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dispatchInfo: {
    flex: 1,
  },
  dispatchNo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  dispatchDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366f1',
  },
  quantityLabel: {
    fontSize: 10,
    color: '#6b7280',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyIconContainer: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
