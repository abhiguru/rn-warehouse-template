/**
 * A message strip on the rate screens: info (an upcoming rate), warning, or critical (no rate,
 * a rate that overlaps), with optional text actions underneath. Warning and critical wrap
 * fiori/InlineValidation; info is built here from the informative status colours.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { Button } from '@/components/ui/Button';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';

export interface RateStripAction {
  label: string;
  /** What a screen reader says when the label alone does not say which rate ("Cancel the rate from 1 Nov 2026"). */
  a11yLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Said by a screen reader after the label (why the action is off). */
  a11yHint?: string;
  /** Draw the action in the destructive colour. */
  negative?: boolean;
  testID?: string;
}

export interface RateStripProps {
  variant: 'info' | 'warning' | 'critical';
  message: string;
  actions?: RateStripAction[];
  testID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  info: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    backgroundColor: t.status.informative.background,
    borderColor: t.status.informative.border,
  },
  infoText: { ...typography.subhead, flex: 1, color: t.status.informative.text },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, marginTop: space.xs },
});

export function RateStrip({ variant, message, actions, testID }: RateStripProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  return (
    <View testID={testID}>
      {variant === 'info' ? (
        <View style={styles.info} accessible accessibilityLiveRegion="polite" accessibilityLabel={message}>
          <Icon name="information" size={iconSize.sm} color={t.status.informative.text} />
          <Text style={styles.infoText}>{message}</Text>
        </View>
      ) : (
        <InlineValidation variant={variant === 'critical' ? 'error' : 'warning'} message={message} />
      )}
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map(action => (
            <Button
              key={action.label}
              type="tertiary"
              variant={action.negative ? 'negative' : 'tint'}
              onPress={action.onPress}
              disabled={action.disabled}
              accessibilityLabel={action.a11yLabel}
              accessibilityHint={action.a11yHint}
              testID={action.testID}
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}
