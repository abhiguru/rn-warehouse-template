/**
 * SAP Fiori form cell label (docs/STYLE_GUIDE.md §13.2).
 *
 * Features:
 * - Sentence-case label in footnote, text.secondary
 * - Required asterisk in text.required
 * - Error state in status.negative.text
 * - Disabled state (interaction.disabledOpacity)
 * - Read-only state
 * - Optional helper/hint text
 * - Consistent typography with the Input component
 */

import React from 'react';
import {
  View,
  Text,
  TextProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { fontWeight, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { localizeDigits, t } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================

export interface FormLabelProps extends Omit<TextProps, 'children'> {
  /** Label text content */
  children: React.ReactNode;
  /** Show required asterisk */
  required?: boolean;
  /** Show in error state */
  error?: boolean;
  /** Show in disabled state (reduced opacity) */
  disabled?: boolean;
  /** Show in read-only state */
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
  readOnly: _readOnly = false,
  style,
  containerStyle,
  helperText,
  size = 'default',
  ...props
}) => {
  const styles = useThemedStyles(makeStyles);
  const labelStyle = [
    styles.label,
    size === 'small' && styles.labelSmall,
    error && styles.labelError,
  ];
  const a11yLabel =
    typeof children === 'string' ? (required ? t('components.input.requiredLabel', { label: children }) : children) : undefined;

  // Simple label without helper text
  if (!helperText) {
    return (
      <Text
        style={[labelStyle, disabled && styles.disabled, style]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={a11yLabel}
        {...props}
      >
        {children}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
    );
  }

  // Label with helper text (uses wrapper View)
  return (
    <View style={[disabled && styles.disabled, containerStyle]}>
      <Text
        style={[labelStyle, style]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={a11yLabel}
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
  readOnly: _readOnly = false,
  characterCount,
  style,
  labelStyle,
}) => {
  const styles = useThemedStyles(makeStyles);
  const hasError = error || Boolean(errorMessage);
  const isOverLimit = characterCount
    ? characterCount.current > characterCount.max
    : false;

  // Determine which text to show below label (error takes priority per Fiori spec)
  const footerText = hasError ? errorMessage : helperText;
  const showFooter = Boolean(footerText) || Boolean(characterCount);

  return (
    <View style={[disabled && styles.disabled, style]}>
      {/* Label row */}
      <Text
        style={[
          styles.label,
          hasError && styles.labelError,
          labelStyle,
        ]}
        accessible
        accessibilityRole="text"
        accessibilityLabel={required ? t('components.input.requiredLabel', { label }) : label}
      >
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>

      {/* Footer row (helper/error text + character counter) */}
      {showFooter && (
        <View style={styles.footerRow}>
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

          {characterCount && (
            <Text
              style={[
                styles.characterCount,
                isOverLimit && styles.footerTextError,
              ]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('components.input.characterCount', {
                current: localizeDigits(String(characterCount.current)),
                max: localizeDigits(String(characterCount.max)),
              })}
            >
              {localizeDigits(`${characterCount.current}/${characterCount.max}`)}
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

const makeStyles = (t: ThemeTokens) => ({
  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  labelSmall: {
    ...typography.caption1,
  },
  labelError: {
    color: t.status.negative.text,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  requiredMark: {
    color: t.text.required,
    fontWeight: fontWeight.semibold,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  footerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  footerText: {
    ...typography.footnote,
    color: t.text.secondary,
    flex: 1,
  },
  footerTextError: {
    color: t.status.negative.text,
  },
  characterCount: {
    ...typography.caption1,
    color: t.text.secondary,
    marginLeft: space.sm,
    fontVariant: ['tabular-nums' as const],
  },
});

export default FormLabel;
