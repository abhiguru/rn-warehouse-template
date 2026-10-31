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
 * A normal page section (docs/STYLE_GUIDE.md §13.6, §13.13): SectionHeader with
 * the count and a Show/Hide action, then object cells on surface.card.
 *
 * @module components/RecentDispatchedOrdersSection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import { Button } from '@/components/ui/Button';
import { RecentDispatchedOrderCard } from './list-items/RecentDispatchedOrderCard';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatCount } from '@/utils/formatters';
import { t as translate } from '@/i18n';
import {
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
  /**
   * Increment to read the dispatches again without a loading state: the rows and the count stay on screen until the new
   * ones arrive, and a read that fails leaves them as they are. For a return to the queue, when a dispatch made from an
   * order meanwhile (the order list is read again then) must show without a pull to refresh.
   */
  quietRefreshTrigger?: number;
  /** Maximum number of dispatches to show (default: 10) */
  limit?: number;
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
  // "See all N →" at the end of the list, to the right (a text button, §13.1)
  seeAll: {
    alignSelf: 'flex-end' as const,
    marginHorizontal: layout.marginCompact,
  },
});

/** Read when the load fails, so it is in the app's language (docs/I18N.md rule 2). */
const loadError = () => translate('lists.recent.loadFailed');

const RecentDispatchedOrdersSection: React.FC<RecentDispatchedOrdersSectionProps> = ({
  refreshTrigger = 0,
  quietRefreshTrigger = 0,
  limit = 10,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  const [dispatches, setDispatches] = useState<RecentDispatchedOrder[]>([]);
  // How many order dispatches there are in all (the server's count); only the newest `limit` are listed.
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  // The number of the newest read: the answer of an older read never replaces the rows of a newer one.
  const requestRef = useRef(0);
  // The newest read that shows loading and errors (not quiet) while it is in flight, or 0.
  const loudRef = useRef(0);

  // Fetch recent dispatched orders. `quietAsked`: keep what is shown while the read runs, and keep it if the read fails.
  // A quiet read that takes over from a read that is still showing "loading" does that read's work (loading, error).
  const fetchDispatches = useCallback(async (quietAsked: boolean = false) => {
    const request = ++requestRef.current;
    const latest = () => isMountedRef.current && request === requestRef.current;
    const quiet = quietAsked && loudRef.current === 0;
    if (!quiet) {
      loudRef.current = request;
      setLoading(true);
      setError(null);
    }

    try {
      if (__DEV__) {
        console.log('[RecentDispatchedOrdersSection] Fetching recent dispatched orders');
      }

      const result = await getRecentDispatchedOrders(limit, 0);

      if (!latest()) return;

      if (result.success && result.data) {
        const rows = result.data.dispatches || [];
        if (__DEV__) {
          console.log('[RecentDispatchedOrdersSection] Fetched:', {
            count: rows.length,
            total: result.data.total_count || 0,
          });
        }
        setDispatches(rows);
        // An answer without a count (an older server) counts the rows it gave.
        setTotalCount(typeof result.data.total_count === 'number' ? Math.max(result.data.total_count, rows.length) : rows.length);
        setError(null);
      } else if (!quiet) {
        setError(loadError());
      }
    } catch (err) {
      if (!latest()) return;
      console.error('[RecentDispatchedOrdersSection] Error:', err);
      if (!quiet) setError(loadError());
    } finally {
      if (loudRef.current === request) loudRef.current = 0;
      if (latest()) setLoading(false);
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

  // A quiet refresh on a return to the queue: not on mount (the fetch above is the first read).
  const lastQuietTrigger = useRef(quietRefreshTrigger);
  useEffect(() => {
    if (lastQuietTrigger.current === quietRefreshTrigger) return;
    lastQuietTrigger.current = quietRefreshTrigger;
    void fetchDispatches(true);
  }, [fetchDispatches, quietRefreshTrigger]);

  // Toggle expand/collapse with animation
  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
  }, []);

  // A GRN cell of a line opens that GRN's details
  const handleViewGRN = useCallback((grnId: string) => {
    router.push(`/grn-details/${grnId}`);
  }, []);

  // Navigate to dispatch details on card press
  const handleDispatchPress = useCallback((dispatch: RecentDispatchedOrder) => {
    if (__DEV__) {
      console.log('[RecentDispatchedOrdersSection] Navigating to dispatch:', dispatch.dispatch_id);
    }
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  // The full list of recently dispatched orders (app/recent-dispatched.tsx)
  const handleSeeAll = useCallback(() => {
    router.push('/recent-dispatched');
  }, []);

  // Don't render section if no dispatches (including during initial load)
  if (dispatches.length === 0 && !error) {
    return null;
  }

  // The header counts all the order dispatches; the list below holds the newest `limit` of them.
  const shownCount = Math.max(totalCount, dispatches.length);
  const countLabel = formatCount(shownCount, 'dispatch', 'dispatches');

  return (
    <View style={styles.wrapper}>
      <SectionHeader
        title={translate('lists.recent.title')}
        count={loading ? undefined : shownCount}
        action={{
          label: isExpanded ? translate('lists.recent.hide') : translate('lists.recent.show'),
          onPress: toggleExpand,
          accessibilityLabel: translate(isExpanded ? 'lists.recent.hideLabel' : 'lists.recent.showLabel', { dispatches: countLabel }),
        }}
        testID="recent-dispatched-orders-header"
      />

      {isExpanded && loading && (
        <View style={styles.messageCard}>
          <View style={styles.loadingContainer} accessibilityLabel={translate('lists.recent.loading')}>
            <ActivityIndicator size="small" color={t.brand.tint} />
            <Text style={styles.loadingText}>{translate('lists.recent.loadingText')}</Text>
          </View>
        </View>
      )}

      {isExpanded && !loading && error && (
        <View style={styles.messageCard}>
          <View style={styles.errorContainer}>
            <Icon name="alert-circle-outline" size={iconSize.xl} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => fetchDispatches()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={translate('lists.recent.retryLabel')}
            >
              <Text style={styles.retryText}>{translate('common.retry')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isExpanded && !loading && !error && dispatches.length === 0 && (
        <View style={styles.messageCard}>
          <View style={styles.errorContainer}>
            <Icon name="truck-delivery-outline" size={iconSize.xl} color={t.icon.secondary} />
            <Text style={styles.errorText}>
              {translate('lists.recent.empty')}
            </Text>
          </View>
        </View>
      )}

      {/* Dispatch object cells (surface.card) */}
      {isExpanded && !loading && !error && dispatches.length > 0 && (
        <View>
          {dispatches.map(dispatch => (
            <RecentDispatchedOrderCard
              key={dispatch.dispatch_id}
              dispatch={dispatch}
              onPress={handleDispatchPress}
              onViewGRN={handleViewGRN}
            />
          ))}
          {/* More dispatches than the newest `limit` listed: the full list is one tap away */}
          {shownCount > dispatches.length ? (
            <Button
              type="tertiary"
              size="auto"
              style={styles.seeAll}
              onPress={handleSeeAll}
              accessibilityLabel={translate('lists.recent.seeAllLabel', { count: shownCount })}
              testID="recent-dispatched-see-all"
            >
              {translate('lists.recent.seeAll', { count: shownCount })}
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
};

export default RecentDispatchedOrdersSection;
