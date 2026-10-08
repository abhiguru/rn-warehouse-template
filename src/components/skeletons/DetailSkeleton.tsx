/**
 * DetailSkeleton - Skeleton loader for detail screens
 *
 * Provides a loading placeholder for detail views with:
 * - Hero header with title and subtitle
 * - Tab bar placeholder
 * - Content area with cards
 *
 * @module components/skeletons/DetailSkeleton
 */

import React, { memo, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListColors } from '@/hooks/useListColors';

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

export const DetailSkeleton = memo<DetailSkeletonProps>(({
  showHeader = true,
  showTabs = true,
  tabCount = 3,
  cardCount = 3,
  showStatusBadge = true,
}) => {
  const colors = useListColors();

  // Use consistent colors from useListColors hook
  const containerBg = colors.gray50;
  const cardBg = colors.cellBackground;
  const skeletonColor = colors.gray200;
  const borderColor = colors.cellDivider;

  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, {
        duration: ANIMATION_DURATION / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]} accessible accessibilityLabel="Loading details">
      {/* Hero Header */}
      {showHeader && (
        <Animated.View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: cardBg, borderBottomColor: borderColor }, animatedStyle]}>
          {/* Back button placeholder */}
          <View style={[styles.backButton, { backgroundColor: skeletonColor }]} />

          {/* Header content */}
          <View style={styles.headerContent}>
            {/* Status badge */}
            {showStatusBadge && <View style={[styles.statusBadge, { backgroundColor: skeletonColor }]} />}

            {/* Title */}
            <View style={[styles.title, { backgroundColor: skeletonColor }]} />

            {/* Subtitle */}
            <View style={[styles.subtitle, { backgroundColor: skeletonColor }]} />

            {/* Meta row */}
            <View style={styles.metaRow}>
              <View style={[styles.metaItem, { backgroundColor: skeletonColor }]} />
              <View style={[styles.metaItem, { backgroundColor: skeletonColor }]} />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Tab Bar */}
      {showTabs && (
        <Animated.View style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: borderColor }, animatedStyle]}>
          {Array.from({ length: tabCount }).map((_, index) => (
            <View key={index} style={[styles.tab, { backgroundColor: skeletonColor }]} />
          ))}
        </Animated.View>
      )}

      {/* Content Area */}
      <Animated.View style={[styles.content, animatedStyle]}>
        {Array.from({ length: cardCount }).map((_, index) => (
          <View key={index} style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: skeletonColor }]} />
              <View style={[styles.cardTitle, { backgroundColor: skeletonColor }]} />
            </View>
            <View style={[styles.cardRow, { backgroundColor: skeletonColor }]} />
            <View style={[styles.cardRow, { backgroundColor: skeletonColor }]} />
            <View style={[styles.cardRow, { width: '60%', backgroundColor: skeletonColor }]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

DetailSkeleton.displayName = 'DetailSkeleton';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor applied dynamically
  },

  // Header
  header: {
    // backgroundColor, borderBottomColor applied dynamically
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor applied dynamically
    marginBottom: 16,
  },
  headerContent: {
    gap: 8,
  },
  statusBadge: {
    width: 80,
    height: 24,
    borderRadius: 12,
    // backgroundColor applied dynamically
    marginBottom: 4,
  },
  title: {
    width: '70%',
    height: 28,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },
  subtitle: {
    width: '50%',
    height: 18,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  metaItem: {
    width: 100,
    height: 16,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    // backgroundColor, borderBottomColor applied dynamically
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 24,
    borderBottomWidth: 1,
  },
  tab: {
    width: 60,
    height: 20,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },

  // Content
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  card: {
    // backgroundColor applied dynamically
    borderRadius: 12,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    // backgroundColor applied dynamically
  },
  cardTitle: {
    width: '40%',
    height: 18,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },
  cardRow: {
    width: '100%',
    height: 14,
    borderRadius: 4,
    // backgroundColor applied dynamically
  },
});

export default DetailSkeleton;
