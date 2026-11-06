/**
 * "Starts on" of Add rate on a rate in force (WH-74): two choices and nothing else. The rate's own start day (the
 * default, with its date; the server's earliest allowed day when the rate began before it) and Today, which is
 * offered only when the rate did not start today.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import type { StartsOnChoice } from '../editModel';
import { dateText, spokenDateText } from '../rateText';

interface Props {
  choice: StartsOnChoice | null;
  /** The day of the default choice (the rate's own start, or the earliest allowed day). */
  ownDay: string;
  today: string;
  onChange: (choice: StartsOnChoice, day: string) => void;
}

const makeStyles = (th: ThemeTokens) => ({
  wrap: { gap: space.xs },
  label: { ...typography.subhead, color: th.text.secondary },
});

export function AddBandStart({ choice, ownDay, today, onChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const options = [
    { value: 'ownStart' as const, label: t('pricing.edit.bandStartOwn', { date: dateText(ownDay) }), a11yLabel: t('pricing.edit.bandStartOwnA11y', { date: spokenDateText(ownDay) }) },
    ...(ownDay !== today
      ? [{ value: 'today' as const, label: t('pricing.edit.today'), a11yLabel: t('pricing.edit.bandStartTodayA11y', { date: spokenDateText(today) }) }]
      : []),
  ];
  return (
    <View style={styles.wrap} testID="add-rate-band-start">
      <Text style={styles.label}>{t('pricing.edit.startsOn')}</Text>
      <ChoiceChips
        options={options}
        value={choice === 'today' ? 'today' : 'ownStart'}
        onChange={value => onChange(value, value === 'today' ? today : ownDay)}
        accessibilityLabel={t('pricing.edit.startsOn')}
      />
    </View>
  );
}

export default AddBandStart;
