/**
 * SectionHeader Component - SAP Fiori Design
 *
 * A section header for organizing content into logical groups.
 * @see design/sap-fiori-specs/14-section-header.md
 *
 * Features:
 * - Uppercase section title with 13pt font
 * - Optional count badge
 * - Optional action button (text or icon)
 * - 44pt touch targets for buttons
 * - Accessibility support
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { listColors } from '@/theme/listColors';

// ============================================================================
// FIORI CONSTANTS
// ============================================================================

const FIORI = {
  header: {
    minHeight: 32, // 32pt min (44pt with button)
    minHeightWithButton: 44,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  typography: {
    title: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    count: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
    buttonText: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
  },
  button: {
    height: 28, // Compact button height
    paddingHorizontal: 12,
    borderRadius: 14,
    iconSize: 20,
  },
  touchTarget: 44,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface SectionHeaderAction {
  /** Text label for button (exclusive with icon) */
  label?: string;
  /** Icon name for icon button (exclusive with label) */
  icon?: string;
  /** Press handler */
  onPress: () => void;
  /** Accessibility label */
  accessibilityLabel?: string;
}

export interface SectionHeaderProps {
  /** Section title (will be displayed uppercase) */
  title: string;
  /** Optional count to display in badge */
  count?: number;
  /** Optional action button */
  action?: SectionHeaderAction;
  /** Custom container style */
  style?: ViewStyle;
  /** Whether to use grouped style (gray background) */
  grouped?: boolean;
  /** Test ID */
  testID?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  count,
  action,
  style,
  grouped = false,
  testID,
}) => {
  const hasButton = action && (action.label || action.icon);

  return (
    <View
      style={[
        styles.container,
        hasButton && styles.containerWithButton,
        grouped && styles.containerGrouped,
        style,
      ]}
      accessibilityRole="header"
      testID={testID}
    >
      {/* Title and Count */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        {count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        )}
      </View>

      {/* Action Button */}
      {action && (
        action.icon ? (
          <Pressable
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel || `Add ${title.toLowerCase()}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon
              name={action.icon}
              size={FIORI.button.iconSize}
              color={listColors.primary}
            />
          </Pressable>
        ) : action.label ? (
          <Pressable
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.textButton,
              pressed && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel || action.label}
          >
            <Text style={styles.buttonText}>{action.label}</Text>
          </Pressable>
        ) : null
      )}
    </View>
  );
};

// ============================================================================
// SECTION FOOTER COMPONENT
// ============================================================================

interface SectionFooterAction {
  /** Button label */
  label: string;
  /** Press handler */
  onPress: () => void;
}

export interface SectionFooterProps {
  /** Optional text to display (only shown if no actions) */
  text?: string;
  /** Optional left-aligned action */
  leftAction?: SectionFooterAction;
  /** Optional right-aligned action */
  rightAction?: SectionFooterAction;
  /** Custom container style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

export const SectionFooter: React.FC<SectionFooterProps> = ({
  text,
  leftAction,
  rightAction,
  style,
  testID,
}) => {
  const hasActions = leftAction || rightAction;

  return (
    <View style={[styles.footer, style]} testID={testID}>
      {/* Left action or text */}
      {leftAction ? (
        <Pressable
          onPress={leftAction.onPress}
          style={({ pressed }) => [
            styles.footerButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{leftAction.label}</Text>
        </Pressable>
      ) : text && !rightAction ? (
        <Text style={styles.footerText}>{text}</Text>
      ) : (
        <View />
      )}

      {/* Right action */}
      {rightAction && (
        <Pressable
          onPress={rightAction.onPress}
          style={({ pressed }) => [
            styles.footerButton,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{rightAction.label}</Text>
        </Pressable>
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Header Container
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: FIORI.header.minHeight,
    paddingHorizontal: FIORI.header.paddingHorizontal,
    paddingTop: FIORI.header.paddingTop,
    paddingBottom: FIORI.header.paddingBottom,
    backgroundColor: 'transparent',
  },
  containerWithButton: {
    minHeight: FIORI.header.minHeightWithButton,
  },
  containerGrouped: {
    backgroundColor: listColors.gray50, // Grouped style: #F7F9FA
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Title Container
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    ...FIORI.typography.title,
    color: listColors.textSecondary, // Fiori: #556B82
  },

  // Count Badge
  countBadge: {
    marginLeft: 8,
    backgroundColor: listColors.gray200,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    ...FIORI.typography.count,
    color: listColors.textSecondary,
  },

  // Icon Button
  iconButton: {
    width: FIORI.touchTarget,
    height: FIORI.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8, // Offset padding to align with edge
  },

  // Text Button
  textButton: {
    height: FIORI.button.height,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  // Button Text
  buttonText: {
    ...FIORI.typography.buttonText,
    color: listColors.primary,
  },

  // Button Pressed State
  buttonPressed: {
    opacity: 0.7,
  },

  // Footer Container
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: FIORI.header.paddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },

  // Footer Text
  footerText: {
    fontSize: 13,
    color: listColors.textSecondary,
  },

  // Footer Button
  footerButton: {
    height: FIORI.button.height,
    paddingHorizontal: FIORI.button.paddingHorizontal,
    borderRadius: FIORI.button.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SectionHeader;
