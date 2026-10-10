/**
 * A date range: quick ranges as chips, or a From and a To day.
 * Choosing a quick range replaces the days; choosing a day replaces the quick range.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatDate, parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { DATE_PRESETS, resolveDateRange } from '../../datePresets';
import type { DatePresetId, DateRangeValue } from '../../types';
import { ChoiceChips } from '../ChoiceChips';

export interface DateRangeEditorProps {
  value: DateRangeValue | undefined;
  onChange: (value: DateRangeValue | undefined) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  wrap: { gap: space.md },
  row: { flexDirection: 'row' as const, gap: space.md },
  cell: { flex: 1, gap: space.xs },
  label: { ...typography.footnote, color: t.text.secondary },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    gap: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
  },
  buttonPressed: { backgroundColor: t.surface.cardPressed },
  value: { ...typography.body, flex: 1, color: t.text.primary },
  placeholder: { color: t.text.placeholder },
});

type End = 'from' | 'to';

export function DateRangeEditor({ value, onChange }: DateRangeEditorProps) {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [iosEnd, setIosEnd] = useState<End | null>(null);
  const range = resolveDateRange(value);

  const setDay = (end: End, date: Date) => {
    const iso = toLocalISODate(date);
    const next = { from: range.from, to: range.to, [end]: iso };
    // Keep the range the right way round.
    if (next.from && next.to && next.from > next.to) {
      if (end === 'from') next.to = iso;
      else next.from = iso;
    }
    onChange(next);
  };

  const open = (end: End) => {
    const current = range[end] ? parseLocalISODate(range[end] as string) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) setDay(end, date);
        },
      });
    } else {
      setIosEnd(previous => (previous === end ? null : end));
    }
  };

  const dayButton = (end: End) => (
    <View style={styles.cell}>
      <Text style={styles.label}>{translate(`filters.date.${end}`)}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => open(end)}
        accessibilityRole="button"
        accessibilityLabel={
          range[end]
            ? translate(`filters.date.${end}Set`, { date: formatDate(parseLocalISODate(range[end] as string)) })
            : translate(`filters.date.${end}NotSet`)
        }
      >
        <Icon name="calendar-blank-outline" size={iconSize.md} color={t.icon.secondary} />
        <Text style={[styles.value, !range[end] && styles.placeholder]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
          {range[end] ? formatDate(parseLocalISODate(range[end] as string)) : translate('common.any')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <ChoiceChips<DatePresetId>
        accessibilityLabel={translate('filters.date.quickRanges')}
        options={DATE_PRESETS.map(preset => ({ value: preset.id, label: preset.label }))}
        value={value?.preset}
        onChange={preset => onChange(value?.preset === preset ? undefined : { preset })}
      />
      <View style={styles.row}>
        {dayButton('from')}
        {dayButton('to')}
      </View>
      {Platform.OS === 'ios' && iosEnd ? (
        <DateTimePicker
          value={range[iosEnd] ? parseLocalISODate(range[iosEnd] as string) : new Date()}
          mode="date"
          display="inline"
          onChange={(_event, date) => {
            if (date) setDay(iosEnd, date);
          }}
        />
      ) : null}
    </View>
  );
}

export default DateRangeEditor;
