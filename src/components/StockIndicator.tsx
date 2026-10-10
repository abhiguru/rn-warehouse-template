/**
 * Stock indicator (docs/STYLE_GUIDE.md §13.5).
 *
 * A status tag (icon plus word), the remaining quantity as "120 of 200 units" and
 * a bar on a brand.subtleStrong track filled in the status element colour. The
 * status follows the app's one stock rule in `@/utils/stockStatus`: no stock is
 * "Out of stock" (negative), below LOW_STOCK_RATIO (20%) of the original quantity
 * is "Low stock" (critical), otherwise "In stock" (positive).
 * `flashRed` pulses the row once (no loop; skipped with Reduce Motion).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, AccessibilityInfo, Easing } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { StatusTag } from '@/components/ui/StatusTag';
import { getStockStatus } from '@/utils/stockStatus';
import { formatCount, formatNumber } from '@/utils/formatters';
import { fontWeight, motion, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface StockIndicatorProps {
  currentStock: number;
  originalStock: number;
  flashRed?: boolean;
  /** Unit after the numbers, singular (default "unit"). */
  unit?: string;
  /** Plural of `unit` when it is not unit + "s". */
  unitPlural?: string;
}

const StockIndicator: React.FC<StockIndicatorProps> = ({
  currentStock,
  originalStock,
  flashRed = false,
  unit = 'unit',
  unitPlural,
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

  const stock = getStockStatus(validCurrentStock, validOriginalStock);
  const status = t.status[stock.status];

  const quantityText = hasTotal
    ? tr('components.stock.currentOfTotal', {
        current: formatNumber(validCurrentStock),
        total: formatCount(validOriginalStock, unit, unitPlural),
      })
    : formatCount(validCurrentStock, unit, unitPlural);

  return (
    <Animated.View
      style={[styles.container, { backgroundColor }]}
      accessible
      accessibilityLabel={`${stock.label}, ${quantityText}`}
    >
      <View style={styles.row}>
        <StatusTag status={stock.status} label={stock.label} />
        <Text style={[styles.stockText, flashRed && styles.stockTextFlash]}>
          {quantityText}
        </Text>
      </View>
      {hasTotal && (
        <View style={styles.track}>
          <View
            style={[styles.fill, { width: `${stock.percentage}%`, backgroundColor: status.element }]}
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
