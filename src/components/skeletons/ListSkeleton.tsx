/**
 * ListSkeleton - Skeleton loader for list screens
 *
 * Renders multiple ListSkeletonCard components to show
 * a loading state for list views.
 *
 * @module components/skeletons/ListSkeleton
 */

import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { space } from '@/theme/tokens';
import { ListSkeletonCard } from '../list/ListSkeletonCard';
import { t as tr } from '@/i18n';

export interface ListSkeletonProps {
  /** Number of skeleton items to render (default: 5) */
  count?: number;
  /** Number of metric placeholders per item (default: 3) */
  metricsCount?: number;
  /** Show footer row on each item (default: true) */
  showFooter?: boolean;
}

export const ListSkeleton = memo<ListSkeletonProps>(({
  count = 5,
  metricsCount = 3,
  showFooter = true,
}) => {
  return (
    <View style={styles.container} accessible accessibilityLabel={tr('components.skeleton.loadingList')} accessibilityState={{ busy: true }}>
      {Array.from({ length: count }).map((_, index) => (
        <ListSkeletonCard
          key={index}
          metricsCount={metricsCount}
          showFooter={showFooter}
        />
      ))}
    </View>
  );
});

ListSkeleton.displayName = 'ListSkeleton';

const styles = StyleSheet.create({
  container: {
    paddingTop: space.sm,
  },
});

export default ListSkeleton;
