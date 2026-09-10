/**
 * GenericDetailTabNavigator Component - SAP Fiori Compliant
 *
 * Configurable tab navigation for detail screens
 * Replaces: GRNTabNavigator, DispatchTabNavigator, InvoiceTabNavigator
 *
 * @see design/sap-fiori-specs/03-tab-bar.md
 */

import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Vibration,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================

const FIORI_STATIC = {
  dimensions: {
    tabBarHeight: 56,
    iconSize: 22,
    touchTarget: 44,
    badgeSize: 18,
    badgeMinWidth: 18,
  },
  spacing: {
    tabPaddingHorizontal: 16,
    tabPaddingVertical: 8,
    tabGap: 4,
    iconLabelGap: 4,
    containerPadding: 8,
  },
  typography: {
    label: {
      fontSize: 11,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },
    labelActive: {
      fontWeight: '600' as const,
    },
    badge: {
      fontSize: 10,
      fontWeight: '700' as const,
    },
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: {
      elevation: 2,
    },
  }) as ViewStyle,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface TabIconConfig {
  filled: string;
  outline: string;
}

export interface TabConfig<T extends string = string> {
  key: T;
  label: string;
  icon: TabIconConfig;
  badgeCount?: number;
}

export interface GenericDetailTabNavigatorProps<T extends string = string> {
  /** Array of tab configurations */
  tabs: TabConfig<T>[];
  /** Currently active tab key */
  activeTab: T;
  /** Callback when tab is changed */
  onTabChange: (tab: T) => void;
  /** Optional icon size override (default: 22) */
  iconSize?: number;
}

// ============================================================================
// PREDEFINED ICON CONFIGS
// ============================================================================

export const TAB_ICONS = {
  overview: { filled: 'information', outline: 'information-outline' },
  items: { filled: 'package-variant', outline: 'package-variant' },
  dispatches: { filled: 'truck-delivery', outline: 'truck-delivery-outline' },
  grns: { filled: 'receipt', outline: 'receipt' },
  images: { filled: 'image-multiple', outline: 'image-multiple-outline' },
  invoices: { filled: 'file-document', outline: 'file-document-outline' },
  lineItems: { filled: 'receipt', outline: 'receipt-text-outline' },
  breakdown: { filled: 'calculator-variant', outline: 'calculator-variant-outline' },
} as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function GenericDetailTabNavigator<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  iconSize = FIORI_STATIC.dimensions.iconSize,
}: GenericDetailTabNavigatorProps<T>) {
  // Theme colors for dark mode support
  const colors = useListColors();

  const handleTabPress = (tabKey: T) => {
    if (tabKey !== activeTab) {
      Vibration.vibrate(10);
      onTabChange(tabKey);
    }
  };

  const getIconName = (icon: TabIconConfig, isActive: boolean): string => {
    return isActive ? icon.filled : icon.outline;
  };

  const formatBadge = (count: number): string => {
    return count > 99 ? '99+' : count.toString();
  };

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      backgroundColor: colors.cellBackground,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
      ...FIORI_STATIC.shadow,
    },
    tabActive: {
      backgroundColor: colors.primaryLight,
    },
    tabPressed: {
      backgroundColor: colors.gray100,
    },
    badge: {
      position: 'absolute',
      top: -6,
      right: -10,
      backgroundColor: colors.error,
      borderRadius: FIORI_STATIC.dimensions.badgeSize / 2,
      minWidth: FIORI_STATIC.dimensions.badgeMinWidth,
      height: FIORI_STATIC.dimensions.badgeSize,
      paddingHorizontal: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeText: {
      color: '#fff',
      ...FIORI_STATIC.typography.badge,
      textAlign: 'center',
    },
    label: {
      ...FIORI_STATIC.typography.label,
      color: colors.gray500,
      textAlign: 'center',
    },
    labelActive: {
      color: colors.primary,
      ...FIORI_STATIC.typography.labelActive,
    },
    activeIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 16,
      right: 16,
      height: 3,
      backgroundColor: colors.primary,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },
  }), [colors]);

  return (
    <View style={dynamicStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const iconName = getIconName(tab.icon, isActive);

          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [
                styles.tab,
                isActive && dynamicStyles.tabActive,
                pressed && !isActive && dynamicStyles.tabPressed,
              ]}
              onPress={() => handleTabPress(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab${
                tab.badgeCount ? `, ${tab.badgeCount} items` : ''
              }`}
            >
              <View style={styles.iconContainer}>
                <Icon
                  name={iconName}
                  size={iconSize}
                  color={isActive ? colors.primary : colors.gray500}
                />
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <View style={dynamicStyles.badge}>
                    <Text style={dynamicStyles.badgeText}>{formatBadge(tab.badgeCount)}</Text>
                  </View>
                )}
              </View>

              <Text
                style={[dynamicStyles.label, isActive && dynamicStyles.labelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>

              {isActive && <View style={dynamicStyles.activeIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES (Static styles only - colors are in dynamic styles)
// ============================================================================

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: FIORI_STATIC.spacing.containerPadding,
    paddingVertical: FIORI_STATIC.spacing.containerPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: FIORI_STATIC.dimensions.touchTarget,
    minWidth: 64,
    paddingHorizontal: FIORI_STATIC.spacing.tabPaddingHorizontal,
    paddingVertical: FIORI_STATIC.spacing.tabPaddingVertical,
    marginHorizontal: FIORI_STATIC.spacing.tabGap / 2,
    borderRadius: 8,
    position: 'relative',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: FIORI_STATIC.spacing.iconLabelGap,
  },
});

export default GenericDetailTabNavigator;
