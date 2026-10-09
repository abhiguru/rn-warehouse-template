/**
 * GenericFilterableList - Reusable filterable list component
 *
 * Provides a consistent list UI pattern with:
 * - Header with filter button and count
 * - Pull-to-refresh
 * - Infinite scroll pagination
 * - Loading skeletons
 * - Empty state
 * - Filter modal integration
 *
 * Follows docs/STYLE_GUIDE.md §13.6 and §14.1: background.base behind the
 * rows, header on surface.header with a hairline divider, pull to refresh and
 * the footer spinner in brand.tint, filter button with a count badge.
 *
 * @example
 * ```tsx
 * <GenericFilterableList
 *   data={data}
 *   loading={loading}
 *   refreshing={refreshing}
 *   loadingMore={loadingMore}
 *   onRefresh={onRefresh}
 *   onEndReached={onEndReached}
 *   renderItem={({ item }) => <GRNCard item={item} />}
 *   keyExtractor={(item) => item.id}
 *   activeFilterCount={activeFilterCount}
 *   onFilterPress={() => setShowFilterModal(true)}
 *   emptyStateProps={{
 *     emptyTitle: 'No GRNs yet',
 *     emptyIcon: 'package-variant-closed',
 *   }}
 * />
 * ```
 */

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  SectionList,
  StyleSheet,
  RefreshControl,
  SectionListData,
  SectionListRenderItem,
} from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, motion, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { ListSkeletonCard } from './ListSkeletonCard';
import { ListEmptyState, ListEmptyStateProps } from './ListEmptyState';

/** Space below the last row so it clears the tab bar and a floating action button. */
const BOTTOM_CLEARANCE = 80;
/** Minimum size of a count badge (§13.5). */
const BADGE_MIN = 18;

const countFormat = new Intl.NumberFormat('en-IN');

/**
 * Props for GenericFilterableList component
 */
export interface GenericFilterableListProps<T> {
  /** Data items to render */
  data: T[] | null;
  /** Initial loading state */
  loading: boolean;
  /** Pull-to-refresh loading state */
  refreshing: boolean;
  /** Load more loading state */
  loadingMore: boolean;
  /** Handler for pull-to-refresh */
  onRefresh: () => void;
  /** Handler for infinite scroll */
  onEndReached: () => void;
  /** Render function for each item */
  renderItem: ListRenderItem<T>;
  /** Key extractor for list items */
  keyExtractor: (item: T, index: number) => string;
  /** Number of active filters */
  activeFilterCount: number;
  /** Handler for filter button press */
  onFilterPress: () => void;
  /** Props for empty state component */
  emptyStateProps?: Partial<ListEmptyStateProps>;
  /** Number of skeleton cards to show while loading */
  skeletonCount?: number;
  /** Custom header component */
  headerComponent?: React.ReactElement;
  /** Custom footer component */
  footerComponent?: React.ReactElement;
  /** Show header with filter button (default: true) */
  showHeader?: boolean;
  /** Header title */
  headerTitle?: string;
  /** Threshold for triggering onEndReached (default: 0.5) */
  onEndReachedThreshold?: number;
  /** Custom content container style */
  contentContainerStyle?: object;
  /** Whether list has more data */
  hasMore?: boolean;
  /** Total count for display */
  totalCount?: number;
}

/**
 * Props for SectionList variant
 */
export interface GenericFilterableSectionListProps<T, S = { title: string; data: T[] }>
  extends Omit<GenericFilterableListProps<T>, 'data' | 'renderItem' | 'keyExtractor'> {
  /** Section data */
  sections: ReadonlyArray<SectionListData<T, S>> | null;
  /** Render function for each item */
  renderItem: SectionListRenderItem<T, S>;
  /** Render function for section headers */
  renderSectionHeader?: (info: { section: SectionListData<T, S> }) => React.ReactElement | null;
  /** Key extractor for list items */
  keyExtractor: (item: T, index: number) => string;
}

/**
 * Loading footer component
 */
const LoadingFooter = memo<{ loading: boolean }>(({ loading }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (!loading) return null;
  return (
    <View style={styles.loadingFooter} accessible accessibilityLabel="Loading more" accessibilityState={{ busy: true }}>
      <ActivityIndicator size="small" color={t.brand.tint} />
      <Text style={styles.loadingText}>Loading more…</Text>
    </View>
  );
});
LoadingFooter.displayName = 'LoadingFooter';

/**
 * List header with filter button
 */
const ListHeader = memo<{
  title?: string;
  activeFilterCount: number;
  onFilterPress: () => void;
  totalCount?: number;
}>(({ title, activeFilterCount, onFilterPress, totalCount }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const filtered = activeFilterCount > 0;
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {title && (
          <Text style={styles.headerTitle} accessibilityRole="header">
            {title}
          </Text>
        )}
        {totalCount !== undefined && totalCount > 0 && (
          <Text style={styles.headerCount}>
            {countFormat.format(totalCount)} {totalCount === 1 ? 'item' : 'items'}
          </Text>
        )}
      </View>
      <View style={styles.headerRight}>
        <Pressable
          onPress={onFilterPress}
          style={({ pressed }) => [
            styles.filterButton,
            filtered && styles.filterButtonActive,
            pressed && styles.filterButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={filtered ? `Filter, ${activeFilterCount} active` : 'Filter'}
        >
          <MaterialCommunityIcons
            name="filter-variant"
            size={iconSize.lg}
            color={filtered ? t.brand.tint : t.icon.primary}
          />
          {filtered && (
            <View style={styles.filterBadge} accessible={false} importantForAccessibility="no-hide-descendants">
              <Text style={styles.filterBadgeText} maxFontSizeMultiplier={1.6}>
                {activeFilterCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
});
ListHeader.displayName = 'ListHeader';

/**
 * Skeleton loading state
 */
const SkeletonList = memo<{ count: number }>(({ count }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.skeletonContainer} accessible accessibilityLabel="Loading list" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }).map((_, i) => (
        <ListSkeletonCard key={i} />
      ))}
    </View>
  );
});
SkeletonList.displayName = 'SkeletonList';

/**
 * Generic filterable FlatList component
 */
export const GenericFilterableList = memo(<T,>(props: GenericFilterableListProps<T>) => {
  const {
    data,
    loading,
    refreshing,
    loadingMore,
    onRefresh,
    onEndReached,
    renderItem,
    keyExtractor,
    activeFilterCount,
    onFilterPress,
    emptyStateProps = {},
    skeletonCount = 5,
    headerComponent,
    footerComponent,
    showHeader = true,
    headerTitle,
    onEndReachedThreshold = 0.5,
    contentContainerStyle,
    hasMore,
    totalCount,
  } = props;

  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const ListFooter = useCallback(() => (
    <>
      <LoadingFooter loading={loadingMore} />
      {footerComponent}
    </>
  ), [loadingMore, footerComponent]);

  const ListEmpty = useCallback(() => (
    <ListEmptyState
      activeFilterCount={activeFilterCount}
      {...emptyStateProps}
    />
  ), [activeFilterCount, emptyStateProps]);

  // Show skeleton on initial load
  if (loading && !data) {
    return (
      <View style={styles.container}>
        {showHeader && (
          <ListHeader
            title={headerTitle}
            activeFilterCount={activeFilterCount}
            onFilterPress={onFilterPress}
            totalCount={totalCount}
          />
        )}
        <SkeletonList count={skeletonCount} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <ListHeader
          title={headerTitle}
          activeFilterCount={activeFilterCount}
          onFilterPress={onFilterPress}
          totalCount={totalCount}
        />
      )}
      <Animated.View style={styles.listContainer} entering={FadeIn.duration(motion.slow)}>
        {/* P7 Fix: Migrated from FlatList to FlashList for better performance */}
        <FlashList
          data={data || []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + BOTTOM_CLEARANCE },
            contentContainerStyle,
          ]}
          ListHeaderComponent={headerComponent}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
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
          onEndReachedThreshold={onEndReachedThreshold}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    </View>
  );
}) as <T>(props: GenericFilterableListProps<T>) => React.ReactElement;

/**
 * Generic filterable SectionList component
 */
export const GenericFilterableSectionList = memo(<T, S extends { title: string; data: T[] }>(
  props: GenericFilterableSectionListProps<T, S>
) => {
  const {
    sections,
    loading,
    refreshing,
    loadingMore,
    onRefresh,
    onEndReached,
    renderItem,
    renderSectionHeader,
    keyExtractor,
    activeFilterCount,
    onFilterPress,
    emptyStateProps = {},
    skeletonCount = 5,
    headerComponent,
    footerComponent,
    showHeader = true,
    headerTitle,
    onEndReachedThreshold = 0.5,
    contentContainerStyle,
    totalCount,
  } = props;

  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const ListFooter = useCallback(() => (
    <>
      <LoadingFooter loading={loadingMore} />
      {footerComponent}
    </>
  ), [loadingMore, footerComponent]);

  const ListEmpty = useCallback(() => (
    <ListEmptyState
      activeFilterCount={activeFilterCount}
      {...emptyStateProps}
    />
  ), [activeFilterCount, emptyStateProps]);

  // Show skeleton on initial load
  if (loading && !sections) {
    return (
      <View style={styles.container}>
        {showHeader && (
          <ListHeader
            title={headerTitle}
            activeFilterCount={activeFilterCount}
            onFilterPress={onFilterPress}
            totalCount={totalCount}
          />
        )}
        <SkeletonList count={skeletonCount} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <ListHeader
          title={headerTitle}
          activeFilterCount={activeFilterCount}
          onFilterPress={onFilterPress}
          totalCount={totalCount}
        />
      )}
      <Animated.View style={styles.listContainer} entering={FadeIn.duration(motion.slow)}>
        <SectionList
          sections={sections || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + BOTTOM_CLEARANCE },
            contentContainerStyle,
          ]}
          ListHeaderComponent={headerComponent}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
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
          onEndReachedThreshold={onEndReachedThreshold}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={10}
        />
      </Animated.View>
    </View>
  );
}) as <T, S extends { title: string; data: T[] }>(
  props: GenericFilterableSectionListProps<T, S>
) => React.ReactElement;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  headerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  headerCount: {
    ...typography.footnote,
    fontVariant: ['tabular-nums' as const],
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  filterButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  filterButtonActive: {
    backgroundColor: t.brand.subtle,
  },
  filterButtonPressed: {
    backgroundColor: t.brand.subtleStrong,
  },
  filterBadge: {
    position: 'absolute' as const,
    top: space.xxs,
    right: space.xxs,
    minWidth: BADGE_MIN,
    height: BADGE_MIN,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.brand.fill,
  },
  filterBadgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.brand.onFill,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: space.sm,
  },
  skeletonContainer: {
    flex: 1,
    paddingTop: space.sm,
  },
  loadingFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
  },
  loadingText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
});

export default GenericFilterableList;
