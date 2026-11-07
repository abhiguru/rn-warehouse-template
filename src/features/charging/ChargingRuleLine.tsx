/**
 * The charging rule in one sentence, in the facility's words (WH-137, spec step 10): under the totals of an invoice form's
 * review step and on invoice details, where it is the invoice's own stored rule. Draws nothing when no rule is known
 * (a backend before migration 164).
 */
import React from 'react';
import { Text } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { describeChargingRule, type ChargingRule } from './chargingRule';

const makeStyles = (t: ThemeTokens) => ({
  line: { ...typography.footnote, color: t.text.secondary, marginTop: space.sm },
});

export function ChargingRuleLine({ rule, testID = 'charging-rule-line' }: { rule: ChargingRule | undefined; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  if (!rule) return null;
  return (
    <Text style={styles.line} testID={testID}>
      {describeChargingRule(rule)}
    </Text>
  );
}
