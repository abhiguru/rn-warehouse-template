/**
 * Recently dispatched: every dispatch made from an order, newest first, 20 at a time. Opened by "See all N →" at the end
 * of the "Recently dispatched" section of the order queue (that section lists the newest 10). The rows are the section's
 * own cards (RecentDispatchedOrderCard); a tap opens the dispatch. For administrators, supervisors and staff (the server
 * refuses get_recent_dispatched_orders to anyone else).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { RecentDispatchedOrderCard } from '@/components/list-items/RecentDispatchedOrderCard';
import { isWarehouseUser } from '@/config/roles';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { getRecentDispatchedOrders } from '@/services/dispatch-service';
import { useAppSelector } from '@/store/hooks';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';
import { formatCount } from '@/utils/formatters';

/** How many dispatches one request asks for. */
const RECENT_DISPATCHED_PAGE_SIZE = 20;
/** How many further pages in a row may hold nothing new (dispatches made meanwhile move the rest down) before a tap is needed. */
const MAX_SKIPPED_PAGES = 3;
const SKELETONS = [1, 2, 3, 4, 5, 6];

type LoadKind = 'first' | 'refresh' | 'more';

export default function RecentDispatchedScreen() {
  const role = useAppSelector((state) => state.auth.userProfile?.role);
  // The route guard lets every signed-in person in; this stops the request for a role the server refuses.
  const allowed = isWarehouseUser(role);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const [dispatches, setDispatches] = useState<RecentDispatchedOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The first page failed: shown in place of the list. */
  const [error, setError] = useState<string | null>(null);
  /** A further page failed: shown under the dispatches already loaded. */
  const [moreError, setMoreError] = useState(false);
  /** A refresh failed: the dispatches stay on screen and a line says so. */
  const [refreshError, setRefreshError] = useState(false);
  /** Paging found only dispatches already shown, several times over: it goes on with a button. */
  const [stalled, setStalled] = useState(false);

  const rowsRef = useRef<RecentDispatchedOrder[]>([]);
  const nextOffsetRef = useRef(0);
  /** The number of the newest request: an answer to an older one is for a list that is gone. */
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const liveRef = useRef(false);

  useEffect(() => {
    liveRef.current = allowed;
    return () => {
      liveRef.current = false;
    };
  }, [allowed]);

  const load = useCallback(async (kind: LoadKind) => {
    // A further page waits for whatever is loading; a first load or a refresh takes the place of the request in flight.
    if (kind === 'more' && busyRef.current) return;
    const request = (requestRef.current += 1);
    const current = () => liveRef.current && request === requestRef.current;
    busyRef.current = true;
    setLoading(kind === 'first');
    setRefreshing(kind === 'refresh');
    setLoadingMore(kind === 'more');
    setMoreError(false);
    setStalled(false);
    if (kind !== 'more') setRefreshError(false);
    try {
      let offset = kind === 'more' ? nextOffsetRef.current : 0;
      for (let skipped = 0; ; skipped += 1) {
        const result = await getRecentDispatchedOrders(RECENT_DISPATCHED_PAGE_SIZE, offset);
        if (!current()) return;
        if (!result.success || !result.data) {
          if (kind === 'first') setError(result.error || tr('lists.recent.loadFailed'));
          else if (kind === 'more') setMoreError(true);
          else setRefreshError(true);
          return;
        }
        // A dispatch made while paging moves every later one down: never show one twice.
        const known = new Set(kind === 'more' ? rowsRef.current.map((row) => row.dispatch_id) : []);
        const page = result.data.dispatches ?? [];
        const fresh = page.filter((row) => !known.has(row.dispatch_id));
        const more = Boolean(result.data.has_more);
        offset += RECENT_DISPATCHED_PAGE_SIZE;
        nextOffsetRef.current = offset;
        rowsRef.current = kind === 'more' ? [...rowsRef.current, ...fresh] : fresh;
        setError(null);
        setDispatches(rowsRef.current);
        setTotal(typeof result.data.total_count === 'number' ? result.data.total_count : rowsRef.current.length);
        setHasMore(more);
        if (kind !== 'more' || fresh.length > 0 || !more) return;
        // The whole page was shown already: ask for the next now, and after a few such pages leave it to a button.
        if (skipped >= MAX_SKIPPED_PAGES) {
          setStalled(true);
          return;
        }
      }
    } finally {
      if (request === requestRef.current) {
        busyRef.current = false;
        if (liveRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (allowed) void load('first');
  }, [allowed, load]);

  const onRefresh = useCallback(() => void load(rowsRef.current.length === 0 ? 'first' : 'refresh'), [load]);
  const loadMore = useCallback(() => {
    if (hasMore && !loading && !refreshing && !loadingMore) void load('more');
  }, [hasMore, loading, refreshing, loadingMore, load]);
  // A page that failed, or paging that stalled, goes on with its button, not by scrolling.
  const onEndReached = useCallback(() => {
    if (!moreError && !stalled) loadMore();
  }, [moreError, stalled, loadMore]);

  const openDispatch = useCallback((dispatch: RecentDispatchedOrder) => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: RecentDispatchedOrder }) => <RecentDispatchedOrderCard dispatch={item} onPress={openDispatch} />,
    [openDispatch]
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.titleRow}>
        <HeaderBackButton />
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {tr('lists.recent.title')}
          </Text>
          {dispatches.length > 0 ? (
            <Text style={styles.subtitle} testID="recent-dispatched-count">
              {formatCount(Math.max(total, dispatches.length), 'dispatch', 'dispatches')}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (!allowed) return <View style={styles.container}>{header}</View>;

  if (loading && dispatches.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <FlatList
          data={SKELETONS}
          renderItem={() => <ListSkeletonCard metricsCount={3} showFooter={true} />}
          keyExtractor={(item: number) => item.toString()}
          contentContainerStyle={styles.listContent}
          accessibilityLabel={tr('lists.recent.loading')}
        />
      </View>
    );
  }

  if (error && dispatches.length === 0) {
    // A failed load is not an empty list.
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={() => void load('first')}
            accessibilityRole="button"
            accessibilityLabel={tr('lists.recent.retryLabel')}
            testID="recent-dispatched-retry"
          >
            <Text style={styles.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const footer = () => {
    if (loadingMore) {
      return (
        <View style={styles.footer} accessibilityRole="progressbar" accessibilityLabel={tr('common.loadingMore')}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.footerText}>{tr('common.loadingMore')}</Text>
        </View>
      );
    }
    if (moreError || (stalled && hasMore)) {
      return (
        <View style={styles.footer}>
          {moreError ? <Text style={styles.footerText}>{tr('lists.recent.loadMoreFailed')}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={loadMore}
            accessibilityRole="button"
            testID="recent-dispatched-load-more"
          >
            <Text style={styles.retryText}>{moreError ? tr('common.retry') : tr('components.changeLog.loadMore')}</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {header}
      {refreshError ? (
        <View style={styles.refreshStrip} accessibilityRole="alert" testID="recent-dispatched-refresh-error">
          <Text style={styles.footerText}>{tr('lists.recent.loadFailed')}</Text>
        </View>
      ) : null}
      <FlatList
        data={dispatches}
        renderItem={renderItem}
        keyExtractor={(item: RecentDispatchedOrder) => item.dispatch_id}
        ListEmptyComponent={
          <ListEmptyState activeFilterCount={0} emptyIcon="truck-delivery-outline" emptyTitle={tr('lists.recent.title')} emptySubtitle={tr('lists.recent.empty')} />
        }
        ListFooterComponent={footer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[t.brand.tint]}
            tintColor={t.brand.tint}
            progressBackgroundColor={t.surface.card}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[styles.listContent, { paddingBottom: space.huge + insets.bottom }]}
        testID="recent-dispatched-list"
      />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.xs },
  titles: { flex: 1 },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  listContent: { paddingTop: space.md },
  state: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.xxl, gap: space.md },
  stateText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  footer: { alignItems: 'center' as const, paddingVertical: space.lg, gap: space.sm, paddingHorizontal: layout.marginCompact },
  footerText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  refreshStrip: { paddingHorizontal: layout.marginCompact, paddingVertical: space.sm, backgroundColor: t.status.negative.background },
  retryButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryButtonPressed: { backgroundColor: t.brand.subtle },
  retryText: { ...typography.callout, color: t.brand.tint },
});
