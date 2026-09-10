import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '@/theme';

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
  marginBottom = theme.spacing.lg,
}: FormFieldWrapperProps) {
  return (
    <View style={[styles.container, { marginBottom }]}>
      {/* Label */}
      <View style={styles.labelContainer}>
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      </View>

      {/* Input Field */}
      {children}

      {/* Help Text */}
      {helpText && !error && <Text style={styles.helpText}>{helpText}</Text>}

      {/* Error Message */}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelContainer: {
    marginBottom: theme.spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.gray[700],
  },
  required: {
    color: theme.colors.red[500],
    fontWeight: '600',
  },
  helpText: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
    color: theme.colors.gray[500],
    lineHeight: 16,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
    color: theme.colors.red[500],
    lineHeight: 16,
  },
});
