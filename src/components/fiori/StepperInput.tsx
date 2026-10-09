/**
 * SAP Fiori stepper form cell (docs/STYLE_GUIDE.md §13.3).
 *
 * Minus and plus buttons outlined in border.button with brand.tint icons; the
 * value in body with tabular numbers; the buttons disable at min and max.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Keyboard,
  Insets,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

/** Visual size of the minus/plus buttons; the touch area is padded to touchTarget. */
const BUTTON_SIZE = 36;
const VALUE_MIN_WIDTH = 80;
const BUTTON_HIT_SLOP: Insets = {
  top: (touchTarget - BUTTON_SIZE) / 2,
  bottom: (touchTarget - BUTTON_SIZE) / 2,
};

interface StepperInputProps {
  label?: string;
  value: number;
  onValueChange: (value: number) => void;
  helperText?: string;
  errorText?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
  layout?: 'stacked' | 'inline' | 'compact';
  showButtons?: boolean;
}

export const StepperInput: React.FC<StepperInputProps> = ({
  label,
  value,
  onValueChange,
  helperText,
  errorText,
  min = 0,
  max = Infinity,
  step = 1,
  disabled = false,
  decimalPlaces = 0,
  prefix,
  suffix,
  layout = 'stacked',
  showButtons = true,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toFixed(decimalPlaces));
  const inputRef = useRef<TextInput>(null);
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const canDecrement = value > min && !disabled;
  const canIncrement = value < max && !disabled;
  const hasError = !!errorText;

  const handleDecrement = () => {
    if (canDecrement) {
      const newValue = Math.max(min, value - step);
      onValueChange(Number(newValue.toFixed(decimalPlaces)));
    }
  };

  const handleIncrement = () => {
    if (canIncrement) {
      const newValue = Math.min(max, value + step);
      onValueChange(Number(newValue.toFixed(decimalPlaces)));
    }
  };

  const handleValuePress = () => {
    if (!disabled) {
      setInputValue(value > 0 ? value.toFixed(decimalPlaces) : '');
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleInputChange = (text: string) => {
    // Allow empty, numbers, and decimal point
    const sanitized = text.replace(/[^0-9.]/g, '');
    setInputValue(sanitized);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onValueChange(Number(clamped.toFixed(decimalPlaces)));
    } else {
      // Reset to current value if invalid
      setInputValue(value > 0 ? value.toFixed(decimalPlaces) : '');
    }
    Keyboard.dismiss();
  };

  const isCompact = layout === 'compact';
  const isInline = layout === 'inline';

  // Compact layout - just the stepper without label
  if (isCompact) {
    return (
      <View style={[styles.compactContainer, disabled && styles.disabled]}>
        <View style={[styles.stepper, hasError && styles.stepperError]}>
          {showButtons && (
            <Pressable
              style={({ pressed }) => [styles.button, styles.buttonLeft, pressed && styles.buttonPressed, !canDecrement && styles.buttonDisabled]}
              onPress={handleDecrement}
              disabled={!canDecrement}
              hitSlop={BUTTON_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={label ? `Decrease ${label.toLowerCase()}` : 'Decrease'}
              accessibilityState={{ disabled: !canDecrement }}
            >
              <Icon name="minus" size={iconSize.md} color={t.brand.tint} />
            </Pressable>
          )}
          <Pressable
            style={styles.valueContainer}
            onPress={handleValuePress}
            disabled={disabled}
            hitSlop={BUTTON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`${label ?? 'Value'}, ${prefix ?? ''}${value > 0 ? value.toFixed(decimalPlaces) : '0'}${suffix ?? ''}`}
            accessibilityHint="Opens the keyboard to type a value"
          >
            {isEditing ? (
              <TextInput
                ref={inputRef}
                style={styles.valueInput}
                value={inputValue}
                onChangeText={handleInputChange}
                onBlur={handleInputBlur}
                keyboardType="decimal-pad"
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={handleInputBlur}
                accessibilityLabel={label}
              />
            ) : (
              <Text style={[styles.valueText, disabled && styles.valueTextDisabled]}>
                {prefix}{value > 0 ? value.toFixed(decimalPlaces) : '0'}{suffix}
              </Text>
            )}
          </Pressable>
          {showButtons && (
            <Pressable
              style={({ pressed }) => [styles.button, styles.buttonRight, pressed && styles.buttonPressed, !canIncrement && styles.buttonDisabled]}
              onPress={handleIncrement}
              disabled={!canIncrement}
              hitSlop={BUTTON_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={label ? `Increase ${label.toLowerCase()}` : 'Increase'}
              accessibilityState={{ disabled: !canIncrement }}
            >
              <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={[styles.labelRow, isInline && styles.labelRowInline]}>
        <View style={styles.labelContainer}>
          {label && (
            <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
          )}
          {helperText && !isInline && !hasError && (
            <Text style={styles.helperText}>{helperText}</Text>
          )}
          {errorText && !isInline && (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} style={styles.errorIcon} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}
        </View>
        {isInline && (
          <View style={styles.stepperInline}>
            {renderStepper()}
          </View>
        )}
      </View>
      {!isInline && renderStepper()}
      {helperText && isInline && !hasError && (
        <Text style={styles.helperText}>{helperText}</Text>
      )}
      {errorText && isInline && (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} style={styles.errorIcon} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      )}
    </View>
  );

  function renderStepper() {
    return (
      <View style={[styles.stepper, isEditing && styles.stepperFocused, hasError && styles.stepperError]}>
        {showButtons && (
          <Pressable
            style={({ pressed }) => [styles.button, styles.buttonLeft, pressed && styles.buttonPressed, !canDecrement && styles.buttonDisabled]}
            onPress={handleDecrement}
            disabled={!canDecrement}
            hitSlop={BUTTON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={label ? `Decrease ${label.toLowerCase()}` : 'Decrease'}
            accessibilityState={{ disabled: !canDecrement }}
          >
            <Icon name="minus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        )}
        <Pressable
          style={styles.valueContainer}
          onPress={handleValuePress}
          disabled={disabled}
          hitSlop={BUTTON_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${label ?? 'Value'}, ${prefix ?? ''}${value > 0 ? value.toFixed(decimalPlaces) : '0'}${suffix ?? ''}`}
          accessibilityHint="Opens the keyboard to type a value"
        >
          {isEditing ? (
            <TextInput
              ref={inputRef}
              style={styles.valueInput}
              value={inputValue}
              onChangeText={handleInputChange}
              onBlur={handleInputBlur}
              keyboardType="decimal-pad"
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleInputBlur}
              accessibilityLabel={label}
            />
          ) : (
            <Text style={[styles.valueText, disabled && styles.valueTextDisabled]}>
              {prefix}{value > 0 ? value.toFixed(decimalPlaces) : '0'}{suffix}
            </Text>
          )}
        </Pressable>
        {showButtons && (
          <Pressable
            style={({ pressed }) => [styles.button, styles.buttonRight, pressed && styles.buttonPressed, !canIncrement && styles.buttonDisabled]}
            onPress={handleIncrement}
            disabled={!canIncrement}
            hitSlop={BUTTON_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={label ? `Increase ${label.toLowerCase()}` : 'Increase'}
            accessibilityState={{ disabled: !canIncrement }}
          >
            <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        )}
      </View>
    );
  }
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.lg,
  },
  compactContainer: {
    // No margin for compact
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  labelRow: {
    marginBottom: space.sm,
  },
  labelRowInline: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 0,
  },
  labelContainer: {
    flex: 1,
  },
  // Form-cell label
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  labelDisabled: {
    color: t.text.disabled,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  errorIcon: {
    marginRight: space.xs,
    marginTop: 1,
  },
  errorText: {
    ...typography.footnote,
    color: t.status.negative.text,
    flex: 1,
  },
  stepperInline: {
    marginLeft: space.md,
  },
  // Stepper container: outlined, rounded
  stepper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.button,
    borderRadius: radius.button,
    backgroundColor: t.surface.field,
    overflow: 'hidden' as const,
    alignSelf: 'flex-start' as const,
  },
  stepperFocused: {
    borderColor: t.border.fieldFocus,
    borderWidth: 2,
  },
  stepperError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
  },
  buttonPressed: {
    backgroundColor: t.brand.subtle,
  },
  buttonLeft: {
    borderRightWidth: 1,
    borderRightColor: t.border.button,
  },
  buttonRight: {
    borderLeftWidth: 1,
    borderLeftColor: t.border.button,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  valueContainer: {
    minWidth: VALUE_MIN_WIDTH,
    height: BUTTON_SIZE,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
  },
  valueText: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  valueTextDisabled: {
    color: t.text.disabled,
  },
  valueInput: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'center' as const,
    minWidth: 60,
    padding: 0,
    fontVariant: ['tabular-nums' as const],
  },
});

export default StepperInput;
