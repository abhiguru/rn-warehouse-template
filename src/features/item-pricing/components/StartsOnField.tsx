/**
 * "Starts on": chips Today, 1 Nov 2026, 1 Apr 2027 and Other date. Every date is the day goods
 * were received (the rate applies to lots received from it). "Other date" opens the calendar at
 * once on Android, on the first of next month; staff cannot pick a day before today.
 */
import React from 'react';
import { Platform, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { START_DAYS_AHEAD, START_DAYS_BACK, startChips, type StartsOnChoice } from '../editModel';
import { addDays, dateText } from '../rateText';

interface Props {
  choice: StartsOnChoice | null;
  day: string | null;
  today: string;
  /** Admin and supervisor may start a rate in the past (up to three years back). */
  canStartInPast: boolean;
  /** An invoice line's goods-received day, offered as the first chip when it is before today. */
  receivedDay?: string | null;
  /** The day is the rate's own and cannot be chosen (a correction). */
  fixed?: boolean;
  error?: string;
  onChange: (choice: StartsOnChoice, day: string) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { gap: space.xs },
  label: { ...typography.subhead, color: t.text.secondary },
  required: { color: t.status.negative.text },
  value: { ...typography.body, color: t.text.primary },
  hint: { ...typography.footnote, color: t.text.secondary },
  error: { ...typography.footnote, color: t.status.negative.text },
});

export function StartsOnField({ choice, day, today, canStartInPast, receivedDay, fixed, error, onChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const chips = startChips(today);
  const nextMonth = chips.find(c => c.id === 'nextMonth')?.day ?? today;
  // The server's window, in days (1095 back, 730 ahead), not calendar years: a 29 Feb is inside it.
  const minimumDate = parseLocalISODate(canStartInPast ? addDays(today, -START_DAYS_BACK) : today);
  const maximumDate = parseLocalISODate(addDays(today, START_DAYS_AHEAD));

  const label = (
    <Text style={styles.label}>
      {t('pricing.edit.startsOn')}
      <Text style={styles.required}> *</Text>
    </Text>
  );

  if (fixed) {
    return (
      <View style={styles.wrap}>
        {label}
        <Text style={styles.value}>{t('pricing.edit.startsOnCorrect', { date: day ? dateText(day) : '—' })}</Text>
      </View>
    );
  }

  const options = [
    ...(receivedDay && receivedDay < today ? [{ value: 'received' as const, label: t('pricing.edit.received', { date: dateText(receivedDay) }) }] : []),
    { value: 'today' as const, label: t('pricing.edit.today') },
    ...chips.filter(c => c.id !== 'today').map(c => ({ value: c.id, label: dateText(c.day) })),
    { value: 'other' as const, label: t('pricing.edit.otherDate') },
  ];

  const pick = (next: StartsOnChoice) => {
    if (next === 'today') return onChange('today', today);
    if (next === 'received' && receivedDay) return onChange('received', receivedDay);
    const chip = chips.find(c => c.id === next);
    if (chip) return onChange(chip.id, chip.day);
    // Other date: the calendar opens at once on Android, on the first of next month.
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseLocalISODate(choice === 'other' && day ? day : nextMonth),
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange('other', toLocalISODate(date));
        },
      });
    } else {
      onChange('other', choice === 'other' && day ? day : nextMonth);
    }
  };

  return (
    <View style={styles.wrap}>
      {label}
      <ChoiceChips options={options} value={choice ?? undefined} onChange={pick} accessibilityLabel={t('pricing.edit.startsOn')} />
      {choice === 'other' && day ? (
        <DatePickerInput
          label={t('pricing.edit.otherDate')}
          value={parseLocalISODate(day)}
          onChange={date => onChange('other', toLocalISODate(date))}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      ) : choice === null ? (
        <Text style={styles.hint}>{t('pricing.edit.chooseDate')}</Text>
      ) : null}
    </View>
  );
}

export default StartsOnField;
