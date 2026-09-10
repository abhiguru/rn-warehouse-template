/**
 * GCS Mobile App - Button Components
 *
 * SAP Fiori Button implementation
 * @see design/sap-fiori-specs/08-button.md
 *
 * Button Types:
 * - Primary: Most important action (filled, one per view)
 * - Secondary: Optional/lower priority actions (outlined)
 * - Tertiary: Lowest priority (text only)
 *
 * Button Styles:
 * - Tint: Primary color (default for Primary, optional for Secondary/Tertiary)
 * - Normal: Neutral color (for Secondary/Tertiary)
 * - Negative: Destructive actions (red, for Secondary/Tertiary)
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/theme';
import { triggerLightTap } from '@/hooks/useHaptics';

// ============================================================================
// FIORI BUTTON CONSTANTS
// ============================================================================

const FIORI_DIMENSIONS = {
  // Typography
  fontSize: 17,
  fontWeightSemibold: '600' as const,
  fontWeightRegular: '400' as const,
  letterSpacing: -0.41,

  // Dimensions
  heightStandard: 44,
  heightCompact: 38,
  minWidth: 64,
  standaloneWidth: 201,
  horizontalPadding: 16,
  verticalPadding: 11,
  iconTextGap: 8,
  borderRadius: 8,
  borderWidth: 1,

  // Disabled opacity
  disabledOpacity: 0.3,
};

/**
 * Generate theme-aware FIORI colors
 */
function getFioriColors(colors: Colors, isDarkMode: boolean) {
  return {
    // Colors - Primary Tint
    primaryBackground: colors.primary,
    primaryBackgroundPressed: colors.orange[600],
    primaryText: isDarkMode ? colors.gray[900] : '#FFFFFF',

    // Colors - Secondary Tint (outlined)
    secondaryTintBackground: 'transparent',
    secondaryTintBackgroundPressed: colors.orange[50],
    secondaryTintText: colors.primary,
    secondaryTintTextPressed: colors.orange[600],
    secondaryTintBorder: colors.primary,
    secondaryTintBorderPressed: colors.orange[600],

    // Colors - Secondary Normal (neutral outlined)
    secondaryNormalBackground: 'transparent',
    secondaryNormalBackgroundPressed: colors.gray[100],
    secondaryNormalText: colors.fiori.text.primary,
    secondaryNormalBorder: colors.gray[200],
    secondaryNormalBorderPressed: colors.gray[300],

    // Colors - Secondary Negative (destructive)
    secondaryNegativeBackground: 'transparent',
    secondaryNegativeBackgroundPressed: colors.red[50],
    secondaryNegativeText: colors.fiori.semantic.negative,
    secondaryNegativeTextPressed: colors.fiori.semantic.negativeDark,
    secondaryNegativeBorder: colors.fiori.semantic.negative,
    secondaryNegativeBorderPressed: colors.fiori.semantic.negativeDark,

    // Colors - Tertiary Tint
    tertiaryTintText: colors.primary,
    tertiaryTintTextPressed: colors.orange[600],
    tertiaryTintBackgroundPressed: colors.orange[50],

    // Colors - Tertiary Normal
    tertiaryNormalText: colors.gray[700],
    tertiaryNormalBackgroundPressed: colors.gray[100],

    // Colors - Tertiary Negative
    tertiaryNegativeText: colors.fiori.semantic.negative,
    tertiaryNegativeTextPressed: colors.fiori.semantic.negativeDark,
    tertiaryNegativeBackgroundPressed: colors.red[50],
  };
}

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
  /** Left icon name (Ionicons) */
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Right icon name (Ionicons) */
  rightIcon?: keyof typeof Ionicons.glyphMap;
  /** Icon-only button (no text) */
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
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors, isDarkMode);

  const isDisabled = disabled || loading;

  // Get colors based on type, variant, and state
  const getColors = () => {
    const pressed = isPressed && !isDisabled;

    // Primary button (always tint style)
    if (type === 'primary') {
      return {
        background: pressed ? FIORI.primaryBackgroundPressed : FIORI.primaryBackground,
        text: FIORI.primaryText,
        border: 'transparent',
        borderWidth: 0,
      };
    }

    // Secondary button
    if (type === 'secondary') {
      if (variant === 'tint') {
        return {
          background: pressed ? FIORI.secondaryTintBackgroundPressed : FIORI.secondaryTintBackground,
          text: pressed ? FIORI.secondaryTintTextPressed : FIORI.secondaryTintText,
          border: pressed ? FIORI.secondaryTintBorderPressed : FIORI.secondaryTintBorder,
          borderWidth: FIORI_DIMENSIONS.borderWidth,
        };
      }
      if (variant === 'negative') {
        return {
          background: pressed ? FIORI.secondaryNegativeBackgroundPressed : FIORI.secondaryNegativeBackground,
          text: pressed ? FIORI.secondaryNegativeTextPressed : FIORI.secondaryNegativeText,
          border: pressed ? FIORI.secondaryNegativeBorderPressed : FIORI.secondaryNegativeBorder,
          borderWidth: FIORI_DIMENSIONS.borderWidth,
        };
      }
      // normal
      return {
        background: pressed ? FIORI.secondaryNormalBackgroundPressed : FIORI.secondaryNormalBackground,
        text: FIORI.secondaryNormalText,
        border: pressed ? FIORI.secondaryNormalBorderPressed : FIORI.secondaryNormalBorder,
        borderWidth: FIORI_DIMENSIONS.borderWidth,
      };
    }

    // Tertiary button
    if (variant === 'tint') {
      return {
        background: pressed ? FIORI.tertiaryTintBackgroundPressed : 'transparent',
        text: pressed ? FIORI.tertiaryTintTextPressed : FIORI.tertiaryTintText,
        border: 'transparent',
        borderWidth: 0,
      };
    }
    if (variant === 'negative') {
      return {
        background: pressed ? FIORI.tertiaryNegativeBackgroundPressed : 'transparent',
        text: pressed ? FIORI.tertiaryNegativeTextPressed : FIORI.tertiaryNegativeText,
        border: 'transparent',
        borderWidth: 0,
      };
    }
    // normal
    return {
      background: pressed ? FIORI.tertiaryNormalBackgroundPressed : 'transparent',
      text: FIORI.tertiaryNormalText,
      border: 'transparent',
      borderWidth: 0,
    };
  };

  const colors = getColors();

  // Get container size styles
  const getSizeStyles = (): ViewStyle => {
    const baseHeight = size === 'compact' ? FIORI_DIMENSIONS.heightCompact : FIORI_DIMENSIONS.heightStandard;

    switch (size) {
      case 'standalone':
        return {
          width: FIORI_DIMENSIONS.standaloneWidth,
          height: baseHeight,
        };
      case 'fullWidth':
        return {
          width: '100%',
          height: baseHeight,
        };
      case 'compact':
        return {
          height: FIORI_DIMENSIONS.heightCompact,
          minWidth: FIORI_DIMENSIONS.minWidth,
        };
      case 'auto':
      default:
        return {
          height: baseHeight,
          minWidth: FIORI_DIMENSIONS.minWidth,
        };
    }
  };

  // Font weight based on type
  const getFontWeight = () => {
    return type === 'tertiary' ? FIORI_DIMENSIONS.fontWeightRegular : FIORI_DIMENSIONS.fontWeightSemibold;
  };

  // Icon size based on button type
  const getIconSize = () => {
    return iconOnly ? 24 : 20;
  };

  return (
    <TouchableOpacity
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
        type !== 'tertiary' && styles.containerWithShadow,
        getSizeStyles(),
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
      accessibilityLabel={props.accessibilityLabel || children}
      accessibilityHint={
        props.accessibilityHint ||
        (type === 'primary' ? 'Primary action' : undefined)
      }
    >
      {/* Content */}
      <View style={styles.content}>
        {/* Loading state */}
        {loading ? (
          <>
            <ActivityIndicator
              color={colors.text}
              size="small"
              style={loadingText ? styles.loadingIcon : undefined}
            />
            {loadingText && (
              <Text
                style={[
                  styles.text,
                  { color: colors.text, fontWeight: getFontWeight() },
                  textStyle,
                ]}
              >
                {loadingText}
              </Text>
            )}
          </>
        ) : (
          <>
            {/* Left icon */}
            {leftIcon && (
              <Ionicons
                name={leftIcon}
                size={getIconSize()}
                color={colors.text}
                style={!iconOnly ? styles.leftIcon : undefined}
              />
            )}

            {/* Text (hidden for icon-only buttons) */}
            {!iconOnly && (
              <Text
                style={[
                  styles.text,
                  { color: colors.text, fontWeight: getFontWeight() },
                  textStyle,
                ]}
                numberOfLines={1}
              >
                {children}
              </Text>
            )}

            {/* Right icon */}
            {rightIcon && (
              <Ionicons
                name={rightIcon}
                size={getIconSize()}
                color={colors.text}
                style={!iconOnly ? styles.rightIcon : undefined}
              />
            )}
          </>
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

const styles = StyleSheet.create({
  // Container
  container: {
    borderRadius: FIORI_DIMENSIONS.borderRadius,
    paddingHorizontal: FIORI_DIMENSIONS.horizontalPadding,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Container with shadow (for primary/secondary only)
  containerWithShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },

  // Disabled state
  disabled: {
    opacity: FIORI_DIMENSIONS.disabledOpacity,
  },

  // Content container
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Text
  text: {
    fontSize: FIORI_DIMENSIONS.fontSize,
    letterSpacing: FIORI_DIMENSIONS.letterSpacing,
    textAlign: 'center',
  },

  // Icons
  leftIcon: {
    marginRight: FIORI_DIMENSIONS.iconTextGap,
  },
  rightIcon: {
    marginLeft: FIORI_DIMENSIONS.iconTextGap,
  },
  loadingIcon: {
    marginRight: FIORI_DIMENSIONS.iconTextGap,
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
