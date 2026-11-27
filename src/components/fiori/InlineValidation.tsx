/**
 * SAP Fiori inline validation / message strip (docs/STYLE_GUIDE.md §13.9).
 *
 * `helper` is plain secondary text. `info`, `success`, `warning` and `error` are message
 * strips: status background, 1 px status border, icon plus text in the status
 * text colour. `info` uses the informative status (Design offline-capture.md 2.3, 9.7).
 */
import React from 'react';
import { View, Text } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import type { IconName } from '@/types/icon.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import { t as tr, type TranslationKey } from '@/i18n';

type ValidationVariant = 'helper' | 'info' | 'success' | 'warning' | 'error';

interface InlineValidationProps {
  message: string;
  variant?: ValidationVariant;
  visible?: boolean;
  /** More lines and actions inside the strip, under the message (WH-303's replaced entries). */
  children?: React.ReactNode;
  /** The strip is read as its message, with no "Warning:" label in front (its title already says what it is). */
  plainLabel?: boolean;
  /** A strip's own icon in place of its variant's. */
  icon?: IconName;
  /** The larger text step of a strip that must read first (`typography.subhead`). */
  large?: boolean;
  /** The strip's words as styled text; `message` stays the words for a screen reader. */
  content?: React.ReactNode;
  /** Said once, politely, when the strip changes. */
  announce?: boolean;
  testID?: string;
}

const VARIANT_CONFIG: Record<
  ValidationVariant,
  { icon: IconName | null; status: 'positive' | 'critical' | 'negative' | 'informative' | null; labelKey: TranslationKey | null }
> = {
  helper: { icon: null, status: null, labelKey: null },
  info: { icon: 'information-outline', status: 'informative', labelKey: null },
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
  icon,
  large = false,
  content,
  announce = false,
  testID,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  if (!visible || !message) return null;

  const config = VARIANT_CONFIG[variant];
  const status = config.status ? t.status[config.status] : null;
  const iconName = icon ?? config.icon;

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
      accessibilityLiveRegion={variant === 'error' || announce ? 'polite' : 'none'}
      accessibilityLabel={config.labelKey && !plainLabel ? tr(config.labelKey, { message }) : message}
    >
      {iconName && status && (
        <Icon
          name={iconName}
          size={iconSize.sm}
          color={status.text}
          style={styles.icon}
        />
      )}
      {children ? (
        <View style={styles.body}>
          <Text style={[styles.text, styles.titleText, large && styles.large, { color: status ? status.text : t.text.secondary }]} accessibilityRole="header">
            {content ?? message}
          </Text>
          {children}
        </View>
      ) : (
        <Text style={[styles.text, large && styles.large, { color: status ? status.text : t.text.secondary }]}>
          {content ?? message}
        </Text>
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
  large: {
    ...typography.subhead,
  },
});

export default InlineValidation;
