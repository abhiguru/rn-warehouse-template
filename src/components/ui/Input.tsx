/**
 * SAP Fiori Form Cell implementation
 *
 * Features:
 * - Label above field (sentence case)
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
  ViewStyle,
  TextStyle,
  TextInputProps,
  Pressable,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { localizeDigits, t as tr } from '@/i18n';

/** Touch area padding that brings the 20 pt clear glyph up to the minimum target. */
const CLEAR_HIT_SLOP = (touchTarget - iconSize.md) / 2;

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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const hasError = Boolean(error);
  const isDisabled = editable === false && !readOnly;
  const isReadOnly = readOnly;
  const currentValue = value !== undefined ? String(value) : internalValue;
  const hasValue = currentValue.length > 0;
  const isOverLimit = maxLength ? currentValue.length > maxLength : false;
  const isInvalid = hasError || isOverLimit;

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

  // Field outline per state (style guide §13.2)
  const fieldStateStyle = isInvalid
    ? styles.fieldError
    : isFocused
      ? styles.fieldFocused
      : isReadOnly
        ? styles.fieldReadOnly
        : null;

  // Error overrides helper text
  const message: { text: string; isError: boolean } | null = error
    ? { text: error, isError: true }
    : isOverLimit
      ? { text: tr('components.input.tooLong', { max: localizeDigits(String(maxLength)) }), isError: true }
      : helperText
        ? { text: helperText, isError: false }
        : null;

  const characterCount =
    showCharacterCount && maxLength
      ? { text: localizeDigits(`${currentValue.length}/${maxLength}`), isOver: currentValue.length > maxLength }
      : null;

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
            isInvalid && styles.labelError,
            isDisabled && styles.textDisabled,
          ]}
        >
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      {/* Field */}
      <View style={[styles.inputContainer, fieldStateStyle]}>
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
            isDisabled && styles.textDisabled,
            inputStyle,
          ]}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={
            label
              ? required ? tr('components.input.requiredLabel', { label }) : label
              : textInputProps.accessibilityLabel ?? textInputProps.placeholder
          }
          accessibilityHint={
            textInputProps.accessibilityHint ??
            (isReadOnly ? tr('components.input.readOnly') : isInvalid && message ? message.text : undefined)
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

        {/* Clear button (appears while typing) */}
        {shouldShowClear && (
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            accessibilityLabel={label ? tr('components.input.clearLabel', { label: label.toLowerCase() }) : tr('components.input.clearText')}
            accessibilityRole="button"
            hitSlop={CLEAR_HIT_SLOP}
          >
            <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}

        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>

      {/* Footer row: helper or error text, and the character counter */}
      {(message || characterCount) && (
        <View style={styles.footerRow}>
          {message ? (
            <View style={styles.messageRow}>
              {message.isError && (
                <Icon
                  name="alert-circle"
                  size={iconSize.sm}
                  color={t.status.negative.text}
                  style={styles.messageIcon}
                />
              )}
              <Text
                style={[styles.helperText, message.isError && styles.errorText]}
                accessibilityLiveRegion={message.isError ? 'polite' : 'none'}
              >
                {message.text}
              </Text>
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )}

          {characterCount && (
            <Text style={[styles.characterCount, characterCount.isOver && styles.errorText]}>
              {characterCount.text}
            </Text>
          )}
        </View>
      )}
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
      placeholder={props.placeholder || tr('components.input.searchPlaceholder')}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  );
}

// ============================================================================
// STYLES (SAP Fiori form cell, style guide §13.2)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.lg,
  },
  containerDisabled: {
    opacity: t.interaction.disabledOpacity,
  },

  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  textDisabled: {
    color: t.text.disabled,
  },

  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.field,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  fieldFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
    paddingHorizontal: space.md - 1,
  },
  fieldReadOnly: {
    borderWidth: 0,
    backgroundColor: t.surface.fieldReadOnly,
    paddingHorizontal: space.md + 1,
  },

  input: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
    paddingHorizontal: 0,
    ...Platform.select({
      android: {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      },
      default: {},
    }),
  },

  leftIcon: {
    marginRight: space.sm,
  },
  rightIcon: {
    marginLeft: space.sm,
  },
  clearButton: {
    marginLeft: space.sm,
  },

  footerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
    gap: space.sm,
  },
  messageRow: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  messageIcon: {
    marginTop: 1,
    marginRight: space.xs,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    flex: 1,
  },
  errorText: {
    color: t.status.negative.text,
  },
  footerSpacer: {
    flex: 1,
  },
  characterCount: {
    ...typography.caption1,
    color: t.text.secondary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Input;
