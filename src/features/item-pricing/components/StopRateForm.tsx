/**
 * The body of "Stop this rate": what happens after the last day, the last-day chips (Today, end
 * of month, end of financial year, Other date) and the two buttons. The last day is the last day
 * of goods-received dates that pay this rate; no past day is offered to any role.
 */
import React from 'react';
import { Platform, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatDate, parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { START_DAYS_AHEAD, stopChips } from '../editModel';
import { addDays, dateText } from '../rateText';
import { EditorStrip } from './EditorStrip';

export type StopChoice = 'today' | 'monthEnd' | 'yearEnd' | 'other';

interface Props {
  body: string;
  today: string;
  choice: StopChoice;
  day: string;
  onChange: (choice: StopChoice, day: string) => void;
  /** An error from the server (for example NOTHING_TO_STOP). */
  strip?: string | null;
  busy: boolean;
  /** Offline: Stop rate is off and the helper says to connect. */
  helper?: string | null;
  onStop: () => void;
  onCancel: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { gap: space.lg },
  body: { ...typography.body, color: t.text.primary },
  label: { ...typography.subhead, color: t.text.secondary },
  group: { gap: space.xs },
  helper: { ...typography.footnote, color: t.text.secondary },
  buttons: { gap: space.sm },
});

export function StopRateForm({ body, today, choice, day, onChange, strip, busy, helper, onStop, onCancel }: Props) {
  const styles = useThemedStyles(makeStyles);
  const chips = stopChips(today);
  const minimumDate = parseLocalISODate(today);
  // The stop starts the day after the last day, which the server accepts up to 730 days ahead.
  const maximumDate = parseLocalISODate(addDays(today, START_DAYS_AHEAD - 1));

  const options = [
    ...chips.map(c => ({
      value: c.id as StopChoice,
      label: c.id === 'today' ? t('pricing.stop.today', { date: formatDate(c.day, 'short') }) : dateText(c.day),
    })),
    { value: 'other' as StopChoice, label: t('pricing.edit.otherDate') },
  ];

  const pick = (next: StopChoice) => {
    const chip = chips.find(c => c.id === next);
    if (chip) return onChange(chip.id, chip.day);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseLocalISODate(choice === 'other' ? day : today),
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange('other', toLocalISODate(date));
        },
      });
    } else {
      onChange('other', choice === 'other' ? day : today);
    }
  };

  return (
    <View style={styles.wrap}>
      {strip ? <EditorStrip variant="critical" message={strip} testID="editor-error" /> : null}
      <Text style={styles.body}>{body}</Text>
      <View style={styles.group}>
        <Text style={styles.label}>{t('pricing.stop.lastDay')}</Text>
        <ChoiceChips options={options} value={choice} onChange={pick} accessibilityLabel={t('pricing.stop.lastDay')} />
        {choice === 'other' ? (
          <DatePickerInput
            label={t('pricing.edit.otherDate')}
            value={parseLocalISODate(day)}
            onChange={date => onChange('other', toLocalISODate(date))}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
        ) : null}
      </View>
      <View style={styles.buttons}>
        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
        <Button
          type="primary"
          variant="negative"
          size="fullWidth"
          onPress={onStop}
          disabled={busy || !!helper}
          loading={busy}
          loadingText={t('pricing.stop.stopping')}
        >
          {t('pricing.stop.button')}
        </Button>
        <Button type="secondary" variant="normal" size="fullWidth" onPress={onCancel} disabled={busy}>
          {t('pricing.stop.cancel')}
        </Button>
      </View>
    </View>
  );
}

export default StopRateForm;
