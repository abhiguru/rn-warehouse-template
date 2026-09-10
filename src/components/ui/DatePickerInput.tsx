/**
 * GCS Mobile App - Date Picker Input Component
 *
 * SAP Fiori Form Cell implementation for date/time selection
 * @see design/sap-fiori-specs/06-text-input-form-cell.md
 *
 * Features:
 * - Label above field (Capital Case) with required asterisk
 * - Helper text / Error message (mutually exclusive)
 * - Read-only and disabled states with Fiori styling
 * - 44pt minimum touch target
 * - Calendar/clock icon on right
 * - Platform-specific date picker (spinner on iOS, default on Android)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
  StyleProp,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import theme, { Colors } from '@/theme';
import { useTheme } from '@/hooks/useTheme';

// ============================================================================
// FIORI FORM CELL CONSTANTS (matching Input.tsx)
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

  // Border widths
  borderWidthDefault: 1,
  borderWidthActive: 2,
};

/**
 * Generate theme-aware FIORI colors for DatePickerInput
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

export interface DatePickerInputProps {
  /** Input label (displayed in Capital Case) */
  label?: string;
  /** Current date value */
  value: Date;
  /** Called when date changes */
  onChange: (date: Date) => void;
  /** Picker mode: date, time, or datetime */
  mode?: 'date' | 'time' | 'datetime';
  /** Disable interaction */
  disabled?: boolean;
  /** Show required asterisk */
  required?: boolean;
  /** Error message (overrides helperText per Fiori spec) */
  error?: string;
  /** Helper text below input */
  helperText?: string;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Minimum selectable date */
  minimumDate?: Date;
  /** Maximum selectable date */
  maximumDate?: Date;
  /** Read-only mode (can view but not edit) */
  readOnly?: boolean;
  /** Placeholder text when no date selected */
  placeholder?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  label,
  value,
  onChange,
  mode = 'date',
  disabled = false,
  required = false,
  error,
  helperText,
  style,
  minimumDate,
  maximumDate,
  readOnly = false,
  placeholder,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors);

  const hasError = Boolean(error);
  const isDisabled = disabled;
  const isReadOnly = readOnly;

  // Handle date picker change
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      setIsFocused(false);
    }

    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    }

    if (event.type === 'dismissed') {
      setShowPicker(false);
      setIsFocused(false);
    }
  };

  // Handle iOS picker confirm
  const handleIOSConfirm = () => {
    setShowPicker(false);
    setIsFocused(false);
  };

  // Handle iOS picker cancel
  const handleIOSCancel = () => {
    setShowPicker(false);
    setIsFocused(false);
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    if (mode === 'time') {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (mode === 'datetime') {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get appropriate icon based on mode
  const getIcon = (): 'calendar-outline' | 'time-outline' => {
    if (mode === 'time') return 'time-outline';
    return 'calendar-outline';
  };

  // Determine border color based on state (Fiori spec)
  const getBorderColor = () => {
    if (hasError) return FIORI.borderError;
    if (isFocused) return FIORI.borderActive;
    if (isReadOnly) return 'transparent';
    return FIORI.borderDefault;
  };

  // Determine border width based on state
  const getBorderWidth = () => {
    if (hasError || isFocused) return FIORI_DIMENSIONS.borderWidthActive;
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
    if (error) {
      return { text: error, color: FIORI.borderError, isError: true };
    }
    if (isReadOnly) {
      return { text: 'Read-only field', color: FIORI.helperColor, isError: false };
    }
    if (helperText) {
      return { text: helperText, color: FIORI.helperColor, isError: false };
    }
    return null;
  };

  const message = getMessage();

  // Handle press on input
  const handlePress = () => {
    if (!isDisabled && !isReadOnly) {
      setShowPicker(true);
      setIsFocused(true);
    }
  };

  return (
    <View
      style={[
        styles.container,
        isDisabled && styles.containerDisabled,
        style,
      ]}
    >
      {/* Label (Fiori: 13pt, Capital Case) */}
      {label && (
        <Text style={[styles.label, { color: FIORI.labelColor }, isDisabled && styles.labelDisabled, isDisabled && { color: FIORI.helperColor }]}>
          {label}
          {required && <Text style={[styles.required, { color: FIORI.borderError }]}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <Pressable
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            borderWidth: getBorderWidth(),
            backgroundColor: getBackgroundColor(),
          },
        ]}
        onPress={handlePress}
        disabled={isDisabled || isReadOnly}
        accessibilityLabel={
          label
            ? `${label}${required ? ', required' : ', optional'}`
            : 'Date picker'
        }
        accessibilityHint={`Current value: ${formatDate(value)}. Tap to change.`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: isDisabled,
        }}
      >
        <Text
          style={[
            styles.inputText,
            { color: FIORI.inputTextColor },
            isDisabled && styles.inputTextDisabled,
            isDisabled && { color: FIORI.helperColor },
            !value && placeholder && { color: FIORI.placeholderColor },
          ]}
        >
          {value ? formatDate(value) : placeholder || 'Select date'}
        </Text>

        {/* Calendar/Clock Icon */}
        <Ionicons
          name={getIcon()}
          size={FIORI_DIMENSIONS.iconSize}
          color={
            isDisabled
              ? FIORI.placeholderColor
              : hasError
                ? FIORI.borderError
                : FIORI.iconColor
          }
        />

        {/* Error Icon (Fiori: appears on error state) */}
        {hasError && (
          <Ionicons
            name="alert-circle"
            size={FIORI_DIMENSIONS.iconSize}
            color={FIORI.borderError}
            style={styles.errorIcon}
          />
        )}
      </Pressable>

      {/* Date Picker - Android (inline) */}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={value}
          mode={mode === 'datetime' ? 'date' : mode}
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          themeVariant={isDarkMode ? 'dark' : 'light'}
        />
      )}

      {/* Date Picker - iOS (Modal with spinner) */}
      {showPicker && Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="slide"
          visible={showPicker}
          onRequestClose={handleIOSCancel}
        >
          <Pressable style={styles.modalOverlay} onPress={handleIOSCancel}>
            <View style={[styles.modalContent, { backgroundColor: FIORI.backgroundDefault }]}>
              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomColor: FIORI.borderDefault }]}>
                <Pressable
                  onPress={handleIOSCancel}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.modalCancelText, { color: themeColors.primary }]}>Cancel</Text>
                </Pressable>
                <Text style={[styles.modalTitle, { color: FIORI.labelColor }]}>
                  {mode === 'time' ? 'Select Time' : 'Select Date'}
                </Text>
                <Pressable
                  onPress={handleIOSConfirm}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.modalDoneText, { color: themeColors.primary }]}>Done</Text>
                </Pressable>
              </View>

              {/* Picker */}
              <DateTimePicker
                value={value}
                mode={mode === 'datetime' ? 'date' : mode}
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                accentColor={themeColors.primary}
                themeVariant={isDarkMode ? 'dark' : 'light'}
                style={styles.iosPicker}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Footer: Helper/Error Text */}
      {message && (
        <View style={styles.footerRow}>
          <Text
            style={[
              styles.helperText,
              { color: message.color },
              message.isError && styles.errorText,
            ]}
          >
            {message.text}
          </Text>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES (SAP Fiori Form Cell - matching Input.tsx)
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
    gap: 8,
  },

  // Input Text (Fiori: 17pt iOS, 16pt Android)
  inputText: {
    flex: 1,
    fontSize: FIORI_DIMENSIONS.inputFontSize,
    lineHeight: FIORI_DIMENSIONS.inputLineHeight,
    color: theme.colors.fiori.text.primary,
  },
  inputTextDisabled: {
    color: theme.colors.fiori.text.secondary,
  },
  placeholderText: {
    color: theme.colors.fiori.text.secondary,
  },

  // Error Icon
  errorIcon: {
    marginLeft: 4,
  },

  // Footer Row
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

  // iOS Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.fiori.objectCell.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34, // Safe area for home indicator
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.fiori.objectCell.divider,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.fiori.text.primary,
  },
  modalCancelText: {
    fontSize: 17,
    color: theme.colors.primary,
  },
  modalDoneText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  iosPicker: {
    height: 216,
  },
});

export default DatePickerInput;
