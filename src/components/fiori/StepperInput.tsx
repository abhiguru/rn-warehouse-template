/**
 * SAP Fiori Stepper Form Cell
 * @see design/sap-fiori-specs/23-stepper-form-cell.md
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

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
            <TouchableOpacity
              style={[styles.button, styles.buttonLeft, !canDecrement && styles.buttonDisabled]}
              onPress={handleDecrement}
              disabled={!canDecrement}
              activeOpacity={0.7}
            >
              <Icon name="minus" size={18} color={canDecrement ? '#1D2D3E' : '#1D2D3E4D'} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.valueContainer}
            onPress={handleValuePress}
            disabled={disabled}
            activeOpacity={0.9}
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
              />
            ) : (
              <Text style={[styles.valueText, disabled && styles.valueTextDisabled]}>
                {prefix}{value > 0 ? value.toFixed(decimalPlaces) : '0'}{suffix}
              </Text>
            )}
          </TouchableOpacity>
          {showButtons && (
            <TouchableOpacity
              style={[styles.button, styles.buttonRight, !canIncrement && styles.buttonDisabled]}
              onPress={handleIncrement}
              disabled={!canIncrement}
              activeOpacity={0.7}
            >
              <Icon name="plus" size={18} color={canIncrement ? '#1D2D3E' : '#1D2D3E4D'} />
            </TouchableOpacity>
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
              <Icon name="alert-circle" size={14} color="#D32030" style={styles.errorIcon} />
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
          <Icon name="alert-circle" size={14} color="#D32030" style={styles.errorIcon} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      )}
    </View>
  );

  function renderStepper() {
    return (
      <View style={[styles.stepper, isEditing && styles.stepperFocused, hasError && styles.stepperError]}>
        {showButtons && (
          <TouchableOpacity
            style={[styles.button, styles.buttonLeft, !canDecrement && styles.buttonDisabled]}
            onPress={handleDecrement}
            disabled={!canDecrement}
            activeOpacity={0.7}
          >
            <Icon name="minus" size={20} color={canDecrement ? '#1D2D3E' : '#1D2D3E4D'} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.valueContainer}
          onPress={handleValuePress}
          disabled={disabled}
          activeOpacity={0.9}
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
            />
          ) : (
            <Text style={[styles.valueText, disabled && styles.valueTextDisabled]}>
              {prefix}{value > 0 ? value.toFixed(decimalPlaces) : '0'}{suffix}
            </Text>
          )}
        </TouchableOpacity>
        {showButtons && (
          <TouchableOpacity
            style={[styles.button, styles.buttonRight, !canIncrement && styles.buttonDisabled]}
            onPress={handleIncrement}
            disabled={!canIncrement}
            activeOpacity={0.7}
          >
            <Icon name="plus" size={20} color={canIncrement ? '#1D2D3E' : '#1D2D3E4D'} />
          </TouchableOpacity>
        )}
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  compactContainer: {
    // No margin for compact
  },
  disabled: {
    opacity: 0.5,
  },
  labelRow: {
    marginBottom: 8,
  },
  labelRowInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  labelContainer: {
    flex: 1,
  },
  // Fiori: Label - 13pt, primary text
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: '#1D2D3E',
    lineHeight: 18,
  },
  labelDisabled: {
    color: '#556B82',
  },
  // Fiori: Helper text - 13pt, secondary color
  helperText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#556B82',
    lineHeight: 18,
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  errorIcon: {
    marginRight: 4,
    marginTop: 1,
  },
  // Fiori: Error text - 13pt, negative color
  errorText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#D32030',
    lineHeight: 18,
    flex: 1,
  },
  stepperInline: {
    marginLeft: 12,
  },
  // Fiori: Stepper container - border, rounded
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  // Fiori: Focus state - blue border
  stepperFocused: {
    borderColor: '#0057D2',
    borderWidth: 2,
  },
  // Fiori: Error state - red border
  stepperError: {
    borderColor: '#D32030',
    borderWidth: 2,
  },
  // Fiori: Button - 36pt square, gray background
  button: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6F7',
  },
  buttonLeft: {
    borderRightWidth: 1,
    borderRightColor: '#E5E5E5',
  },
  buttonRight: {
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5E5',
  },
  buttonDisabled: {
    backgroundColor: '#F5F6F7',
  },
  // Fiori: Value container - 80pt min width
  valueContainer: {
    minWidth: 80,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: theme.colors.white,
  },
  // Fiori: Value text - 17pt, primary color
  valueText: {
    fontSize: theme.fontSize.base,
    fontWeight: '400',
    color: '#1D2D3E',
    lineHeight: 22,
    textAlign: 'center',
  },
  valueTextDisabled: {
    color: '#556B82',
  },
  valueInput: {
    fontSize: theme.fontSize.base,
    fontWeight: '400',
    color: '#1D2D3E',
    textAlign: 'center',
    minWidth: 60,
    padding: 0,
  },
});

export default StepperInput;
