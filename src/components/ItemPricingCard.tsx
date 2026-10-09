import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Avatar, StatusTag } from '@/components/ui';

interface ItemPricingCardProps {
  price: ItemStoragePrice;
  onPress: (price: ItemStoragePrice) => void;
  onView: (price: ItemStoragePrice) => void;
  onEdit: (price: ItemStoragePrice) => void;
  onDelete: (price: ItemStoragePrice) => void;
  index: number;
  canManage?: boolean;
  isLastInSection?: boolean;
  isFirstForCustomer?: boolean; // Show customer header for first item in customer group
  /**
   * @deprecated Ignored. The card reads the semantic tokens itself; kept so
   * existing callers that still pass list colours compile.
   */
  colors?: unknown;
}

const ItemPricingCard = memo<ItemPricingCardProps>(
  ({ price, onPress, onView, onEdit, onDelete, index, canManage = true, isLastInSection = false, isFirstForCustomer = false }) => {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const scale = useSharedValue(1);
    const swipeableRef = useRef<Swipeable | null>(null);

    const animatedCardStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
      'worklet';
      scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
    };

    const handlePressOut = () => {
      'worklet';
      scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    };

    const handleSwipeAction = (action: 'view' | 'edit' | 'delete') => {
      'worklet';
      if (action === 'view') {
        runOnJS(onView)(price);
      } else if (action === 'edit') {
        runOnJS(onEdit)(price);
      } else if (action === 'delete') {
        runOnJS(onDelete)(price);
      }
      runOnJS(() => swipeableRef.current?.close())();
    };

    const weightLabel = `${price.weight_min}–${price.weight_max} kg`;
    const isOneTime = price.price_type === 'one_time';
    const typeLabel = isOneTime ? 'One-time' : 'Monthly';

    const renderRightActions = () => (
      <View style={styles.swipeActionsContainer}>
        <Pressable
          style={({ pressed }) => [styles.swipeAction, styles.swipeView, pressed && styles.swipeViewPressed]}
          onPress={() => handleSwipeAction('view')}
          accessibilityRole="button"
          accessibilityLabel={`View price for ${weightLabel}`}
        >
          <Icon name="eye-outline" color={t.text.primary} size={iconSize.lg} />
          <Text style={styles.swipeLabel} maxFontSizeMultiplier={1.4}>View</Text>
        </Pressable>
        {canManage && (
          <Pressable
            style={({ pressed }) => [styles.swipeAction, styles.swipeEdit, pressed && styles.swipeEditPressed]}
            onPress={() => handleSwipeAction('edit')}
            accessibilityRole="button"
            accessibilityLabel={`Edit price for ${weightLabel}`}
          >
            <Icon name="pencil-outline" color={t.brand.onFill} size={iconSize.lg} />
            <Text style={[styles.swipeLabel, styles.swipeLabelOnBrand]} maxFontSizeMultiplier={1.4}>Edit</Text>
          </Pressable>
        )}
        {canManage && (
          <Pressable
            style={({ pressed }) => [styles.swipeAction, styles.swipeDelete, pressed && styles.swipeDeletePressed]}
            onPress={() => handleSwipeAction('delete')}
            accessibilityRole="button"
            accessibilityLabel={`Delete price for ${weightLabel}`}
          >
            <Icon name="trash-can-outline" color={t.destructive.onFill} size={iconSize.lg} />
            <Text style={[styles.swipeLabel, styles.swipeLabelOnDestructive]} maxFontSizeMultiplier={1.4}>Delete</Text>
          </Pressable>
        )}
      </View>
    );

    // Check if price is expired
    const isExpired = !!price.effective_to && new Date(price.effective_to) < new Date();
    const isDefault = !price.customer_id;
    const validity = `From ${formatDate(price.effective_from, 'short')}${
      price.effective_to ? ` to ${formatDate(price.effective_to, 'short')}` : ''
    }`;
    const rowLabel = [
      weightLabel,
      typeLabel,
      formatCurrency(price.unit_price),
      isExpired ? 'Expired' : null,
      `Labour ${formatCurrency(price.labour_rate)}`,
      `Tax ${price.tax_percent}%`,
      validity,
    ]
      .filter(Boolean)
      .join(', ');

    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index * 15, 80)).springify()}
        layout={Layout.springify()}
      >
        <Animated.View style={animatedCardStyle}>
          {/* Customer Group Header - only show for first item in customer group */}
          {isFirstForCustomer && (
            <View style={styles.customerGroupHeader} accessible accessibilityRole="header">
              {isDefault ? (
                <View style={styles.defaultAvatar}>
                  <Icon name="earth" size={iconSize.sm} color={t.brand.tint} />
                </View>
              ) : (
                <Avatar name={price.customer_name} id={price.customer_id} size="sm" />
              )}
              <Text style={styles.customerGroupName} numberOfLines={2}>
                {price.customer_name || 'Default pricing'}
              </Text>
              {isDefault && <StatusTag status="neutral" label="Base" icon={null} />}
            </View>
          )}

          <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            friction={2}
            rightThreshold={40}
          >
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => onPress(price)}
              accessibilityRole="button"
              accessibilityLabel={rowLabel}
              accessibilityHint="Swipe left for view, edit and delete"
            >
              {({ pressed }) => (
                <View style={[
                  styles.objectCell,
                  pressed && styles.objectCellPressed,
                  isLastInSection && styles.objectCellLast,
                ]}>
                  {/* Main Row: Weight + Price Type Tag + Price */}
                  <View style={styles.mainRow}>
                    {/* Left: Weight Range */}
                    <View style={styles.weightContainer}>
                      <Icon name="scale" size={iconSize.sm} color={t.icon.secondary} />
                      <Text style={styles.weightText}>{weightLabel}</Text>
                    </View>

                    {/* Price Type Tag */}
                    <StatusTag status={isOneTime ? 'neutral' : 'informative'} label={typeLabel} icon={null} />

                    {/* Right: Price */}
                    <Text style={styles.priceText}>{formatCurrency(price.unit_price)}</Text>

                    {/* Chevron */}
                    <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                  </View>

                  {/* Secondary Row: Labour, Tax, Validity */}
                  <View style={styles.secondaryRow}>
                    <Text style={styles.secondaryText}>
                      Labour {formatCurrency(price.labour_rate)}
                    </Text>
                    <Text style={styles.separator}>·</Text>
                    <Text style={styles.secondaryText}>Tax {price.tax_percent}%</Text>
                    <Text style={styles.separator}>·</Text>
                    <Text style={styles.secondaryText}>{validity}</Text>
                    {isExpired && <StatusTag status="negative" label="Expired" style={styles.expiredTag} />}
                  </View>
                </View>
              )}
            </Pressable>
          </Swipeable>
        </Animated.View>
      </Animated.View>
    );
  }
);

ItemPricingCard.displayName = 'ItemPricingCard';

// Skeleton Loading Card Component - Compact Fiori style
export const ItemPricingSkeletonCard = memo(() => {
  const styles = useThemedStyles(makeStyles);
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withSpring(1, { duration: 800 }, () => {
      opacity.value = withSpring(0.3, { duration: 800 });
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.skeletonCard, animatedStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading prices"
    >
      {/* Main row skeleton */}
      <View style={styles.skeletonRow}>
        <View style={[styles.skeleton, { width: 70, height: 14 }]} />
        <View style={[styles.skeleton, { width: 55, height: 18 }]} />
        <View style={[styles.skeleton, { width: 60, height: 16, marginLeft: 'auto' }]} />
      </View>
      {/* Secondary row skeleton */}
      <View style={[styles.skeletonRow, { marginBottom: 0 }]}>
        <View style={[styles.skeleton, { width: 180, height: 12 }]} />
      </View>
    </Animated.View>
  );
});

ItemPricingSkeletonCard.displayName = 'ItemPricingSkeletonCard';

const makeStyles = (t: ThemeTokens) => ({
  // Customer Group Header
  customerGroupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginHorizontal: space.md,
    marginTop: space.xs,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
    borderTopLeftRadius: radius.button,
    borderTopRightRadius: radius.button,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    gap: space.sm,
  },
  defaultAvatar: {
    width: layout.avatar.sm,
    height: layout.avatar.sm,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
  },
  customerGroupName: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    flex: 1,
    color: t.text.primary,
  },

  // Object Cell - compact rows inside a customer group
  objectCell: {
    marginHorizontal: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  objectCellPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  objectCellLast: {
    borderBottomLeftRadius: radius.button,
    borderBottomRightRadius: radius.button,
    borderBottomWidth: 0,
    marginBottom: space.xs,
  },

  // Main Row
  mainRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  weightContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minWidth: 80,
  },
  weightText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  priceText: {
    ...typography.headline,
    flex: 1,
    textAlign: 'right' as const,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  expiredTag: {
    marginLeft: space.sm,
  },

  // Secondary Row
  secondaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    flexWrap: 'wrap' as const,
  },
  secondaryText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  separator: {
    ...typography.footnote,
    marginHorizontal: space.xs,
    color: t.text.secondary,
  },

  // Swipe Actions
  // Swipe actions (guide §13.6): at least 72 wide, full row height, icon over a label
  swipeActionsContainer: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    paddingRight: space.md,
    paddingLeft: space.xs,
    gap: space.xs,
  },
  swipeAction: {
    minWidth: 72,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.xxs,
    borderRadius: radius.button,
  },
  swipeLabel: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  swipeLabelOnBrand: {
    color: t.brand.onFill,
  },
  swipeLabelOnDestructive: {
    color: t.destructive.onFill,
  },
  swipeView: {
    backgroundColor: t.surface.cardActive,
  },
  swipeViewPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  swipeEdit: {
    backgroundColor: t.brand.fill,
  },
  swipeEditPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  swipeDelete: {
    backgroundColor: t.destructive.fill,
  },
  swipeDeletePressed: {
    backgroundColor: t.destructive.fillPressed,
  },

  // Skeleton
  skeletonCard: {
    marginVertical: space.xs,
    marginHorizontal: space.md,
    borderRadius: radius.button,
    padding: space.md,
    backgroundColor: t.surface.card,
  },
  skeleton: {
    borderRadius: radius.field,
    backgroundColor: t.surface.cardActive,
  },
  skeletonRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.s6,
  },
});

export default ItemPricingCard;
