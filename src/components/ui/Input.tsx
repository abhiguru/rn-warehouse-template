/**
 * GCS Mobile App - Input Component
 *
 * SAP Fiori Form Cell implementation
 * @see design/sap-fiori-specs/06-text-input-form-cell.md
 *
 * Features:
 * - Label above field (Capital Case)
 * - Required asterisk indicator
 * - Helper text / Error message (mutually exclusive)
 * - Character counter support
 * - Clear button during active typing
 * - Read-only and disabled states
 * - 44pt minimum touch target
 */

import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme, { Colors } from '@/theme';
import { useTheme } from '@/hooks/useTheme';

// ============================================================================
// FIORI FORM CELL CONSTANTS
// ============================================================================

const FIORI_DIMENSIONS = {
  // Typography
  labelFontSize: 13,
  labelLineHeight: 18,
  inputFontSize: Platform.OS === 'ios' ? 17 : 16,
  inputLineHeight: 22,
  helperFontSize: 13,
  helperLineHeight: 18,

  // Dimensions
  minHeight: 44,
  inputPaddingHorizontal: 12,
  inputPaddingVertical: 8,
  iconSize: 20,
  clearButtonSize: 18,

  // Border widths
  borderWidthDefault: 1,
  borderWidthActive: 2,
};

/**
 * Generate theme-aware FIORI colors for Input
 */
function getFioriColors(colors: Colors) {
  return {
    // Colors
    labelColor: colors.fiori.text.primary,
    inputTextColor: colors.fiori.text.primary,
    placeholderColor: colors.fiori.text.secondary,
    helperColor: colors.fiori.text.secondary,
    iconColor: colors.gray[500],

    // Border colors
    borderDefault: colors.fiori.objectCell.divider,
    borderActive: colors.fiori.semantic.neutral,
    borderError: colors.fiori.semantic.negative,

    // Background colors
    backgroundDefault: colors.fiori.objectCell.background,
    backgroundReadOnly: colors.gray[100],
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface InputProps extends TextInputProps {
  /** Input label (displayed in Capital Case) */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message (overrides helperText per Fiori spec) */
  error?: string;
  /** Custom container style */
  containerStyle?: ViewStyle;
  /** Custom input style */
  inputStyle?: TextStyle;
  /** Left icon element */
  leftIcon?: React.ReactNode;
  /** Right icon element (e.g., scan button) */
  rightIcon?: React.ReactNode;
  /** Show required asterisk */
  required?: boolean;
  /** Maximum character count (enables character counter) */
  maxLength?: number;
  /** Show character counter */
  showCharacterCount?: boolean;
  /** Read-only mode (can copy but not edit) */
  readOnly?: boolean;
  /** Show clear button when typing */
  showClearButton?: boolean;
}

// ============================================================================
// INPUT COMPONENT
// ============================================================================

export function Input({
  label,
  helperText,
  error,
  containerStyle,
  inputStyle,
  leftIcon,
  rightIcon,
  required = false,
  maxLength,
  showCharacterCount = false,
  readOnly = false,
  showClearButton = true,
  value,
  onChangeText,
  editable = true,
  ...textInputProps
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(value || '');
  const inputRef = useRef<TextInput>(null);
  const { colors: themeColors } = useTheme();
  const FIORI = getFioriColors(themeColors);

  const hasError = Boolean(error);
  const isDisabled = editable === false && !readOnly;
  const isReadOnly = readOnly;
  const currentValue = value !== undefined ? String(value) : internalValue;
  const hasValue = currentValue.length > 0;
  const isOverLimit = maxLength ? currentValue.length > maxLength : false;

  // Handle text change
  const handleChangeText = (text: string) => {
    setInternalValue(text);
    onChangeText?.(text);
  };

  // Handle clear button press
  const handleClear = () => {
    handleChangeText('');
    inputRef.current?.focus();
  };

  // Determine border color based on state (Fiori spec)
  const getBorderColor = () => {
    if (hasError || isOverLimit) return FIORI.borderError;
    if (isFocused) return FIORI.borderActive;
    if (isReadOnly) return 'transparent';
    return FIORI.borderDefault;
  };

  // Determine border width based on state
  const getBorderWidth = () => {
    if (hasError || isOverLimit || isFocused) return FIORI_DIMENSIONS.borderWidthActive;
    if (isReadOnly) return 0;
    return FIORI_DIMENSIONS.borderWidthDefault;
  };

  // Determine background color based on state
  const getBackgroundColor = () => {
    if (isReadOnly) return FIORI.backgroundReadOnly;
    return FIORI.backgroundDefault;
  };

  // Get message text and color (error overrides helper per Fiori spec)
  const getMessage = () => {
    // Error state
    if (error) {
      return { text: error, color: FIORI.borderError, isError: true };
    }
    // Over character limit
    if (isOverLimit) {
      return {
        text: 'Reduce the number of characters',
        color: FIORI.borderError,
        isError: true,
      };
    }
    // Read-only state
    if (isReadOnly) {
      return { text: 'Read-only field', color: FIORI.helperColor, isError: false };
    }
    // Helper text
    if (helperText) {
      return { text: helperText, color: FIORI.helperColor, isError: false };
    }
    return null;
  };

  const message = getMessage();

  // Character counter display
  const getCharacterCount = () => {
    if (!showCharacterCount || !maxLength) return null;
    const count = currentValue.length;
    const isOver = count > maxLength;
    return {
      text: `${count}/${maxLength}`,
      color: isOver ? FIORI.borderError : FIORI.helperColor,
    };
  };

  const characterCount = getCharacterCount();

  // Show clear button when typing and has value
  const shouldShowClear = showClearButton && isFocused && hasValue && !isReadOnly && !isDisabled;

  return (
    <View
      style={[
        styles.container,
        isDisabled && styles.containerDisabled,
        containerStyle,
      ]}
    >
      {/* Label */}
      {label && (
        <Text
          style={[
            styles.label,
            { color: FIORI.labelColor },
            isDisabled && styles.labelDisabled,
            isDisabled && { color: FIORI.helperColor },
          ]}
        >
          {label}
          {required && <Text style={[styles.required, { color: FIORI.borderError }]}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            borderWidth: getBorderWidth(),
            backgroundColor: getBackgroundColor(),
          },
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        <TextInput
          ref={inputRef}
          {...textInputProps}
          value={currentValue}
          onChangeText={handleChangeText}
          editable={!isReadOnly && editable}
          selectTextOnFocus={isReadOnly}
          style={[
            styles.input,
            { color: FIORI.inputTextColor },
            isDisabled && styles.inputDisabled,
            isDisabled && { color: FIORI.helperColor },
            inputStyle,
          ]}
          placeholderTextColor={FIORI.placeholderColor}
          accessibilityLabel={
            label
              ? `${label}${required ? ', required' : ', optional'}`
              : textInputProps.placeholder
          }
          accessibilityHint={
            textInputProps.accessibilityHint ||
            (label ? `Enter ${label.toLowerCase()}` : undefined)
          }
          accessibilityState={{
            disabled: isDisabled,
          }}
          onFocus={(e) => {
            setIsFocused(true);
            textInputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            textInputProps.onBlur?.(e);
          }}
        />

        {/* Clear button (Fiori: appears during active typing) */}
        {shouldShowClear && (
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            accessibilityLabel={`Clear ${label || 'input'}`}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={[styles.clearButtonInner, { backgroundColor: FIORI.iconColor }]}>
              <Ionicons
                name="close"
                size={14}
                color={FIORI.backgroundDefault}
              />
            </View>
          </Pressable>
        )}

        {/* Error icon (Fiori: red ! icon when error) */}
        {(hasError || isOverLimit) && !shouldShowClear && (
          <View style={styles.errorIcon}>
            <Ionicons
              name="alert-circle"
              size={FIORI_DIMENSIONS.iconSize}
              color={FIORI.borderError}
            />
          </View>
        )}

        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>

      {/* Footer Row: Helper/Error Text + Character Counter */}
      <View style={styles.footerRow}>
        {/* Helper Text / Error Message (mutually exclusive per Fiori spec) */}
        {message && (
          <Text
            style={[
              styles.helperText,
              { color: message.color },
              message.isError && styles.errorText,
            ]}
          >
            {message.text}
          </Text>
        )}

        {/* Spacer */}
        <View style={styles.footerSpacer} />

        {/* Character Counter */}
        {characterCount && (
          <Text
            style={[
              styles.characterCount,
              { color: characterCount.color },
            ]}
          >
            {characterCount.text}
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// INPUT VARIANTS
// ============================================================================

/**
 * Password Input - Convenience wrapper with secure text entry
 */
export function PasswordInput(props: Omit<InputProps, 'secureTextEntry'>) {
  return <Input {...props} secureTextEntry />;
}

/**
 * Phone Input - Convenience wrapper with phone keyboard
 */
export function PhoneInput(props: InputProps) {
  return <Input {...props} keyboardType="phone-pad" />;
}

/**
 * Email Input - Convenience wrapper with email keyboard
 */
export function EmailInput(props: InputProps) {
  return (
    <Input
      {...props}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

/**
 * Number Input - Convenience wrapper with numeric keyboard
 */
export function NumberInput(props: InputProps) {
  return <Input {...props} keyboardType="numeric" />;
}

/**
 * Search Input - Styled for search with icon
 */
export function SearchInput(props: InputProps) {
  return (
    <Input
      {...props}
      placeholder={props.placeholder || 'Search...'}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  );
}

// ============================================================================
// STYLES (SAP Fiori Form Cell)
// ============================================================================

const styles = StyleSheet.create({
  // Container
  container: {
    marginBottom: theme.spacing.md,
  },
  containerDisabled: {
    opacity: 0.5, // Fiori: 50% opacity for disabled state
  },

  // Label (Fiori: 13pt, Capital Case)
  label: {
    fontSize: FIORI_DIMENSIONS.labelFontSize,
    lineHeight: FIORI_DIMENSIONS.labelLineHeight,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.fiori.text.primary,
    marginBottom: 4,
  },
  labelDisabled: {
    color: theme.colors.fiori.text.secondary,
  },
  required: {
    color: theme.colors.fiori.semantic.negative,
  },

  // Input Container (Fiori: 44pt min height, rounded corners)
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8, // Fiori uses 8pt radius
    minHeight: FIORI_DIMENSIONS.minHeight,
    paddingHorizontal: FIORI_DIMENSIONS.inputPaddingHorizontal,
  },

  // Input Field (Fiori: 17pt iOS, 16pt Android)
  input: {
    flex: 1,
    fontSize: FIORI_DIMENSIONS.inputFontSize,
    color: theme.colors.fiori.text.primary,
    paddingVertical: FIORI_DIMENSIONS.inputPaddingVertical,
    paddingHorizontal: 0, // Remove default padding
    ...Platform.select({
      ios: {
        lineHeight: FIORI_DIMENSIONS.inputLineHeight,
      },
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
      },
    }),
  },
  inputDisabled: {
    color: theme.colors.fiori.text.secondary,
  },

  // Icons
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  rightIcon: {
    marginLeft: theme.spacing.sm,
  },

  // Clear button (Fiori: circular gray background with × icon)
  clearButton: {
    marginLeft: theme.spacing.sm,
    padding: 2,
  },
  clearButtonInner: {
    width: FIORI_DIMENSIONS.clearButtonSize,
    height: FIORI_DIMENSIONS.clearButtonSize,
    borderRadius: FIORI_DIMENSIONS.clearButtonSize / 2,
    backgroundColor: theme.colors.gray[500],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error icon
  errorIcon: {
    marginLeft: theme.spacing.sm,
  },

  // Footer Row (Helper/Error + Character Counter)
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    minHeight: FIORI_DIMENSIONS.helperLineHeight,
  },

  // Helper Text (Fiori: 13pt, sentence case)
  helperText: {
    fontSize: FIORI_DIMENSIONS.helperFontSize,
    lineHeight: FIORI_DIMENSIONS.helperLineHeight,
    color: theme.colors.fiori.text.secondary,
    flex: 1,
  },
  errorText: {
    color: theme.colors.fiori.semantic.negative,
  },

  // Spacer (only used to push character count to the right)
  footerSpacer: {
    width: 8,
  },

  // Character Counter (Fiori: right-aligned)
  characterCount: {
    fontSize: FIORI_DIMENSIONS.helperFontSize,
    lineHeight: FIORI_DIMENSIONS.helperLineHeight,
    color: theme.colors.fiori.text.secondary,
    textAlign: 'right',
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Input;
