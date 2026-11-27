/**
 * SAP Fiori inline validation / message strip (docs/STYLE_GUIDE.md §13.9).
 *
 * `helper` is plain secondary text. `success`, `warning` and `error` are message
 * strips: status background, 1 px status border, icon plus text in the status
 * text colour.
 */
import React from 'react';
import { View, Text } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import { t as tr, type TranslationKey } from '@/i18n';

type ValidationVariant = 'helper' | 'success' | 'warning' | 'error';

interface InlineValidationProps {
  message: string;
  variant?: ValidationVariant;
  visible?: boolean;
  /** More lines and actions inside the strip, under the message (WH-303's replaced entries). */
  children?: React.ReactNode;
  /** The strip is read as its message, with no "Warning:" label in front (its title already says what it is). */
  plainLabel?: boolean;
  testID?: string;
}

const VARIANT_CONFIG: Record<
  ValidationVariant,
  { icon: IconName | null; status: 'positive' | 'critical' | 'negative' | null; labelKey: TranslationKey | null }
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
  children,
  plainLabel = false,
  testID,
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
      testID={testID}
      accessible={!children}
      accessibilityRole={variant === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={variant === 'error' ? 'polite' : 'none'}
      accessibilityLabel={config.labelKey && !plainLabel ? tr(config.labelKey, { message }) : message}
    >
      {config.icon && status && (
        <Icon
          name={config.icon}
          size={iconSize.sm}
          color={status.text}
          style={styles.icon}
        />
      )}
      {children ? (
        <View style={styles.body}>
          <Text style={[styles.text, styles.titleText, { color: status ? status.text : t.text.secondary }]} accessibilityRole="header">
            {message}
          </Text>
          {children}
        </View>
      ) : (
        <Text style={[styles.text, { color: status ? status.text : t.text.secondary }]}>{message}</Text>
      )}
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

const makeStyles = () => ({
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
  titleText: {
    flex: 0,
  },
  body: {
    flex: 1,
    gap: space.xs,
  },
});

export default InlineValidation;
