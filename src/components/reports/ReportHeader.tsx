/**
 * ReportHeader Component - SAP Fiori Compliant
 *
 * A reusable header for report screens with back button, title, and optional actions.
 * Follows SAP Fiori Navigation Bar spec.
 *
 * @see design/sap-fiori-specs/02-navigation-bar.md
 * @see src/theme/index.ts - FioriColors interface
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors, type ListColors } from '@/hooks/useListColors';

// ============================================================================
// SAP Fiori Design Tokens - Dimensions only (colors applied dynamically)
// ============================================================================
const FIORI = {
  dimensions: {
    headerHeight: 56,
    buttonSize: 44,      // Fiori touch target
    buttonRadius: 22,
    iconSize: 24,
  },
  typography: {
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    subtitle: {
      fontSize: 12,
      fontWeight: '400' as const,
    },
  },
};

interface ReportHeaderProps {
  /** Report title */
  title: string;
  /** Optional subtitle (e.g., date range) */
  subtitle?: string;
  /** Whether to show back button (default: true) */
  showBack?: boolean;
  /** Custom back action */
  onBack?: () => void;
  /** Right-side action button */
  actionIcon?: string;
  /** Right-side action callback */
  onAction?: () => void;
  /** Right-side action accessibility label */
  actionLabel?: string;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  title,
  subtitle,
  showBack = true,
  onBack,
  actionIcon,
  onAction,
  actionLabel,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useListColors();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: colors.cellBackground,
          borderBottomColor: colors.cellDivider,
        },
      ]}
    >
      <View style={styles.content}>
        {/* Left side - Back button */}
        <View style={styles.leftSection}>
          {showBack && (
            <Pressable
              style={({ pressed }) => [
                styles.navButton,
                pressed && { backgroundColor: colors.cellBackgroundPressed },
              ]}
              onPress={handleBack}
              accessibilityLabel="Go back"
              accessibilityRole="button"
              accessibilityHint="Navigate to previous screen"
            >
              <Icon name="arrow-left" size={FIORI.dimensions.iconSize} color={colors.textPrimary} />
            </Pressable>
          )}
        </View>

        {/* Center - Title and subtitle */}
        <View style={styles.centerSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right side - Action button */}
        <View style={styles.rightSection}>
          {actionIcon && onAction && (
            <Pressable
              style={({ pressed }) => [
                styles.navButton,
                pressed && { backgroundColor: colors.cellBackgroundPressed },
              ]}
              onPress={onAction}
              accessibilityLabel={actionLabel || 'Action'}
              accessibilityRole="button"
            >
              <Icon name={actionIcon} size={FIORI.dimensions.iconSize} color={colors.textPrimary} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// SAP Fiori Compliant Styles
// @see design/sap-fiori-specs/02-navigation-bar.md
// Colors applied inline for dark mode support
// ============================================================================
const styles = StyleSheet.create({
  container: {
    // backgroundColor: applied inline for dark mode
    borderBottomWidth: StyleSheet.hairlineWidth,
    // borderBottomColor: applied inline for dark mode
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIORI.dimensions.headerHeight,
    paddingHorizontal: 4,
  },
  leftSection: {
    width: 48,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  rightSection: {
    width: 48,
    alignItems: 'flex-end',
  },
  navButton: {
    width: FIORI.dimensions.buttonSize,
    height: FIORI.dimensions.buttonSize,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FIORI.dimensions.buttonRadius,
  },
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    // color: applied inline for dark mode
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FIORI.typography.subtitle.fontSize,
    fontWeight: FIORI.typography.subtitle.fontWeight,
    // color: applied inline for dark mode
    textAlign: 'center',
    marginTop: 2,
  },
});

export default ReportHeader;
