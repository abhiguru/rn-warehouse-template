/**
 * Price history: who added, changed or deleted which item price, and when. Read-only,
 * for administrators and supervisors (backend migration 48, get_item_price_history).
 * Opened from Item pricing. Newest first, 50 at a time.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { getItemPriceHistory, PRICE_HISTORY_PAGE_SIZE } from '@/services/item-pricing-service';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';
import { useAppSelector } from '@/store/hooks';
import ItemPriceHistoryCard from '@/components/ItemPriceHistoryCard';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListSkeletonCard } from '@/components/list/ListSkeletonCard';
import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { canOpenScreen } from '@/config/roles';

type LoadKind = 'first' | 'refresh' | 'more';

const SKELETONS = [1, 2, 3, 4, 5, 6];
/** How many further pages in a row may hold nothing new before the next one waits for a tap. */
const MAX_SKIPPED_PAGES = 3;

const ItemPriceHistoryScreen: React.FC = () => {
  const role = useAppSelector((state) => state.auth.userProfile?.role);
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // The route guard keeps other roles out; this stops the request for a role the server refuses.
  const allowed = canOpenScreen(role, 'itemPriceHistory');

  const [entries, setEntries] = useState<ItemPriceHistoryEntry[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The first page failed: shown in place of the list. */
  const [error, setError] = useState<string | null>(null);
  /** A further page failed: shown under the entries already loaded. */
  const [moreError, setMoreError] = useState<string | null>(null);
  /** A further page held only entries already shown, several times over: paging goes on with a button. */
  const [stalled, setStalled] = useState(false);
  /** The entries on screen, for the request in flight to tell which of a page are new. */
  const entriesRef = useRef<ItemPriceHistoryEntry[]>([]);
  /** The number of the newest request. An answer to an older one is for a list that is gone. */
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  /** False once the screen was left, or the role may no longer open it (sign-out, role change). */
  const liveRef = useRef(false);

  useEffect(() => {
    liveRef.current = allowed;
    return () => {
      liveRef.current = false;
    };
  }, [allowed]);

  const load = useCallback(async (kind: LoadKind, offset: number) => {
    // A further page waits for whatever is loading. A first load or a refresh does not wait:
    // it takes the place of the request in flight, whose answer is then ignored.
    if (kind === 'more' && busyRef.current) return;
    const request = (requestRef.current += 1);
    const current = () => liveRef.current && request === requestRef.current;
    busyRef.current = true;
    setLoading(kind === 'first');
    setRefreshing(kind === 'refresh');
    setLoadingMore(kind === 'more');
    setMoreError(null);
    setStalled(false);
    try {
      let pageOffset = offset;
      for (let skipped = 0; ; skipped += 1) {
        const result = await getItemPriceHistory({ limit: PRICE_HISTORY_PAGE_SIZE, offset: pageOffset });
        // Left, signed out, or overtaken by a refresh: nothing of this answer is shown.
        if (!current()) return;
        if (!result.success) {
          const message = result.message || tr('pricing.list.tryAgainInAMoment');
          if (kind === 'first') setError(message);
          else if (kind === 'more') setMoreError(message);
          // A failed refresh keeps the entries on screen.
          else showAlert(tr('pricing.history.loadErrorTitle'), message);
          return;
        }
        // A price changed while paging moves every later entry down: never show one twice.
        const known = new Set(kind === 'more' ? entriesRef.current.map((entry) => entry.id) : []);
        const fresh = result.data.filter((entry) => !known.has(entry.id));
        const more = result.pagination.has_more;
        pageOffset = result.pagination.offset + result.pagination.limit;
        entriesRef.current = kind === 'more' ? [...entriesRef.current, ...fresh] : fresh;
        setError(null);
        setEntries(entriesRef.current);
        setHasMore(more);
        setNextOffset(pageOffset);
        if (kind !== 'more' || fresh.length > 0 || !more) return;
        // The whole page was shown already (50 or more changes were written since the page
        // before it). The list did not grow, so reaching its end will not ask again: ask for
        // the next page now, and after a few such pages leave it to a button.
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
    if (allowed) void load('first', 0);
  }, [allowed, load]);

  const onRefresh = useCallback(() => void load(entries.length === 0 ? 'first' : 'refresh', 0), [load, entries.length]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading && !refreshing && !loadingMore) void load('more', nextOffset);
  }, [hasMore, loading, refreshing, loadingMore, load, nextOffset]);

  // A page that failed, or paging that stalled, goes on with its button, not by scrolling.
  const onEndReached = useCallback(() => {
    if (!moreError && !stalled) loadMore();
  }, [moreError, stalled, loadMore]);

  const renderEntry = useCallback(({ item }: { item: ItemPriceHistoryEntry }) => <ItemPriceHistoryCard entry={item} />, []);

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footer} accessibilityRole="progressbar" accessibilityLabel={tr('pricing.history.loadingMoreLabel')}>
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.footerText}>{tr('common.loadingMore')}</Text>
        </View>
      );
    }
    if (moreError) {
      return (
        <View style={styles.footerError} accessibilityRole="alert">
          <Text style={styles.footerText}>{tr('pricing.history.loadMoreFailed')}</Text>
          <Text style={styles.footerText}>{moreError}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={loadMore}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    if (stalled && hasMore) {
      return (
        <View style={styles.footerError}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={loadMore}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('components.changeLog.loadMore')}</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.titleRow}>
        <HeaderBackButton />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {tr('pricing.history.title')}
        </Text>
      </View>
    </View>
  );

  if (!allowed) return <View style={styles.container}>{header}</View>;

  if (loading && entries.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <FlatList
          data={SKELETONS}
          renderItem={() => <ListSkeletonCard metricsCount={3} showFooter={true} />}
          keyExtractor={(item: number) => item.toString()}
          contentContainerStyle={styles.listContent}
          accessibilityLabel={tr('pricing.history.loadingLabel')}
        />
      </View>
    );
  }

  if (error && entries.length === 0) {
    // A failed load is not an empty history.
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.stateContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateTitle} accessibilityRole="header">
            {tr('pricing.history.loadErrorTitle')}
          </Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => void load('first', 0)}
            accessibilityRole="button"
          >
            <Icon name="refresh" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item: ItemPriceHistoryEntry) => String(item.id)}
        ListEmptyComponent={
          <ListEmptyState
            activeFilterCount={0}
            emptyIcon="history"
            emptyTitle={tr('pricing.history.emptyTitle')}
            emptySubtitle={tr('pricing.history.emptySubtitle')}
          />
        }
        ListFooterComponent={renderFooter}
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
      />
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  title: {
    ...typography.title2,
    color: t.text.primary,
    flexShrink: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: space.xs,
  },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.xl,
    gap: space.sm,
  },
  footerError: {
    alignItems: 'center' as const,
    paddingVertical: space.lg,
    paddingHorizontal: layout.marginCompact,
    gap: space.xs,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.xxl,
    gap: space.sm,
  },
  stateTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  stateText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    maxWidth: layout.maxFormWidth,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget,
    marginTop: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

export default ItemPriceHistoryScreen;
