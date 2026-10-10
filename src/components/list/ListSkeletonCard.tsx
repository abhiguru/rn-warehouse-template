/**
 * ListSkeletonCard - Reusable skeleton loading card for list views
 *
 * A placeholder object cell on surface.card with blocks in surface.cardActive
 * at the size of real content; text lines use radius.field. The pulse stops
 * with Reduce Motion (docs/STYLE_GUIDE.md §13.6, §9).
 *
 * Used by GRNListFiori, DispatchListFiori, OrderListFiori, InvoiceListFiori
 */

import React, { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { layout, radius, space } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const ANIMATION_DURATION = 1200;
const RESTING_OPACITY = 0.7;
const AVATAR = space.huge;

interface ListSkeletonCardProps {
  /** Number of metric placeholders to show (default: 3) */
  metricsCount?: number;
  /** Custom height for the card */
  height?: number;
  /** Show footer row (default: true) */
  showFooter?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.sm,
    minHeight: layout.objectCellMinHeight,
    ...t.shadow[2],
  },
  block: {
    backgroundColor: t.surface.cardActive,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    marginRight: space.md,
  },
  content: {
    flex: 1,
  },
  title: {
    height: 17,
    width: '60%' as const,
    borderRadius: radius.field,
    marginBottom: space.s6,
  },
  subtitle: {
    height: 13,
    width: '40%' as const,
    borderRadius: radius.field,
  },
  attributeStack: {
    alignItems: 'flex-end' as const,
  },
  attributeValue: {
    height: space.xl,
    width: space.giant,
    borderRadius: radius.field,
    marginBottom: space.xs,
  },
  attributeLabel: {
    height: 11,
    width: space.xxxl,
    borderRadius: radius.field,
  },
  metrics: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: space.md,
  },
  metric: {
    height: space.xxxl,
    flex: 1,
    borderRadius: radius.field,
    marginHorizontal: space.xs,
  },
});

export const ListSkeletonCard = memo<ListSkeletonCardProps>(({
  metricsCount = 3,
  height,
  showFooter = true,
}) => {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const opacity = useSharedValue(reduceMotion ? RESTING_OPACITY : 0.4);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = RESTING_OPACITY;
      return;
    }
    // Smooth pulse animation
    opacity.value = withRepeat(
      withTiming(1, {
        duration: ANIMATION_DURATION / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1, // Infinite
      true // Reverse
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.card, animatedStyle, height ? { height } : null]}
      accessible={true}
      accessibilityLabel={translate('lists.loadingContent')}
      accessibilityState={{ busy: true }}
    >
      {/* Header Row: Avatar + Content + Attribute */}
      <View style={styles.header}>
        <View style={[styles.avatar, styles.block]} />

        <View style={styles.content}>
          <View style={[styles.title, styles.block]} />
          <View style={[styles.subtitle, styles.block]} />
        </View>

        <View style={styles.attributeStack}>
          <View style={[styles.attributeValue, styles.block]} />
          <View style={[styles.attributeLabel, styles.block]} />
        </View>
      </View>

      {/* Metrics Row */}
      {showFooter && (
        <View style={styles.metrics}>
          {Array.from({ length: metricsCount }).map((_, i) => (
            <View key={i} style={[styles.metric, styles.block]} />
          ))}
        </View>
      )}
    </Animated.View>
  );
});

ListSkeletonCard.displayName = 'ListSkeletonCard';

export default ListSkeletonCard;
