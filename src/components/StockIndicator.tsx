/**
 * Stock indicator (docs/STYLE_GUIDE.md §13.5).
 *
 * A status tag (icon plus word), the remaining quantity as "120 of 200 units" and
 * a bar on a brand.subtleStrong track. The bar fill is status.positive.element
 * above 50%, status.critical.element from 10% to 50% and status.negative.element
 * below 10%. `flashRed` pulses the row once (no loop; skipped with Reduce Motion).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, AccessibilityInfo, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  motion,
  radius,
  space,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

interface StockIndicatorProps {
  currentStock: number;
  originalStock: number;
  flashRed?: boolean;
  /** Unit shown after the numbers (default "units"). */
  unit?: string;
}

type Level = 'positive' | 'critical' | 'negative';

const LEVEL_ICON: Record<Level, string> = {
  positive: 'check-circle',
  critical: 'alert',
  negative: 'alert-circle',
};

const numberFormat = new Intl.NumberFormat('en-IN');

const StockIndicator: React.FC<StockIndicatorProps> = ({
  currentStock,
  originalStock,
  flashRed = false,
  unit = 'units',
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!flashRed) return undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        // One pulse in, one out: never loops.
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: motion.fast,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: motion.slow,
            easing: Easing.in(Easing.quad),
            useNativeDriver: false,
          }),
        ]).start();
      });
    return () => {
      cancelled = true;
    };
  }, [flashRed, flashAnim]);

  const backgroundColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', t.status.negative.background],
  });

  // Handle undefined or invalid values
  const validCurrentStock = currentStock || 0;
  const validOriginalStock = originalStock || 0;
  const hasTotal = validOriginalStock > 0;

  const stockPercentage = hasTotal ? (validCurrentStock / validOriginalStock) * 100 : 0;
  const fillPercent = Math.max(0, Math.min(100, stockPercentage));

  let level: Level = 'positive';
  let stockStatus = 'In stock';
  if (validCurrentStock <= 0) {
    level = 'negative';
    stockStatus = 'Out of stock';
  } else if (hasTotal && stockPercentage < 10) {
    level = 'negative';
    stockStatus = 'Very low';
  } else if (hasTotal && stockPercentage <= 50) {
    level = 'critical';
    stockStatus = 'Low stock';
  }
  const status = t.status[level];

  const quantityText = hasTotal
    ? `${numberFormat.format(validCurrentStock)} of ${numberFormat.format(validOriginalStock)} ${unit}`
    : `${numberFormat.format(validCurrentStock)} ${unit}`;

  return (
    <Animated.View
      style={[styles.container, { backgroundColor }]}
      accessible
      accessibilityLabel={`${stockStatus}, ${quantityText}`}
    >
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: status.background }]}>
          <Icon name={LEVEL_ICON[level]} size={iconSize.sm} color={status.text} />
          <Text style={[styles.badgeText, { color: status.text }]} maxFontSizeMultiplier={1.6}>
            {stockStatus}
          </Text>
        </View>
        <Text style={[styles.stockText, flashRed && styles.stockTextFlash]}>
          {quantityText}
        </Text>
      </View>
      {hasTotal && (
        <View style={styles.track}>
          <View
            style={[styles.fill, { width: `${fillPercent}%`, backgroundColor: status.element }]}
          />
        </View>
      )}
    </Animated.View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    borderRadius: radius.button,
    paddingVertical: space.xxs,
    paddingHorizontal: space.xs,
    gap: space.xs,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  // Status tag: radius.field, caption weight 600, icon plus word
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  badgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },
  stockText: {
    ...typography.caption1,
    flexShrink: 1,
    textAlign: 'right' as const,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  stockTextFlash: {
    color: t.status.negative.text,
    fontWeight: fontWeight.bold,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtleStrong,
    overflow: 'hidden' as const,
  },
  fill: {
    height: 4,
    borderRadius: radius.pill,
  },
});

export default StockIndicator;
