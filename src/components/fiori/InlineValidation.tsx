/**
 * SAP Fiori inline validation / message strip (docs/STYLE_GUIDE.md §13.9).
 *
 * `helper` is plain secondary text. `success`, `warning` and `error` are message
 * strips: status background, 1 px status border, icon plus text in the status
 * text colour.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr, type TranslationKey } from '@/i18n';

type ValidationVariant = 'helper' | 'success' | 'warning' | 'error';

interface InlineValidationProps {
  message: string;
  variant?: ValidationVariant;
  visible?: boolean;
}

const VARIANT_CONFIG: Record<
  ValidationVariant,
  { icon: string | null; status: 'positive' | 'critical' | 'negative' | null; labelKey: TranslationKey | null }
> = {
  helper: { icon: null, status: null, labelKey: null },
  success: { icon: 'check-circle', status: 'positive', labelKey: 'components.validation.successLabel' },
  warning: { icon: 'alert', status: 'critical', labelKey: 'components.validation.warningLabel' },
  error: { icon: 'alert-circle', status: 'negative', labelKey: 'components.validation.errorLabel' },
};

export const InlineValidation: React.FC<InlineValidationProps> = ({
  message,
  variant = 'helper',
  visible = true,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  if (!visible || !message) return null;

  const config = VARIANT_CONFIG[variant];
  const status = config.status ? t.status[config.status] : null;

  return (
    <View
      style={[
        styles.container,
        status && styles.strip,
        status && { backgroundColor: status.background, borderColor: status.border },
      ]}
      accessible
      accessibilityRole={variant === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={variant === 'error' ? 'polite' : 'none'}
      accessibilityLabel={config.labelKey ? tr(config.labelKey, { message }) : message}
    >
      {config.icon && status && (
        <Icon
          name={config.icon}
          size={iconSize.sm}
          color={status.text}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, { color: status ? status.text : t.text.secondary }]}>
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

const makeStyles = (_t: ThemeTokens) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  strip: {
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  icon: {
    marginRight: space.s6,
    marginTop: 1, // Align with first line of text
  },
  text: {
    ...typography.footnote,
    flex: 1,
  },
});

export default InlineValidation;
