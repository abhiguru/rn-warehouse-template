/**
 * ListSkeletonCard - Reusable skeleton loading card for list views
 *
 * SAP Fiori Design System - Skeleton Loading Component
 * Spec: design/sap-fiori-specs/01-object-cell.md (loading state)
 *
 * Used by GRNListFiori, DispatchListFiori, OrderListFiori, InvoiceListFiori
 * Provides consistent loading state across the app.
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
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// SAP Fiori Design Constants
// Mimics Object Cell dimensions from 01-object-cell.md
// ============================================================================
const FIORI = {
  // Card dimensions
  card: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    minHeight: 88, // Fiori Object Cell min height
  },
  // Avatar/Status icon placeholder
  avatar: {
    size: 40,
    borderRadius: 20, // Circular for avatar
  },
  // Typography placeholders
  typography: {
    title: { height: 17, width: '60%', borderRadius: 4 },
    subtitle: { height: 13, width: '40%', borderRadius: 4 },
    caption: { height: 11, width: '30%', borderRadius: 4 },
  },
  // Attribute placeholders
  attribute: {
    height: 32,
    borderRadius: 4,
  },
  // Spacing
  spacing: {
    avatarToContent: 12,
    titleToSubtitle: 6,
    contentToMetrics: 12,
    metricGap: 8,
  },
  // Animation
  animation: {
    duration: 1200,
    minOpacity: 0.4,
    maxOpacity: 1,
  },
  // Colors
  colors: {
    skeleton: '#E5E5E5', // Fiori skeleton gray
    background: '#FFFFFF',
  },
} as const;

interface ListSkeletonCardProps {
  /** Number of metric placeholders to show (default: 3) */
  metricsCount?: number;
  /** Custom height for the card */
  height?: number;
  /** Show footer row (default: true) */
  showFooter?: boolean;
}

export const ListSkeletonCard = memo<ListSkeletonCardProps>(({
  metricsCount = 3,
  height,
  showFooter = true,
}) => {
  const colors = useListColors();

  // Use consistent colors from useListColors hook (same as GRN skeleton)
  const cardBackground = colors.cellBackground;
  const skeletonColor = colors.gray200;

  const opacity = useSharedValue(0.4);

  useEffect(() => {
    // Smooth pulse animation
    opacity.value = withRepeat(
      withTiming(1, {
        duration: FIORI.animation.duration / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1, // Infinite
      true // Reverse
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderWidth: 1,
          borderColor: colors.cellDivider,
        },
        animatedStyle,
        height ? { height } : null,
      ]}
      accessible={true}
      accessibilityLabel="Loading content"
      accessibilityRole="none"
    >
      {/* Header Row: Avatar + Content + Attribute */}
      <View style={styles.header}>
        {/* Avatar/Status Icon Placeholder */}
        <View style={[styles.avatar, { backgroundColor: skeletonColor }]} />

        {/* Content Area */}
        <View style={styles.content}>
          <View style={[styles.title, { backgroundColor: skeletonColor }]} />
          <View style={[styles.subtitle, { backgroundColor: skeletonColor }]} />
        </View>

        {/* Attribute Stack Placeholder */}
        <View style={styles.attributeStack}>
          <View style={[styles.attributeValue, { backgroundColor: skeletonColor }]} />
          <View style={[styles.attributeLabel, { backgroundColor: skeletonColor }]} />
        </View>
      </View>

      {/* Metrics Row */}
      {showFooter && (
        <View style={styles.metrics}>
          {Array.from({ length: metricsCount }).map((_, i) => (
            <View key={i} style={[styles.metric, { backgroundColor: skeletonColor }]} />
          ))}
        </View>
      )}
    </Animated.View>
  );
});

ListSkeletonCard.displayName = 'ListSkeletonCard';

// ============================================================================
// Styles - SAP Fiori Design System
// Colors are applied dynamically for dark mode support
// ============================================================================
const styles = StyleSheet.create({
  // Card Container - Fiori Object Cell
  card: {
    // backgroundColor applied dynamically
    borderRadius: FIORI.card.borderRadius,
    padding: FIORI.card.padding,
    marginHorizontal: FIORI.card.marginHorizontal,
    marginBottom: FIORI.card.marginBottom,
    minHeight: FIORI.card.minHeight,
    // Platform-specific shadows
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

  // Header Row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Avatar Placeholder - 40x40pt circular
  avatar: {
    width: FIORI.avatar.size,
    height: FIORI.avatar.size,
    borderRadius: FIORI.avatar.borderRadius,
    // backgroundColor applied dynamically
    marginRight: FIORI.spacing.avatarToContent,
  },

  // Content Area
  content: {
    flex: 1,
  },

  // Title Placeholder - 17pt height
  title: {
    height: FIORI.typography.title.height,
    width: FIORI.typography.title.width,
    // backgroundColor applied dynamically
    borderRadius: FIORI.typography.title.borderRadius,
    marginBottom: FIORI.spacing.titleToSubtitle,
  },

  // Subtitle Placeholder - 13pt height
  subtitle: {
    height: FIORI.typography.subtitle.height,
    width: FIORI.typography.subtitle.width,
    // backgroundColor applied dynamically
    borderRadius: FIORI.typography.subtitle.borderRadius,
  },

  // Attribute Stack (right side)
  attributeStack: {
    alignItems: 'flex-end',
  },

  // Attribute Value Placeholder
  attributeValue: {
    height: 20,
    width: 48,
    // backgroundColor applied dynamically
    borderRadius: 4,
    marginBottom: 4,
  },

  // Attribute Label Placeholder
  attributeLabel: {
    height: 11,
    width: 32,
    // backgroundColor applied dynamically
    borderRadius: 4,
  },

  // Metrics Row
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: FIORI.spacing.contentToMetrics,
  },

  // Metric Placeholder
  metric: {
    height: FIORI.attribute.height,
    flex: 1,
    // backgroundColor applied dynamically
    borderRadius: FIORI.attribute.borderRadius,
    marginHorizontal: FIORI.spacing.metricGap / 2,
  },
});

export default ListSkeletonCard;
