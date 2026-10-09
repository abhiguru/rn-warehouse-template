/**
 * Form field wrapper (docs/STYLE_GUIDE.md §13.2): label above the field in
 * footnote / text.secondary with the required asterisk in text.required, then
 * helper text or an error message with its icon.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, space, typography, type ThemeTokens } from '@/theme/tokens';

export interface FormFieldWrapperProps {
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children: React.ReactNode;
  marginBottom?: number; // Custom bottom margin
}

export default function FormFieldWrapper({
  label,
  required = false,
  error,
  helpText,
  children,
  marginBottom = space.lg,
}: FormFieldWrapperProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.container, { marginBottom }]}>
      {/* Label */}
      <View style={styles.labelContainer}>
        <Text style={[styles.label, error ? styles.labelError : null]}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      </View>

      {/* Input Field */}
      {children}

      {/* Help Text */}
      {helpText && !error && <Text style={styles.helpText}>{helpText}</Text>}

      {/* Error Message */}
      {error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon
            name="alert-circle"
            size={iconSize.sm}
            color={t.status.negative.text}
            style={styles.errorIcon}
          />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    width: '100%' as const,
  },
  labelContainer: {
    marginBottom: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
    fontWeight: fontWeight.semibold,
  },
  helpText: {
    ...typography.footnote,
    marginTop: space.xs,
    color: t.text.secondary,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  errorIcon: {
    marginTop: 1,
    marginRight: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
});
