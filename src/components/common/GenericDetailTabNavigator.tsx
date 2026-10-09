/**
 * GenericDetailTabNavigator Component - SAP Fiori Compliant
 *
 * Configurable tab navigation for detail screens
 * Replaces: GRNTabNavigator, DispatchTabNavigator, InvoiceTabNavigator
 *
 */

import React from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize as iconSizes, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

/** Default tab glyph size. */
const DEFAULT_TAB_ICON_SIZE = iconSizes.md;
/** Count badge minimum size (style guide 13.5). */
const BADGE_SIZE = 18;

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
  /** Optional icon size override (default: iconSize.md, 20) */
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
  iconSize = DEFAULT_TAB_ICON_SIZE,
}: GenericDetailTabNavigatorProps<T>) {
  const t = useTokens();
  const dynamicStyles = useThemedStyles(makeStyles);

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

  return (
    <View style={dynamicStyles.container} accessibilityRole="tablist">
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
                pressed && !isActive && dynamicStyles.tabPressed,
              ]}
              onPress={() => handleTabPress(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label}${
                tab.badgeCount ? `, ${tab.badgeCount} ${tab.badgeCount === 1 ? 'item' : 'items'}` : ''
              }`}
            >
              <View style={styles.iconContainer}>
                <Icon
                  name={iconName}
                  size={iconSize}
                  color={isActive ? t.brand.tint : t.icon.secondary}
                />
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <View style={dynamicStyles.badge}>
                    <Text style={dynamicStyles.badgeText} maxFontSizeMultiplier={1.6}>
                      {formatBadge(tab.badgeCount)}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[dynamicStyles.label, isActive && dynamicStyles.labelActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.6}
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
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  tabPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  badge: {
    position: 'absolute' as const,
    top: -6,
    right: -10,
    backgroundColor: t.brand.fill,
    borderRadius: radius.pill,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: space.xs,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  badgeText: {
    ...typography.caption2,
    fontWeight: fontWeight.bold,
    color: t.brand.onFill,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  label: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  labelActive: {
    color: t.brand.tint,
  },
  activeIndicator: {
    position: 'absolute' as const,
    bottom: 0,
    left: space.sm,
    right: space.sm,
    height: 2,
    backgroundColor: t.brand.tint,
  },
});

const styles = StyleSheet.create({
  // Tabs share the width when they fit (up to four on phones) and scroll when they do not.
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.xs,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget + space.lg,
    flexGrow: 1,
    minWidth: 64,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    position: 'relative',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: space.xs,
  },
});

export default GenericDetailTabNavigator;
