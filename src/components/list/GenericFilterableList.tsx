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
  SectionList,
  StyleSheet,
  RefreshControl,
  SectionListData,
  SectionListRenderItem,
} from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { ActivityIndicator, Badge, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import theme from '@/theme';
import { ListSkeletonCard } from './ListSkeletonCard';
import { ListEmptyState, ListEmptyStateProps } from './ListEmptyState';

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
  if (!loading) return null;
  return (
    <View style={styles.loadingFooter}>
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <Text style={styles.loadingText}>Loading more...</Text>
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
}>(({ title, activeFilterCount, onFilterPress, totalCount }) => (
  <View style={styles.header}>
    <View style={styles.headerLeft}>
      {title && <Text style={styles.headerTitle}>{title}</Text>}
      {totalCount !== undefined && totalCount > 0 && (
        <Text style={styles.headerCount}>{totalCount} items</Text>
      )}
    </View>
    <View style={styles.headerRight}>
      <View>
        <IconButton
          icon="filter-variant"
          mode="contained"
          containerColor={activeFilterCount > 0 ? theme.colors.orange[100] : theme.colors.gray[100]}
          iconColor={activeFilterCount > 0 ? theme.colors.primary : theme.colors.gray[600]}
          size={20}
          onPress={onFilterPress}
        />
        {activeFilterCount > 0 && (
          <Badge style={styles.filterBadge} size={16}>
            {activeFilterCount}
          </Badge>
        )}
      </View>
    </View>
  </View>
));
ListHeader.displayName = 'ListHeader';

/**
 * Skeleton loading state
 */
const SkeletonList = memo<{ count: number }>(({ count }) => (
  <View style={styles.skeletonContainer}>
    {Array.from({ length: count }).map((_, i) => (
      <ListSkeletonCard key={i} />
    ))}
  </View>
));
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
      <Animated.View style={styles.listContainer} entering={FadeIn.duration(300)}>
        {/* P7 Fix: Migrated from FlatList to FlashList for better performance */}
        <FlashList
          data={data || []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
            contentContainerStyle,
          ]}
          ListHeaderComponent={headerComponent}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
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
      <Animated.View style={styles.listContainer} entering={FadeIn.duration(300)}>
        <SectionList
          sections={sections || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
            contentContainerStyle,
          ]}
          ListHeaderComponent={headerComponent}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[800],
  },
  headerCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[500],
    marginTop: 2,
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.colors.primary,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: theme.spacing.sm,
  },
  skeletonContainer: {
    flex: 1,
    paddingTop: theme.spacing.sm,
  },
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  loadingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[500],
  },
});

export default GenericFilterableList;
