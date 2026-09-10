/**
 * SAP Fiori Inline Validation
 * @see design/sap-fiori-specs/22-inline-validation.md
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type ValidationVariant = 'helper' | 'success' | 'warning' | 'error';

interface InlineValidationProps {
  message: string;
  variant?: ValidationVariant;
  visible?: boolean;
}

const VARIANT_CONFIG: Record<ValidationVariant, { icon: string | null; color: string }> = {
  helper: {
    icon: null,
    color: '#556B82', // Fiori secondary text
  },
  success: {
    icon: 'check-circle',
    color: '#36A41D', // Fiori positive
  },
  warning: {
    icon: 'alert',
    color: '#E9730C', // Fiori critical
  },
  error: {
    icon: 'alert-circle',
    color: '#D32030', // Fiori negative
  },
};

export const InlineValidation: React.FC<InlineValidationProps> = ({
  message,
  variant = 'helper',
  visible = true,
}) => {
  if (!visible || !message) return null;

  const config = VARIANT_CONFIG[variant];

  return (
    <View
      style={styles.container}
      accessibilityRole={variant === 'error' ? 'alert' : undefined}
      accessibilityLabel={`${variant}: ${message}`}
    >
      {config.icon && (
        <Icon
          name={config.icon}
          size={16}
          color={config.color}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, { color: config.color }]} numberOfLines={3}>
        {message}
      </Text>
    </View>
  );
};

// Helper function to determine validation state
export const getValidationState = (
  error?: string,
  warning?: string,
  success?: string,
  helperText?: string
): { variant: ValidationVariant; message: string } | null => {
  if (error) return { variant: 'error', message: error };
  if (warning) return { variant: 'warning', message: warning };
  if (success) return { variant: 'success', message: success };
  if (helperText) return { variant: 'helper', message: helperText };
  return null;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 0,
  },
  icon: {
    marginRight: 4,
    marginTop: 1, // Align with first line of text
  },
  // Fiori: Validation text - 13pt, single line recommended
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
});

export default InlineValidation;
