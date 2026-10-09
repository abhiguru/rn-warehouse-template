/**
 * SectionHeader Component - SAP Fiori Design
 *
 * A section header for organizing content into logical groups.
 *
 * Features:
 * - Uppercase section title in footnote, text.secondary (style guide §13.6)
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
  ViewStyle,
  Insets,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';

/** Visual height of a text action; the touch area is padded to touchTarget. */
const TEXT_BUTTON_HEIGHT = 28;
const TEXT_BUTTON_HIT_SLOP: Insets = {
  top: (touchTarget - TEXT_BUTTON_HEIGHT) / 2,
  bottom: (touchTarget - TEXT_BUTTON_HEIGHT) / 2,
};

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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const hasButton = action && (action.label || action.icon);

  return (
    <View
      style={[
        styles.container,
        hasButton && styles.containerWithButton,
        grouped && styles.containerGrouped,
        style,
      ]}
      testID={testID}
    >
      {/* Title and Count */}
      <View
        style={styles.titleContainer}
        accessible
        accessibilityRole="header"
        accessibilityLabel={count !== undefined ? `${title}, ${count}` : title}
      >
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        {count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countText} maxFontSizeMultiplier={1.6}>
              {count}
            </Text>
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
          >
            <Icon
              name={action.icon}
              size={iconSize.md}
              color={t.brand.tint}
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
            hitSlop={TEXT_BUTTON_HIT_SLOP}
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
  const styles = useThemedStyles(makeStyles);

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
          hitSlop={TEXT_BUTTON_HIT_SLOP}
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
          hitSlop={TEXT_BUTTON_HIT_SLOP}
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

const makeStyles = (t: ThemeTokens) => ({
  // Header container: 16 side padding, 24 above, 8 below
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.sm,
    backgroundColor: 'transparent',
  },
  containerWithButton: {
    paddingTop: space.lg,
    paddingBottom: space.xs,
    minHeight: touchTarget,
  },
  containerGrouped: {
    backgroundColor: t.background.grouped,
  },

  // Title
  titleContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  title: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: t.text.secondary,
  },

  // Plain count badge: brand.fill with brand.onFill. "Needs action" counts use
  // destructive.fill with destructive.onFill instead (§13.5).
  countBadge: {
    marginLeft: space.sm,
    backgroundColor: t.brand.fill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    minWidth: 24,
    alignItems: 'center' as const,
  },
  countText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    fontVariant: ['tabular-nums' as const],
  },

  // Icon button
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: -space.sm, // Offset padding to align with edge
  },

  // Text button (tertiary)
  textButton: {
    minHeight: TEXT_BUTTON_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  },
  buttonText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  buttonPressed: {
    backgroundColor: t.brand.subtle,
  },

  // Footer
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    backgroundColor: 'transparent',
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  footerButton: {
    minHeight: TEXT_BUTTON_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

export default SectionHeader;
