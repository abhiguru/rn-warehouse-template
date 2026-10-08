/**
 * FioriTabBar - Custom tab bar for Expo Router Tabs (SAP Fiori compliant)
 *
 * SAP Fiori-compliant bottom tab bar component designed to work with
 * Expo Router's Tabs component as a custom tabBar.
 *
 * Fiori Spec Compliance (03-tab-bar.md):
 * - 49pt height (compact width)
 * - 24pt icons
 * - 10pt labels
 * - Filled icons for active state (primary orange)
 * - Outline icons for inactive state (gray)
 * - 44pt minimum touch targets
 * - Haptic feedback on selection
 * - Badge support for notifications
 *
 * @example
 * ```tsx
 * <Tabs tabBar={(props) => <FioriTabBar {...props} />}>
 *   <Tabs.Screen name="index" />
 * </Tabs>
 * ```
 */

import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Vibration,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';

// Fiori Tab Bar Dimensions (per spec)
const FIORI_TAB_BAR = {
  height: 49, // Compact width (iPhone)
  iconSize: 24,
  labelFontSize: 10,
  touchTargetHeight: 44, // Accessibility requirement
  badgeSize: 18,
  badgeFontSize: 11,
};

// Badge colors per Fiori spec
const BADGE_COLORS = {
  background: '#D32030', // Red
  text: '#FFFFFF', // White
};

// Icon mapping for each tab route
const TAB_ICONS: Record<string, { outline: string; filled: string }> = {
  index: { outline: 'clipboard-text-outline', filled: 'clipboard-text' },
  'order-queue': { outline: 'clipboard-list-outline', filled: 'clipboard-list' },
  grn: { outline: 'package-variant', filled: 'package-variant-closed' },
  dispatch: { outline: 'truck-fast-outline', filled: 'truck-fast' },
  invoices: { outline: 'receipt-text-outline', filled: 'receipt-text' },
  reports: { outline: 'warehouse', filled: 'warehouse' },
};

// Tabs that should only be visible to staff (admin/supervisor)
const STAFF_ONLY_TABS = ['order-queue'];

interface FioriTabBarProps extends BottomTabBarProps {
  /** Badge counts keyed by route name (e.g., { invoices: 3 }) */
  badges?: Record<string, number>;
}

export default function FioriTabBar({
  state,
  descriptors,
  navigation,
  badges = {},
}: FioriTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors, isDarkMode } = useTheme();
  const { isStaff } = useRoleBasedAccess();

  // Filter routes based on user role
  const visibleRoutes = React.useMemo(() => {
    return state.routes.filter(route => {
      // Hide staff-only tabs for non-staff users
      if (STAFF_ONLY_TABS.includes(route.name)) {
        return isStaff;
      }
      return true;
    });
  }, [state.routes, isStaff]);

  // Minimal additional padding for visual comfort
  const additionalPadding = Platform.select({
    ios: 4,
    android: 6,
    default: 6,
  });

  const bottomPadding = insets.bottom + additionalPadding;

  // Haptic feedback on tab selection (Fiori spec)
  const triggerHapticFeedback = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(10);
    }
  };

  // Render notification badge
  const renderBadge = (count: number) => {
    if (count <= 0) return null;

    const displayCount = count > 99 ? '99+' : count.toString();

    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{displayCount}</Text>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: bottomPadding,
          // In dark mode, use gray[50] (dark) not gray[800] (light - scale is inverted)
          backgroundColor: isDarkMode ? themeColors.gray[50] : themeColors.white,
        },
      ]}
    >
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: isDarkMode ? themeColors.gray[50] : themeColors.white,
            borderTopColor: isDarkMode ? themeColors.gray[200] : themeColors.gray[200],
          },
        ]}
        accessibilityRole="tablist"
      >
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          // Find the actual index in the original state for focus checking
          const actualIndex = state.routes.findIndex(r => r.key === route.key);
          const isFocused = state.index === actualIndex;
          const badgeCount = badges[route.name] || 0;

          // Get icon names for this route
          const icons = TAB_ICONS[route.name] || {
            outline: 'circle-outline',
            filled: 'circle',
          };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              triggerHapticFeedback();
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={`${label} tab${badgeCount > 0 ? `, ${badgeCount} notifications` : ''}`}
              accessibilityHint={
                isFocused ? 'Currently selected' : `Navigate to ${label}`
              }
              accessibilityState={{ selected: isFocused }}
            >
              <View style={styles.iconContainer}>
                <Icon
                  name={isFocused ? icons.filled : icons.outline}
                  size={FIORI_TAB_BAR.iconSize}
                  color={
                    isFocused
                      ? themeColors.primary
                      : isDarkMode
                        ? themeColors.gray[400]
                        : themeColors.gray[500]
                  }
                />
                {renderBadge(badgeCount)}
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isDarkMode ? themeColors.gray[400] : themeColors.gray[500],
                  },
                  isFocused && { color: themeColors.primary, fontWeight: '500' },
                ]}
              >
                {typeof label === 'string' ? label : route.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer container with safe area padding (colors applied inline)
  container: {},

  // Tab bar container per Fiori spec (colors applied inline)
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: FIORI_TAB_BAR.height,
    alignItems: 'center',
    justifyContent: 'space-around',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  // Tab item - each takes equal width
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: FIORI_TAB_BAR.touchTargetHeight,
    paddingVertical: 4,
  },

  // Icon container - holds icon and optional badge
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  // Tab label (colors applied inline)
  label: {
    fontSize: FIORI_TAB_BAR.labelFontSize,
    fontWeight: '400',
    textAlign: 'center',
  },

  // Notification badge - red badge per Fiori spec
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: FIORI_TAB_BAR.badgeSize,
    height: FIORI_TAB_BAR.badgeSize,
    borderRadius: FIORI_TAB_BAR.badgeSize / 2,
    backgroundColor: BADGE_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // Badge text - white, bold
  badgeText: {
    color: BADGE_COLORS.text,
    fontSize: FIORI_TAB_BAR.badgeFontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
});
