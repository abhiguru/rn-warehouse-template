/** "What changes": the old rate until the day before, the new rate from the day (or the corrected rate). */
import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { radius, space, typography, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  card: { padding: space.lg, borderRadius: radius.card, backgroundColor: t.surface.card, gap: space.xs, ...t.shadow[1] },
  title: { ...typography.headline, color: t.text.primary },
  line: { ...typography.subhead, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
});

export function ChangeSummary({ lines }: { lines: string[] }) {
  const styles = useThemedStyles(makeStyles);
  if (lines.length === 0) return null;
  return (
    <View style={styles.card} testID="change-summary">
      <Text style={styles.title} accessibilityRole="header">{t('pricing.edit.whatChanges')}</Text>
      {lines.map(line => (
        <Text key={line} style={styles.line}>{line}</Text>
      ))}
    </View>
  );
}

export default ChangeSummary;
