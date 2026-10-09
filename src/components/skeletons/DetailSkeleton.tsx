/**
 * DetailSkeleton - Skeleton loader for detail screens
 *
 * Provides a loading placeholder for detail views with:
 * - Hero header with title and subtitle
 * - Tab bar placeholder
 * - Content area with cards
 *
 * Blocks are surface.cardActive on surface.card, text lines use radius.field,
 * and the pulse stops with Reduce Motion (docs/STYLE_GUIDE.md §13.6, §9).
 *
 * @module components/skeletons/DetailSkeleton
 */

import React, { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, radius, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface DetailSkeletonProps {
  /** Show hero header section (default: true) */
  showHeader?: boolean;
  /** Show tab bar placeholder (default: true) */
  showTabs?: boolean;
  /** Number of tab placeholders (default: 3) */
  tabCount?: number;
  /** Number of content card placeholders (default: 3) */
  cardCount?: number;
  /** Show status badge in header (default: true) */
  showStatusBadge?: boolean;
}

const ANIMATION_DURATION = 1200;
const RESTING_OPACITY = 0.7;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  block: {
    backgroundColor: t.surface.cardActive,
  },

  // Header
  header: {
    backgroundColor: t.surface.card,
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  backButton: {
    width: space.huge,
    height: space.huge,
    borderRadius: radius.pill,
    marginBottom: space.lg,
  },
  headerContent: {
    gap: space.sm,
  },
  statusBadge: {
    width: 80,
    height: space.xxl,
    borderRadius: radius.field,
    marginBottom: space.xs,
  },
  title: {
    width: '70%' as const,
    height: 28,
    borderRadius: radius.field,
  },
  subtitle: {
    width: '50%' as const,
    height: 18,
    borderRadius: radius.field,
  },
  metaRow: {
    flexDirection: 'row' as const,
    gap: space.lg,
    marginTop: space.sm,
  },
  metaItem: {
    width: 100,
    height: space.lg,
    borderRadius: radius.field,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface.header,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    gap: space.xxl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  tab: {
    width: 60,
    height: space.xl,
    borderRadius: radius.field,
  },

  // Content
  content: {
    flex: 1,
    padding: layout.marginCompact,
    gap: space.md,
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    ...t.shadow[2],
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    marginBottom: space.xs,
  },
  cardIcon: {
    width: space.xxxl,
    height: space.xxxl,
    borderRadius: radius.pill,
  },
  cardTitle: {
    width: '40%' as const,
    height: 18,
    borderRadius: radius.field,
  },
  cardRow: {
    width: '100%' as const,
    height: 14,
    borderRadius: radius.field,
  },
  cardRowShort: {
    width: '60%' as const,
  },
});

export const DetailSkeleton = memo<DetailSkeletonProps>(({
  showHeader = true,
  showTabs = true,
  tabCount = 3,
  cardCount = 3,
  showStatusBadge = true,
}) => {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(reduceMotion ? RESTING_OPACITY : 0.4);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = RESTING_OPACITY;
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, {
        duration: ANIMATION_DURATION / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel="Loading details"
      accessibilityState={{ busy: true }}
    >
      {/* Hero Header */}
      {showHeader && (
        <Animated.View style={[styles.header, { paddingTop: insets.top + space.lg }, animatedStyle]}>
          {/* Back button placeholder */}
          <View style={[styles.backButton, styles.block]} />

          {/* Header content */}
          <View style={styles.headerContent}>
            {/* Status badge */}
            {showStatusBadge && <View style={[styles.statusBadge, styles.block]} />}

            {/* Title */}
            <View style={[styles.title, styles.block]} />

            {/* Subtitle */}
            <View style={[styles.subtitle, styles.block]} />

            {/* Meta row */}
            <View style={styles.metaRow}>
              <View style={[styles.metaItem, styles.block]} />
              <View style={[styles.metaItem, styles.block]} />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Tab Bar */}
      {showTabs && (
        <Animated.View style={[styles.tabBar, animatedStyle]}>
          {Array.from({ length: tabCount }).map((_, index) => (
            <View key={index} style={[styles.tab, styles.block]} />
          ))}
        </Animated.View>
      )}

      {/* Content Area */}
      <Animated.View style={[styles.content, animatedStyle]}>
        {Array.from({ length: cardCount }).map((_, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, styles.block]} />
              <View style={[styles.cardTitle, styles.block]} />
            </View>
            <View style={[styles.cardRow, styles.block]} />
            <View style={[styles.cardRow, styles.block]} />
            <View style={[styles.cardRow, styles.cardRowShort, styles.block]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

DetailSkeleton.displayName = 'DetailSkeleton';

export default DetailSkeleton;
