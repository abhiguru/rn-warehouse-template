/**
 * RecentDispatchedOrdersSection Component
 *
 * Displays the most recent dispatches created from orders in a collapsible section.
 * Shown on the Order Queue screen to let supervisors quickly glance at recent dispatch activity.
 *
 * Features:
 * - Collapsible section (collapsed by default)
 * - Fetches from get_recent_dispatched_orders RPC
 * - Loading, error, and empty states
 * - Tapping a dispatch navigates to dispatch details
 *
 * @module components/RecentDispatchedOrdersSection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import { RecentDispatchedOrderCard } from './list-items/RecentDispatchedOrderCard';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RecentDispatchedOrdersSectionProps {
  /** Optional trigger to force refresh (increment to refresh) */
  refreshTrigger?: number;
  /** Maximum number of dispatches to show (default: 10) */
  limit?: number;
}

const RecentDispatchedOrdersSection: React.FC<RecentDispatchedOrdersSectionProps> = ({
  refreshTrigger = 0,
  limit = 10,
}) => {
  const colors = useListColors();
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  const [dispatches, setDispatches] = useState<RecentDispatchedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Fetch recent dispatched orders
  const fetchDispatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (__DEV__) {
        console.log('[RecentDispatchedOrdersSection] Fetching recent dispatched orders');
      }

      const result = await getRecentDispatchedOrders(limit, 0);

      if (!isMountedRef.current) return;

      if (result.success && result.data) {
        if (__DEV__) {
          console.log('[RecentDispatchedOrdersSection] Fetched:', {
            count: result.data.dispatches?.length || 0,
            total: result.data.total_count || 0,
          });
        }
        setDispatches(result.data.dispatches || []);
      } else {
        setError(result.error || 'Failed to load recent dispatches');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[RecentDispatchedOrdersSection] Error:', err);
      setError('An error occurred while loading recent dispatches');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [limit]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initial fetch and refresh on trigger change
  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches, refreshTrigger]);

  // Toggle expand/collapse with animation
  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  // Navigate to dispatch details on card press
  const handleDispatchPress = useCallback((dispatch: RecentDispatchedOrder) => {
    if (__DEV__) {
      console.log('[RecentDispatchedOrdersSection] Navigating to dispatch:', dispatch.dispatch_id);
    }
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  // Don't render section if no dispatches (including during initial load)
  if (dispatches.length === 0 && !error) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
      {/* Section Header */}
      <TouchableOpacity
        style={[styles.header, { backgroundColor: colors.statusPositiveLight }]}
        onPress={toggleExpand}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Recent Dispatched Orders, ${dispatches.length} items, ${isExpanded ? 'collapse' : 'expand'}`}
      >
        <View style={styles.headerLeft}>
          <Icon name="truck-check" size={20} color={colors.statusPositive} />
          <Text style={[styles.headerTitle, { color: colors.gray900 }]}>
            Recent Dispatched Orders
          </Text>
          {!loading && dispatches.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.statusPositive }]}>
              <Text style={[styles.countText, { color: colors.cellBackground }]}>
                {dispatches.length}
              </Text>
            </View>
          )}
        </View>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.gray600}
        />
      </TouchableOpacity>

      {/* Content */}
      {isExpanded && (
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.gray500 }]}>
                Loading recent dispatches...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={32} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.gray700 }]}>{error}</Text>
              <TouchableOpacity onPress={fetchDispatches} style={styles.retryButton}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : dispatches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="truck-outline" size={32} color={colors.gray400} />
              <Text style={[styles.emptyText, { color: colors.gray500 }]}>
                No recent order dispatches
              </Text>
            </View>
          ) : (
            <View style={styles.dispatchList}>
              {dispatches.map(dispatch => (
                <RecentDispatchedOrderCard
                  key={dispatch.dispatch_id}
                  dispatch={dispatch}
                  onPress={handleDispatchPress}
                  colors={colors}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES - SAP Fiori Card & Section Header Compliant
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
    flex: 1,
  },
  countBadge: {
    height: 20,
    minWidth: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  dispatchList: {
    paddingHorizontal: 0,
    paddingTop: 8,
  },
});

export default RecentDispatchedOrdersSection;
