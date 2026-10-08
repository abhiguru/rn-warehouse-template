import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useListColors, type ListColors } from '@/hooks/useListColors';
import type { ItemStoragePrice } from '@/types/item-pricing.types';
import { formatCurrency } from '@/utils/formatters';

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
  colors?: ListColors;
}

const FIORI = {
  objectCell: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 },
  badge: { height: 20, borderRadius: 10, fontSize: 10, paddingHorizontal: 6 },
  avatar: { size: 28, borderRadius: 14 },
  swipe: { buttonWidth: 56, iconSize: 18 },
} as const;

const ItemPricingCard = memo<ItemPricingCardProps>(
  ({ price, onPress, onView, onEdit, onDelete, index, canManage = true, isLastInSection = false, isFirstForCustomer = false, colors: colorsProp }) => {
    const hookColors = useListColors();
    const colors = colorsProp || hookColors;
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

    const renderRightActions = () => (
      <View style={styles.swipeActionsContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.swipeAction,
            { backgroundColor: colors.statusNeutral },
            pressed && styles.swipeActionPressed,
          ]}
          onPress={() => handleSwipeAction('view')}
        >
          <Ionicons name="eye-outline" color={colors.white} size={FIORI.swipe.iconSize} />
        </Pressable>
        {canManage && (
          <Pressable
            style={({ pressed }) => [
              styles.swipeAction,
              { backgroundColor: colors.statusCritical },
              pressed && styles.swipeActionPressed,
            ]}
            onPress={() => handleSwipeAction('edit')}
          >
            <Ionicons name="create-outline" color={colors.white} size={FIORI.swipe.iconSize} />
          </Pressable>
        )}
        {canManage && (
          <Pressable
            style={({ pressed }) => [
              styles.swipeAction,
              { backgroundColor: colors.statusNegative },
              pressed && styles.swipeActionPressed,
            ]}
            onPress={() => handleSwipeAction('delete')}
          >
            <Ionicons name="trash-outline" color={colors.white} size={FIORI.swipe.iconSize} />
          </Pressable>
        )}
      </View>
    );

    // Check if price is expired
    const isExpired = price.effective_to && new Date(price.effective_to) < new Date();
    const isDefault = !price.customer_id;

    // Format compact date
    const formatCompactDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    };

    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index * 15, 80)).springify()}
        layout={Layout.springify()}
      >
        <Animated.View style={animatedCardStyle}>
          {/* Customer Group Header - only show for first item in customer group */}
          {isFirstForCustomer && (
            <View style={[styles.customerGroupHeader, { backgroundColor: colors.gray50, borderBottomColor: colors.gray100 }]}>
              <View style={[
                styles.customerAvatar,
                { backgroundColor: isDefault ? colors.primary : colors.statusNeutral }
              ]}>
                <Ionicons
                  name={isDefault ? 'globe-outline' : 'person-outline'}
                  size={14}
                  color={colors.white}
                />
              </View>
              <Text style={[styles.customerGroupName, { color: colors.textPrimary }]} numberOfLines={1}>
                {price.customer_name || 'Default Pricing'}
              </Text>
              {isDefault && (
                <View style={[styles.defaultBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>BASE</Text>
                </View>
              )}
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
            >
              <View style={[
                styles.objectCell,
                {
                  backgroundColor: colors.cellBackground,
                  borderColor: colors.gray100,
                },
                isExpired && { backgroundColor: colors.gray50, opacity: 0.7 },
                isLastInSection && styles.objectCellLast,
              ]}>
                {/* Main Row: Weight + Price Type Badge + Price + Actions */}
                <View style={styles.mainRow}>
                  {/* Left: Weight Range */}
                  <View style={styles.weightContainer}>
                    <Ionicons name="scale-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.weightText, { color: colors.textPrimary }]}>
                      {price.weight_min}-{price.weight_max} kg
                    </Text>
                  </View>

                  {/* Center: Price Type Badge */}
                  <View style={[
                    styles.typeBadge,
                    {
                      backgroundColor: price.price_type === 'one_time' ? colors.primaryLight : colors.statusCriticalLight,
                    }
                  ]}>
                    <Text style={[
                      styles.typeBadgeText,
                      { color: price.price_type === 'one_time' ? colors.primary : colors.statusCritical }
                    ]}>
                      {price.price_type === 'one_time' ? 'ONE-TIME' : 'MONTHLY'}
                    </Text>
                  </View>

                  {/* Right: Price */}
                  <Text style={[
                    styles.priceText,
                    { color: price.price_type === 'one_time' ? colors.primary : colors.statusCritical }
                  ]}>
                    {formatCurrency(price.unit_price)}
                  </Text>

                  {/* Expired Badge */}
                  {isExpired && (
                    <View style={[styles.expiredBadge, { backgroundColor: colors.statusNegative }]}>
                      <Text style={[styles.expiredBadgeText, { color: colors.white }]}>EXP</Text>
                    </View>
                  )}

                  {/* Chevron */}
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </View>

                {/* Secondary Row: Labour, Tax, Validity */}
                <View style={styles.secondaryRow}>
                  <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
                    Labour {formatCurrency(price.labour_rate)}
                  </Text>
                  <Text style={[styles.separator, { color: colors.gray300 }]}>·</Text>
                  <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
                    Tax {price.tax_percent}%
                  </Text>
                  <Text style={[styles.separator, { color: colors.gray300 }]}>·</Text>
                  <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
                    From {formatCompactDate(price.effective_from)}
                    {price.effective_to ? ` to ${formatCompactDate(price.effective_to)}` : '+'}
                  </Text>
                </View>
              </View>
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
  const colors = useListColors();
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
    <Animated.View style={[styles.skeletonCard, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, animatedStyle]}>
      {/* Main row skeleton */}
      <View style={styles.skeletonRow}>
        <View style={[styles.skeleton, { width: 70, height: 14, backgroundColor: colors.gray200 }]} />
        <View style={[styles.skeleton, { width: 55, height: 18, borderRadius: 9, backgroundColor: colors.gray200 }]} />
        <View style={[styles.skeleton, { width: 60, height: 16, backgroundColor: colors.gray200, marginLeft: 'auto' }]} />
      </View>
      {/* Secondary row skeleton */}
      <View style={[styles.skeletonRow, { marginBottom: 0 }]}>
        <View style={[styles.skeleton, { width: 180, height: 12, backgroundColor: colors.gray200 }]} />
      </View>
    </Animated.View>
  );
});

ItemPricingSkeletonCard.displayName = 'ItemPricingSkeletonCard';

const styles = StyleSheet.create({
  // Customer Group Header
  customerGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 4,
    borderBottomWidth: 1,
    gap: 8,
  },
  customerAvatar: {
    width: FIORI.avatar.size,
    height: FIORI.avatar.size,
    borderRadius: FIORI.avatar.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerGroupName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Object Cell - Compact Fiori style
  objectCell: {
    marginHorizontal: 12,
    paddingHorizontal: FIORI.objectCell.paddingHorizontal,
    paddingVertical: FIORI.objectCell.paddingVertical,
    minHeight: FIORI.objectCell.minHeight,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  objectCellLast: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 4,
  },

  // Main Row
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  weightText: {
    fontSize: 13,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: FIORI.badge.paddingHorizontal,
    paddingVertical: 2,
    borderRadius: FIORI.badge.borderRadius,
    height: FIORI.badge.height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontSize: FIORI.badge.fontSize,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  priceText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  expiredBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  expiredBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Secondary Row
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  secondaryText: {
    fontSize: 11,
  },
  separator: {
    marginHorizontal: 4,
    fontSize: 11,
  },

  // Swipe Actions
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    paddingLeft: 4,
    gap: 4,
  },
  swipeAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  swipeActionPressed: {
    opacity: 0.85,
  },

  // Skeleton
  skeletonCard: {
    marginVertical: 4,
    marginHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
  },
  skeleton: {
    borderRadius: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
});

export default ItemPricingCard;
