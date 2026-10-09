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
 * Composed of a section card and object cells only (docs/STYLE_GUIDE.md §13.13).
 *
 * @module components/RecentDispatchedOrdersSection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import { RecentDispatchedOrderCard } from './list-items/RecentDispatchedOrderCard';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';
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

interface RecentDispatchedOrdersSectionProps {
  /** Optional trigger to force refresh (increment to refresh) */
  refreshTrigger?: number;
  /** Maximum number of dispatches to show (default: 10) */
  limit?: number;
}

const makeStyles = (t: ThemeTokens) => ({
  wrapper: {
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  sectionCard: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
  },
  headerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flex: 1,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  countBadge: {
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: space.s6,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  countText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    fontVariant: ['tabular-nums' as const],
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xxl,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  errorContainer: {
    alignItems: 'center' as const,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xxl,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  errorText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  list: {
    paddingTop: space.xs,
  },
});

const LOAD_ERROR = "Couldn't load recent dispatches. Check your connection and try again.";

const RecentDispatchedOrdersSection: React.FC<RecentDispatchedOrdersSectionProps> = ({
  refreshTrigger = 0,
  limit = 10,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
        setError(LOAD_ERROR);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[RecentDispatchedOrdersSection] Error:', err);
      setError(LOAD_ERROR);
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

  const countLabel = `${dispatches.length} ${dispatches.length === 1 ? 'dispatch' : 'dispatches'}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionCard}>
        {/* Section Header */}
        <Pressable
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel={`Recently dispatched orders, ${countLabel}`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <View style={styles.headerLeft}>
            <Icon name="truck-check-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.headerTitle} accessibilityRole="header">
              Recently dispatched orders
            </Text>
            {!loading && dispatches.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText} maxFontSizeMultiplier={1.6}>
                  {dispatches.length}
                </Text>
              </View>
            )}
          </View>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.md}
            color={t.icon.secondary}
          />
        </Pressable>

        {isExpanded && loading && (
          <View style={styles.loadingContainer} accessibilityLabel="Loading recent dispatches">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>Loading recent dispatches…</Text>
          </View>
        )}

        {isExpanded && !loading && error && (
          <View style={styles.errorContainer}>
            <Icon name="alert-circle-outline" size={iconSize.xl} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={fetchDispatches}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Try loading recent dispatches again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {isExpanded && !loading && !error && dispatches.length === 0 && (
          <View style={styles.errorContainer}>
            <Icon name="truck-delivery-outline" size={iconSize.xl} color={t.icon.secondary} />
            <Text style={styles.errorText}>
              No orders dispatched yet. Dispatches created from orders appear here.
            </Text>
          </View>
        )}
      </View>

      {/* Dispatch cards sit on the screen background, not inside the section card */}
      {isExpanded && !loading && !error && dispatches.length > 0 && (
        <View style={styles.list}>
          {dispatches.map(dispatch => (
            <RecentDispatchedOrderCard
              key={dispatch.dispatch_id}
              dispatch={dispatch}
              onPress={handleDispatchPress}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default RecentDispatchedOrdersSection;
