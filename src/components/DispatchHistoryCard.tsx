import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { CustomerDispatchItem } from '@/types/order.types';
import { formatDate, formatCount } from '@/utils/formatters';

interface DispatchHistoryCardProps {
  dispatch: CustomerDispatchItem;
  onPress?: (dispatch: CustomerDispatchItem) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  cardContainer: {
    marginBottom: space.sm,
    position: 'relative' as const,
  },
  actionsContainer: {
    position: 'absolute' as const,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingRight: space.lg,
  },
  actionButton: {
    width: 80,
    height: '90%' as const,
    borderRadius: radius.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    backgroundColor: t.brand.fill,
  },
  actionButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  actionText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    ...t.shadow[2],
  },
  cardTouchable: {
    padding: space.lg,
    borderRadius: radius.card,
    minHeight: layout.objectCellMinHeight,
  },
  cardTouchablePressed: {
    backgroundColor: t.surface.cardPressed,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: space.md,
  },
  dispatchBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
  },
  dispatchNumber: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  dateContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  dispatchDate: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  itemSection: {
    marginBottom: space.md,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.sm,
  },
  metaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.md,
  },
  metaItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  metaText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  metricsContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    gap: space.md,
  },
  metricBox: {
    flex: 1,
    backgroundColor: t.background.base,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  metricValue: {
    ...typography.headline,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  metricLabel: {
    ...typography.caption1,
    color: t.text.secondary,
  },
  noteContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  noteText: {
    ...typography.subhead,
    flex: 1,
    color: t.text.primary,
  },
});

const DispatchHistoryCard: React.FC<DispatchHistoryCardProps> = ({
  dispatch,
  onPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const swipeAnim = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Only allow left swipe (negative dx)
        if (gestureState.dx < 0) {
          swipeAnim.setValue(Math.max(gestureState.dx, -100));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx < -50) {
          // Swipe threshold reached, reveal actions
          Animated.spring(swipeAnim, {
            toValue: -100,
            useNativeDriver: true,
            friction: 7,
          }).start();
        } else {
          // Return to original position
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const handleCardPress = () => {
    // Close swipe first if open
    Animated.spring(swipeAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 7,
    }).start();

    if (onPress) {
      onPress(dispatch);
    } else {
      router.push(`/dispatch-details/${dispatch.dispatch_id}`);
    }
  };

  const handleViewDetails = () => {
    router.push(`/dispatch-details/${dispatch.dispatch_id}`);
  };

  const dateLabel = formatDate(dispatch.disp_date, 'short');
  const bags = formatCount(dispatch.disp_quantity, 'bag');

  return (
    <View style={styles.cardContainer}>
      {/* Hidden action buttons */}
      <View style={styles.actionsContainer}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={handleViewDetails}
          accessibilityLabel={`View dispatch ${dispatch.disp_no}`}
          accessibilityRole="button"
        >
          <Icon name="eye-outline" size={iconSize.md} color={t.brand.onFill} />
          <Text style={styles.actionText}>Details</Text>
        </Pressable>
      </View>

      {/* Main card content */}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ translateX: swipeAnim }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={handleCardPress}
          style={({ pressed }) => [styles.cardTouchable, pressed && styles.cardTouchablePressed]}
          accessibilityRole="button"
          accessibilityLabel={`Dispatch ${dispatch.disp_no}, ${dispatch.grnItems_item_name}, ${bags}, ${dateLabel}`}
          accessibilityHint="Opens the dispatch"
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.dispatchBadge}>
              <Icon name="truck-delivery-outline" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.dispatchNumber}>Dispatch {dispatch.disp_no}</Text>
            </View>
            <View style={styles.dateContainer}>
              <Text style={styles.dispatchDate}>{dateLabel}</Text>
              <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
            </View>
          </View>

          {/* Item Information */}
          <View style={styles.itemSection}>
            <Text style={styles.itemName} numberOfLines={2}>
              {dispatch.grnItems_item_name}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Icon name="package-down" size={iconSize.sm} color={t.icon.secondary} />
                <Text style={styles.metaText}>GRN {dispatch.grns_gr_no}</Text>
              </View>
              {dispatch.grnItems_rack && (
                <View style={styles.metaItem}>
                  <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                  <Text style={styles.metaText}>Rack {dispatch.grnItems_rack}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Metrics Row */}
          <View style={styles.metricsContainer}>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{dispatch.disp_quantity}</Text>
              <Text style={styles.metricLabel}>{dispatch.disp_quantity === 1 ? 'bag' : 'bags'}</Text>
            </View>
            {dispatch.grnItems_weight && (
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{dispatch.grnItems_weight}</Text>
                <Text style={styles.metricLabel}>kg</Text>
              </View>
            )}
            {dispatch.registration && (
              <View style={styles.metricBox}>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {dispatch.registration.split('-').slice(-2).join('-')}
                </Text>
                <Text style={styles.metricLabel}>vehicle</Text>
              </View>
            )}
          </View>

          {/* Note Preview (if exists) */}
          {dispatch.note && (
            <View style={styles.noteContainer}>
              <Icon name="note-text-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.noteText} numberOfLines={1}>
                {dispatch.note}
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
};

export default DispatchHistoryCard;
