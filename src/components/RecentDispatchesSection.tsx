/**
 * RecentDispatchesSection Component
 *
 * Displays the last 10 dispatches for a customer in a collapsible section.
 * Uses MemoizedDispatchItem for consistent card rendering with expandable items.
 * Tapping a dispatch navigates to the dispatch details screen.
 *
 * @module components/RecentDispatchesSection
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { getDispatchListWithItems, Dispatch } from '@/services/dispatch-service';
import { MemoizedDispatchItem } from './list-items/MemoizedDispatchItem';
import theme from '@/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RecentDispatchesSectionProps {
  /** Customer UUID to fetch dispatches for */
  customerId: string;
  /** Optional trigger to force refresh (increment to refresh) */
  refreshTrigger?: number;
}

const RecentDispatchesSection: React.FC<RecentDispatchesSectionProps> = ({
  customerId,
  refreshTrigger = 0,
}) => {
  const colors = useListColors();
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dispatches for customer
  const fetchDispatches = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      if (__DEV__) {
        console.log('[RecentDispatchesSection] Fetching dispatches for customer:', customerId);
      }

      const result = await getDispatchListWithItems({
        p_customer_id: customerId,
        p_sort_by: 'dispatch_date',
        p_sort_order: 'desc',
        p_limit: 10,
        p_include_items: true,
      });

      if (__DEV__) {
        console.log('[RecentDispatchesSection] Fetch result:', {
          success: result.success,
          dispatchCount: result.data?.dispatches?.length || 0,
        });
      }

      if (result.success && result.data) {
        if (__DEV__) {
          console.log('[RecentDispatchesSection] Dispatch data sample:', {
            firstDispatch: result.data.dispatches?.[0],
            disp_date: result.data.dispatches?.[0]?.disp_date,
          });
        }
        setDispatches(result.data.dispatches || []);
      } else {
        setError(result.message || 'Failed to load dispatches');
      }
    } catch (err) {
      console.error('[RecentDispatchesSection] Error fetching dispatches:', err);
      setError('An error occurred while loading dispatches');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

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
  const handleDispatchPress = useCallback((dispatch: Dispatch) => {
    if (__DEV__) {
      console.log('[RecentDispatchesSection] Navigating to dispatch:', dispatch.dispatch_id);
    }
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  // Don't render section if no dispatches (covers initial loading state and empty result)
  if (dispatches.length === 0 && !error) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
      {/* Section Header */}
      <TouchableOpacity
        style={[styles.header, { backgroundColor: colors.blueLight }]}
        onPress={toggleExpand}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Recent Dispatches, ${dispatches.length} items, ${isExpanded ? 'collapse' : 'expand'}`}
      >
        <View style={styles.headerLeft}>
          <Icon name="truck-delivery" size={20} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.gray900 }]}>
            Recent Dispatches
          </Text>
          {!loading && dispatches.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
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
                Loading dispatches...
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
          ) : (
            <View style={styles.dispatchList}>
              {dispatches.map((dispatch) => (
                <MemoizedDispatchItem
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
  // Card Container - Fiori spec: 12pt corner radius
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12, // Fiori card corner radius
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
  // Section Header - Fiori spec: 44pt with button
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44, // Fiori section header with button
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Section Title - Fiori spec: 17pt for collapsible
  headerTitle: {
    fontSize: 17, // Fiori title font size
    fontWeight: '600',
    letterSpacing: -0.41,
  },
  // Count Badge - Fiori tag style: 20pt height, pill shape
  countBadge: {
    height: 20, // Fiori compact tag height
    minWidth: 20,
    paddingHorizontal: 8,
    borderRadius: 10, // Fiori pill shape
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 11, // Fiori compact tag font size
    fontWeight: '600',
  },
  // Card Body - Fiori card body padding
  content: {
    paddingBottom: 8,
  },
  // Loading State
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
  // Error State - Fiori empty state pattern
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
  // Retry Button - Fiori tertiary tint style
  retryButton: {
    minHeight: 44, // Fiori touch target
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  retryText: {
    fontSize: 15, // Fiori button font size
    fontWeight: '600',
  },
  dispatchList: {
    paddingHorizontal: 4,
  },
});

export default RecentDispatchesSection;
