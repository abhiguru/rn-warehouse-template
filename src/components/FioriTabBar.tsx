/**
 * FioriTabBar - Custom tab bar for Expo Router Tabs (SAP Fiori compliant)
 *
 * SAP Fiori-compliant bottom tab bar component designed to work with
 * Expo Router's Tabs component as a custom tabBar.
 *
 * Style guide §13.8:
 * - surface.tabBar with a top hairline in border.divider, 49pt plus the bottom inset
 * - 24pt icons, caption2 labels that are always visible
 * - Selected: filled icon and label in brand.tint
 * - Unselected: outline icon in icon.secondary, label in text.secondary
 * - Minimum touch targets, selection haptics
 * - Count badges for items that need action
 *
 * @example
 * ```tsx
 * <Tabs tabBar={(props) => <FioriTabBar {...props} />}>
 *   <Tabs.Screen name="index" />
 * </Tabs>
 * ```
 */

import React from 'react';
import { View, Pressable, Text, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useRoleBasedAccess } from '@/hooks/useRoleBasedAccess';
import { triggerSelection } from '@/hooks/useHaptics';
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

const BADGE_SIZE = 18;

// Icon mapping for each tab route
const TAB_ICONS: Record<string, { outline: string; filled: string }> = {
  index: { outline: 'clipboard-text-outline', filled: 'clipboard-text' },
  'order-queue': { outline: 'clipboard-list-outline', filled: 'clipboard-list' },
  grn: { outline: 'package-variant', filled: 'package-variant-closed' },
  dispatch: { outline: 'truck-fast-outline', filled: 'truck-fast' },
  invoices: { outline: 'receipt-text-outline', filled: 'receipt-text' },
  reports: { outline: 'warehouse', filled: 'warehouse' },
};

// Tabs that should only be visible to warehouse roles (admin/supervisor/staff)
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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { canManageOrders } = useRoleBasedAccess();

  // Filter routes based on user role
  const visibleRoutes = React.useMemo(() => {
    return state.routes.filter(route => {
      // Hide the order queue from customer accounts
      if (STAFF_ONLY_TABS.includes(route.name)) {
        return canManageOrders;
      }
      return true;
    });
  }, [state.routes, canManageOrders]);

  // Small extra padding when there is no home indicator inset
  const bottomPadding = insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? space.s6 : space.xs;

  // Render notification badge
  const renderBadge = (count: number) => {
    if (count <= 0) return null;

    const displayCount = count > 99 ? '99+' : count.toString();

    return (
      <View style={styles.badge} importantForAccessibility="no-hide-descendants">
        <Text style={styles.badgeText} maxFontSizeMultiplier={1.6}>
          {displayCount}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <View style={styles.tabBar} accessibilityRole="tablist">
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
              triggerSelection();
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
            <Pressable
              key={route.key}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityLabel={`${typeof label === 'string' ? label : route.name}${
                badgeCount > 0 ? `, ${badgeCount} need action` : ''
              }`}
              accessibilityState={{ selected: isFocused }}
            >
              <View style={styles.iconContainer}>
                <Icon
                  name={isFocused ? icons.filled : icons.outline}
                  size={iconSize.lg}
                  color={isFocused ? t.brand.tint : t.icon.secondary}
                />
                {renderBadge(badgeCount)}
              </View>
              <Text
                style={[styles.label, isFocused && styles.labelSelected]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.6}
              >
                {typeof label === 'string' ? label : route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  // Outer container carries the bottom safe-area inset
  container: {
    backgroundColor: t.surface.tabBar,
    ...t.shadow[2],
  },

  tabBar: {
    flexDirection: 'row' as const,
    height: layout.tabBarHeight,
    alignItems: 'center' as const,
    justifyContent: 'space-around' as const,
    backgroundColor: t.surface.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },

  // Tab item - each takes equal width
  tab: {
    flex: 1,
    alignSelf: 'stretch' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: Math.min(touchTarget, layout.tabBarHeight),
    paddingVertical: space.xs,
  },
  tabPressed: {
    backgroundColor: t.surface.cardPressed,
  },

  // Icon container - holds icon and optional badge
  iconContainer: {
    position: 'relative' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: space.xxs,
  },

  label: {
    ...typography.caption2,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  labelSelected: {
    color: t.brand.tint,
    fontWeight: fontWeight.semibold,
  },

  // Count badge for items that need action
  badge: {
    position: 'absolute' as const,
    top: -space.xs,
    right: -space.sm,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.pill,
    backgroundColor: t.destructive.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.xs,
    borderWidth: 1.5,
    borderColor: t.surface.tabBar,
  },
  badgeText: {
    ...typography.caption2,
    color: t.destructive.onFill,
    fontWeight: fontWeight.bold,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
});
