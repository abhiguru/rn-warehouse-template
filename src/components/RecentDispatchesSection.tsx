/**
 * RecentDispatchesSection Component
 *
 * Displays the last 10 dispatches for a customer in a collapsible section.
 * Uses MemoizedDispatchItem for consistent card rendering with expandable items.
 * Tapping a dispatch navigates to the dispatch details screen.
 *
 * A normal page section (docs/STYLE_GUIDE.md §13.6, §13.13): SectionHeader with
 * the count and a Show/Hide action, then object cells on surface.card.
 *
 * @module components/RecentDispatchesSection
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  getCustomerDispatchList,
  getDispatchListWithItems,
  Dispatch,
} from '@/services/dispatch-service';
import { MemoizedDispatchItem } from './list-items/MemoizedDispatchItem';
import { useAppSelector } from '@/store/hooks';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatCount } from '@/utils/formatters';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

interface RecentDispatchesSectionProps {
  /** Customer UUID to fetch dispatches for */
  customerId: string;
  /** Optional trigger to force refresh (increment to refresh) */
  refreshTrigger?: number;
}

const makeStyles = (t: ThemeTokens) => ({
  wrapper: {
    marginBottom: space.lg,
  },
  // Loading and error messages sit in a card on surface.card (§13.6)
  messageCard: {
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  loadingContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xxl,
    gap: space.sm,
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
});


const LOAD_ERROR = "Couldn't load dispatches. Check your connection and try again.";

const RecentDispatchesSection: React.FC<RecentDispatchesSectionProps> = ({
  customerId,
  refreshTrigger = 0,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const isCustomerAccount = useAppSelector(
    state => state.auth.userProfile?.role === 'customer'
  );
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

      const result = isCustomerAccount
        ? await getCustomerDispatchList({
            p_customer_id: customerId,
            p_limit: 10,
            p_offset: 0,
            p_include_items: true,
          })
        : await getDispatchListWithItems({
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
          message: result.message,
        });
      }

      if (result.success && result.data) {
        setDispatches(result.data.dispatches || []);
      } else {
        setError(LOAD_ERROR);
      }
    } catch (err) {
      console.error('[RecentDispatchesSection] Error fetching dispatches:', err);
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [customerId, isCustomerAccount]);

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

  const countLabel = formatCount(dispatches.length, 'dispatch', 'dispatches');
  const showContent = isExpanded || !!error;

  return (
    <View style={styles.wrapper}>
      <SectionHeader
        title="Recent dispatches"
        count={loading ? undefined : dispatches.length}
        action={
          error
            ? undefined
            : {
                label: isExpanded ? 'Hide' : 'Show',
                onPress: toggleExpand,
                accessibilityLabel: `${isExpanded ? 'Hide' : 'Show'} recent dispatches, ${countLabel}`,
              }
        }
        testID="recent-dispatches-header"
      />

      {showContent && loading && (
        <View style={styles.messageCard}>
          <View style={styles.loadingContainer} accessibilityLabel="Loading dispatches">
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>Loading dispatches…</Text>
          </View>
        </View>
      )}

      {showContent && !loading && error && (
        <View style={styles.messageCard}>
          <View style={styles.errorContainer}>
            <Icon name="alert-circle-outline" size={iconSize.xl} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={fetchDispatches}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Try loading dispatches again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Dispatch object cells (surface.card) */}
      {showContent && !loading && !error && (
        <View>
          {dispatches.map((dispatch) => (
            <MemoizedDispatchItem
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

export default RecentDispatchesSection;
