/**
 * SAP Fiori button (docs/STYLE_GUIDE.md §13.1).
 *
 * Types:
 * - primary: the one main action of a screen or dialog (filled)
 * - secondary: other actions (outlined)
 * - tertiary: low-emphasis actions (text only)
 *
 * Styles:
 * - tint: brand colour (default)
 * - normal: neutral, e.g. Cancel
 * - negative: destructive. A primary negative button uses the destructive.* fill.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
  View,
  Insets,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { triggerLightTap } from '@/hooks/useHaptics';

// ============================================================================
// TYPES
// ============================================================================

export type ButtonType = 'primary' | 'secondary' | 'tertiary';
export type ButtonStyle = 'tint' | 'normal' | 'negative';
export type ButtonSize = 'auto' | 'standalone' | 'fullWidth' | 'compact';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  /** Button text label */
  children: string;
  /** Button type (primary, secondary, tertiary) */
  type?: ButtonType;
  /** Button style variant (tint, normal, negative) */
  variant?: ButtonStyle;
  /** Button size/width behavior */
  size?: ButtonSize;
  /** Loading state - shows spinner */
  loading?: boolean;
  /** Loading text (optional, shown alongside spinner) */
  loadingText?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Left icon name (MaterialCommunityIcons) */
  leftIcon?: string;
  /** Right icon name (MaterialCommunityIcons) */
  rightIcon?: string;
  /** Icon-only button (no text); children becomes the accessibility label */
  iconOnly?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom text style */
  textStyle?: TextStyle;
}

// Legacy size type for backwards compatibility
export type LegacyButtonSize = 'small' | 'medium' | 'large';

// Legacy exports for backwards compatibility
export interface BaseButtonProps extends Omit<ButtonProps, 'size'> {
  /** Legacy size prop */
  size?: LegacyButtonSize;
  /** Full width button */
  fullWidth?: boolean;
}

// ============================================================================
// SIZES AND COLOURS
// ============================================================================

const HEIGHT_COMPACT = 32;
const HEIGHT_STANDALONE = 48;
const STANDALONE_MIN_WIDTH = 120;
const MIN_WIDTH = 64;

/** Pads a compact button's touch area up to the platform minimum. */
const COMPACT_HIT_SLOP: Insets = {
  top: (touchTarget - HEIGHT_COMPACT) / 2,
  bottom: (touchTarget - HEIGHT_COMPACT) / 2,
  left: 0,
  right: 0,
};

export interface ButtonColors {
  background: string;
  text: string;
  border: string;
  borderWidth: number;
}

/** Container, label and border colours for a type, style and pressed state. */
export function getButtonColors(
  t: ThemeTokens,
  type: ButtonType,
  variant: ButtonStyle,
  pressed: boolean
): ButtonColors {
  if (type === 'primary') {
    if (variant === 'negative') {
      return {
        background: pressed ? t.destructive.fillPressed : t.destructive.fill,
        text: t.destructive.onFill,
        border: 'transparent',
        borderWidth: 0,
      };
    }
    return {
      background: pressed ? t.brand.fillPressed : t.brand.fill,
      text: t.brand.onFill,
      border: 'transparent',
      borderWidth: 0,
    };
  }

  if (type === 'secondary') {
    if (variant === 'negative') {
      return {
        background: pressed ? t.status.negative.background : 'transparent',
        text: t.status.negative.text,
        border: t.status.negative.border,
        borderWidth: 1,
      };
    }
    if (variant === 'normal') {
      return {
        background: pressed ? t.surface.cardPressed : 'transparent',
        text: t.text.primary,
        border: t.border.button,
        borderWidth: 1,
      };
    }
    return {
      background: pressed ? t.brand.subtle : 'transparent',
      text: t.brand.tint,
      border: t.border.button,
      borderWidth: 1,
    };
  }

  // tertiary
  if (variant === 'negative') {
    return {
      background: pressed ? t.status.negative.background : 'transparent',
      text: t.status.negative.text,
      border: 'transparent',
      borderWidth: 0,
    };
  }
  if (variant === 'normal') {
    return {
      background: pressed ? t.surface.cardPressed : 'transparent',
      text: t.text.primary,
      border: 'transparent',
      borderWidth: 0,
    };
  }
  return {
    background: pressed ? t.brand.subtle : 'transparent',
    text: t.brand.tint,
    border: 'transparent',
    borderWidth: 0,
  };
}

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

export function Button({
  children,
  type = 'primary',
  variant = 'tint',
  size = 'auto',
  loading = false,
  loadingText,
  disabled = false,
  leftIcon,
  rightIcon,
  iconOnly = false,
  style,
  textStyle,
  ...props
}: ButtonProps) {
  const [isPressed, setIsPressed] = React.useState(false);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const isDisabled = disabled || loading;
  const colors = getButtonColors(t, type, variant, isPressed && !isDisabled);

  const sizeStyle =
    size === 'compact'
      ? styles.sizeCompact
      : size === 'standalone'
        ? styles.sizeStandalone
        : size === 'fullWidth'
          ? styles.sizeFullWidth
          : styles.sizeAuto;

  const labelStyle = [
    styles.text,
    type === 'tertiary' ? styles.textTertiary : styles.textEmphasized,
    { color: colors.text },
    textStyle,
  ];
  const glyphSize = iconOnly ? iconSize.lg : iconSize.md;
  const label = loading && loadingText ? loadingText : children;

  return (
    <TouchableOpacity
      hitSlop={size === 'compact' ? COMPACT_HIT_SLOP : undefined}
      {...props}
      disabled={isDisabled}
      activeOpacity={1}
      onPressIn={(e) => {
        setIsPressed(true);
        triggerLightTap();
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setIsPressed(false);
        props.onPressOut?.(e);
      }}
      style={[
        styles.container,
        sizeStyle,
        iconOnly && styles.iconOnly,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderWidth: colors.borderWidth,
        },
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      accessibilityLabel={props.accessibilityLabel || label}
    >
      <View style={styles.content}>
        {/* Loading replaces the left icon with a spinner */}
        {loading ? (
          <ActivityIndicator
            color={colors.text}
            size="small"
            style={!iconOnly ? styles.leftIcon : undefined}
          />
        ) : (
          leftIcon && (
            <Icon
              name={leftIcon}
              size={glyphSize}
              color={colors.text}
              style={!iconOnly ? styles.leftIcon : undefined}
            />
          )
        )}

        {/* Label (hidden for icon-only buttons) */}
        {!iconOnly && (
          <Text style={labelStyle} numberOfLines={2}>
            {label}
          </Text>
        )}

        {rightIcon && !loading && (
          <Icon
            name={rightIcon}
            size={glyphSize}
            color={colors.text}
            style={!iconOnly ? styles.rightIcon : undefined}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// LEGACY BUTTON COMPONENTS (For backwards compatibility)
// ============================================================================

/**
 * Primary Button - Use for main actions
 * @deprecated Use Button with type="primary" instead
 */
export function PrimaryButton({
  children,
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  size: _legacySize, // Ignored - kept for backwards compatibility
  ...props
}: BaseButtonProps) {
  return (
    <Button
      type="primary"
      variant="tint"
      size={fullWidth ? 'fullWidth' : 'auto'}
      loading={loading}
      disabled={disabled}
      style={style}
      textStyle={textStyle}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * Secondary Button - Use for secondary actions
 * @deprecated Use Button with type="secondary" instead
 */
export function SecondaryButton({
  children,
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  size: _legacySize, // Ignored - kept for backwards compatibility
  ...props
}: BaseButtonProps) {
  return (
    <Button
      type="secondary"
      variant="tint"
      size={fullWidth ? 'fullWidth' : 'auto'}
      loading={loading}
      disabled={disabled}
      style={style}
      textStyle={textStyle}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * Ghost Button - Use for tertiary actions
 * @deprecated Use Button with type="tertiary" instead
 */
export function GhostButton({
  children,
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  size: _legacySize, // Ignored - kept for backwards compatibility
  ...props
}: BaseButtonProps) {
  return (
    <Button
      type="tertiary"
      variant="tint"
      size={fullWidth ? 'fullWidth' : 'auto'}
      loading={loading}
      disabled={disabled}
      style={style}
      textStyle={textStyle}
      {...props}
    >
      {children}
    </Button>
  );
}

// ============================================================================
// STYLES (SAP Fiori Button)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sizeAuto: {
    minHeight: touchTarget,
    minWidth: MIN_WIDTH,
  },
  sizeCompact: {
    minHeight: HEIGHT_COMPACT,
    minWidth: MIN_WIDTH,
    paddingHorizontal: space.md,
  },
  sizeStandalone: {
    minHeight: HEIGHT_STANDALONE,
    minWidth: STANDALONE_MIN_WIDTH,
  },
  sizeFullWidth: {
    minHeight: HEIGHT_STANDALONE,
    width: '100%' as const,
  },
  iconOnly: {
    minWidth: touchTarget,
    paddingHorizontal: space.sm,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  text: {
    ...typography.callout,
    textAlign: 'center' as const,
    flexShrink: 1,
  },
  textEmphasized: {
    fontWeight: fontWeight.semibold,
  },
  textTertiary: {
    fontWeight: fontWeight.medium,
  },
  leftIcon: {
    marginRight: space.sm,
  },
  rightIcon: {
    marginLeft: space.sm,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  Primary: PrimaryButton,
  Secondary: SecondaryButton,
  Ghost: GhostButton,
  Button,
};
