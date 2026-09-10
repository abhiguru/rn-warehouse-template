/**
 * GCS Mobile App - Form Label Component
 *
 * SAP Fiori Form Cell Label implementation
 * @see design/sap-fiori-specs/06-text-input-form-cell.md
 *
 * Features:
 * - Capital Case text display
 * - Required asterisk indicator
 * - Error state styling
 * - Disabled state (50% opacity per Fiori spec)
 * - Read-only state
 * - Optional helper/hint text
 * - Consistent typography with Input component
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';

// ============================================================================
// FIORI FORM CELL CONSTANTS (matching Input.tsx)
// ============================================================================

const FIORI = {
  // Typography
  labelFontSize: 13,
  labelLineHeight: 18,
  helperFontSize: 13,
  helperLineHeight: 18,

  // Spacing
  labelMarginBottom: 4,
  helperMarginTop: 4,

  // Colors (matching SAP Fiori spec)
  labelColor: '#1D2D3E', // Fiori text primary
  labelColorSecondary: '#556B82', // Fiori text secondary (for read-only/disabled)
  errorColor: '#D32030', // Fiori negative (red)
  requiredColor: '#D32030', // Red asterisk

  // Opacity
  disabledOpacity: 0.5,
};

// ============================================================================
// TYPES
// ============================================================================

export interface FormLabelProps extends Omit<TextProps, 'children'> {
  /** Label text content */
  children: React.ReactNode;
  /** Show required asterisk */
  required?: boolean;
  /** Show in error state (red text) */
  error?: boolean;
  /** Show in disabled state (50% opacity) */
  disabled?: boolean;
  /** Show in read-only state (secondary color) */
  readOnly?: boolean;
  /** Additional text style */
  style?: StyleProp<TextStyle>;
  /** Container style (for wrapper View) */
  containerStyle?: StyleProp<ViewStyle>;
  /** Helper text displayed below label */
  helperText?: string;
  /** Size variant */
  size?: 'default' | 'small';
}

// ============================================================================
// FORM LABEL COMPONENT
// ============================================================================

export const FormLabel: React.FC<FormLabelProps> = ({
  children,
  required = false,
  error = false,
  disabled = false,
  readOnly = false,
  style,
  containerStyle,
  helperText,
  size = 'default',
  ...props
}) => {
  // Determine label color based on state (Fiori priority: error > disabled > readOnly > default)
  const getLabelColor = () => {
    if (error) return FIORI.errorColor;
    if (disabled || readOnly) return FIORI.labelColorSecondary;
    return FIORI.labelColor;
  };

  const labelStyle: TextStyle = {
    fontSize: size === 'small' ? 12 : FIORI.labelFontSize,
    lineHeight: size === 'small' ? 16 : FIORI.labelLineHeight,
    fontWeight: '500', // Medium weight per Fiori spec
    color: getLabelColor(),
    marginBottom: FIORI.labelMarginBottom,
    // Capital Case is handled by content, not style
  };

  const containerOpacity = disabled ? FIORI.disabledOpacity : 1;

  // Simple label without helper text
  if (!helperText) {
    return (
      <Text
        style={[
          labelStyle,
          { opacity: containerOpacity },
          style,
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${children}${required ? ', required field' : ', optional field'}`}
        {...props}
      >
        {children}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
    );
  }

  // Label with helper text (uses wrapper View)
  return (
    <View style={[{ opacity: containerOpacity }, containerStyle]}>
      <Text
        style={[labelStyle, style]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${children}${required ? ', required field' : ', optional field'}`}
        {...props}
      >
        {children}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
      <Text style={styles.helperText}>{helperText}</Text>
    </View>
  );
};

// ============================================================================
// FORM LABEL GROUP COMPONENT
// ============================================================================

export interface FormLabelGroupProps {
  /** Label text */
  label: string;
  /** Show required asterisk */
  required?: boolean;
  /** Error state */
  error?: boolean;
  /** Error message (displayed instead of helper text when in error) */
  errorMessage?: string;
  /** Helper text (displayed below label when not in error) */
  helperText?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Read-only state */
  readOnly?: boolean;
  /** Character count (current/max) */
  characterCount?: {
    current: number;
    max: number;
  };
  /** Container style */
  style?: StyleProp<ViewStyle>;
  /** Label style */
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * FormLabelGroup - Complete label section with helper/error text and character counter
 *
 * Use this when you need the full Fiori Form Cell label layout including:
 * - Main label with required indicator
 * - Helper text OR error message (mutually exclusive per Fiori spec)
 * - Optional character counter
 */
export const FormLabelGroup: React.FC<FormLabelGroupProps> = ({
  label,
  required = false,
  error = false,
  errorMessage,
  helperText,
  disabled = false,
  readOnly = false,
  characterCount,
  style,
  labelStyle,
}) => {
  const hasError = error || Boolean(errorMessage);
  const isOverLimit = characterCount
    ? characterCount.current > characterCount.max
    : false;

  // Determine which text to show below label (error takes priority per Fiori spec)
  const footerText = hasError ? errorMessage : helperText;
  const showFooter = Boolean(footerText) || Boolean(characterCount);

  return (
    <View style={[{ opacity: disabled ? FIORI.disabledOpacity : 1 }, style]}>
      {/* Label row */}
      <Text
        style={[
          styles.groupLabel,
          hasError && styles.groupLabelError,
          (disabled || readOnly) && styles.groupLabelSecondary,
          labelStyle,
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${label}${required ? ', required field' : ', optional field'}`}
      >
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>

      {/* Footer row (helper/error text + character counter) */}
      {showFooter && (
        <View style={styles.footerRow}>
          {/* Helper/Error text */}
          {footerText && (
            <Text
              style={[
                styles.footerText,
                hasError && styles.footerTextError,
              ]}
              accessible
              accessibilityRole="text"
              accessibilityLiveRegion={hasError ? 'assertive' : 'polite'}
            >
              {footerText}
            </Text>
          )}

          {/* Character counter */}
          {characterCount && (
            <Text
              style={[
                styles.characterCount,
                isOverLimit && styles.characterCountError,
              ]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${characterCount.current} of ${characterCount.max} characters`}
            >
              {characterCount.current}/{characterCount.max}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Required asterisk mark
  requiredMark: {
    color: FIORI.requiredColor,
    fontWeight: '600', // Semibold
    fontSize: FIORI.labelFontSize,
  },

  // Helper text below label
  helperText: {
    fontSize: FIORI.helperFontSize,
    lineHeight: FIORI.helperLineHeight,
    color: FIORI.labelColorSecondary,
    marginTop: FIORI.helperMarginTop,
  },

  // FormLabelGroup styles
  groupLabel: {
    fontSize: FIORI.labelFontSize,
    lineHeight: FIORI.labelLineHeight,
    fontWeight: '500',
    color: FIORI.labelColor,
    marginBottom: FIORI.labelMarginBottom,
  },
  groupLabelError: {
    color: FIORI.errorColor,
  },
  groupLabelSecondary: {
    color: FIORI.labelColorSecondary,
  },

  // Footer row (helper text + character counter)
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: FIORI.helperMarginTop,
  },
  footerText: {
    fontSize: FIORI.helperFontSize,
    lineHeight: FIORI.helperLineHeight,
    color: FIORI.labelColorSecondary,
    flex: 1,
  },
  footerTextError: {
    color: FIORI.errorColor,
  },

  // Character counter
  characterCount: {
    fontSize: FIORI.helperFontSize,
    lineHeight: FIORI.helperLineHeight,
    color: FIORI.labelColorSecondary,
    marginLeft: 8,
  },
  characterCountError: {
    color: FIORI.errorColor,
  },
});

export default FormLabel;
