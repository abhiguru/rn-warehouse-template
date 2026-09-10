import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { CustomerDispatchItem } from '@/types/order.types';

interface DispatchHistoryCardProps {
  dispatch: CustomerDispatchItem;
  onPress?: (dispatch: CustomerDispatchItem) => void;
}

const DispatchHistoryCard: React.FC<DispatchHistoryCardProps> = ({
  dispatch,
  onPress,
}) => {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time parts for comparison
    const resetTime = (d: Date) => {
      d.setHours(0, 0, 0, 0);
      return d;
    };

    if (resetTime(new Date(date)).getTime() === resetTime(new Date(today)).getTime()) {
      return 'Today';
    } else if (resetTime(new Date(date)).getTime() === resetTime(new Date(yesterday)).getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  return (
    <View style={styles.cardContainer}>
      {/* Hidden action buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.detailsButton]}
          onPress={handleViewDetails}
          accessibilityLabel="View dispatch details"
          accessibilityRole="button"
        >
          <Icon name="eye" size={20} color={theme.colors.white} />
          <Text style={styles.actionText}>Details</Text>
        </TouchableOpacity>
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
        <TouchableOpacity
          onPress={handleCardPress}
          activeOpacity={0.7}
          style={styles.cardTouchable}
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.dispatchBadge}>
              <Icon name="package-variant" size={16} color={theme.colors.blue[700]} />
              <Text style={styles.dispatchNumber}>#{dispatch.disp_no}</Text>
            </View>
            <View style={styles.dateContainer}>
              <Text style={styles.dispatchDate}>{formatDate(dispatch.disp_date)}</Text>
              <Icon name="chevron-right" size={18} color={theme.colors.gray[400]} />
            </View>
          </View>

          {/* Item Information */}
          <View style={styles.itemSection}>
            <Text style={styles.itemName} numberOfLines={1}>
              {dispatch.grnItems_item_name}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Icon name="clipboard-list" size={14} color={theme.colors.gray[500]} />
                <Text style={styles.metaText}>GRN: {dispatch.grns_gr_no}</Text>
              </View>
              {dispatch.grnItems_rack && (
                <View style={styles.metaItem}>
                  <Icon name="map-marker" size={14} color={theme.colors.gray[500]} />
                  <Text style={styles.metaText}>Rack {dispatch.grnItems_rack}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Metrics Row */}
          <View style={styles.metricsContainer}>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{dispatch.disp_quantity}</Text>
              <Text style={styles.metricLabel}>units</Text>
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
              <Icon name="comment-text-outline" size={16} color={theme.colors.gray[500]} />
              <Text style={styles.noteText} numberOfLines={1}>
                {dispatch.note}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: theme.spacing.md,
    position: 'relative',
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: theme.spacing.lg,
  },
  actionButton: {
    width: 80,
    height: '90%',
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  detailsButton: {
    backgroundColor: theme.colors.blue[600],
  },
  actionText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.white,
    fontWeight: theme.fontWeight.semibold,
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  cardTouchable: {
    padding: theme.spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  dispatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.blue[50],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.xl,
    gap: 6,
  },
  dispatchNumber: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.blue[700],
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dispatchDate: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    fontWeight: theme.fontWeight.medium,
  },
  itemSection: {
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[100],
  },
  itemName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.gray[900],
    marginBottom: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.gray[900],
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.gray[600],
    fontWeight: theme.fontWeight.medium,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[100],
    gap: 8,
  },
  noteText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.gray[600],
    fontStyle: 'italic',
  },
});

export default DispatchHistoryCard;
