/**
 * "Monthly rent per bag, for lots received on 14 Oct 2026." with "Change date" (the platform
 * calendar, three years back to two years ahead) and, when the day is not today, "Back to
 * today". Every date here reads as a goods-received date.
 */
import React, { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Button } from '@/components/ui/Button';
import { useTheme, useThemedStyles } from '@/hooks/useTheme';
import { getLanguage, t } from '@/i18n';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { parseLocalISODate, toLocalISODate } from '@/utils/formatters';
import { addDays } from '../rateText';

export interface RatesOnBarProps {
  /** The sentence for the day shown ("Monthly rent per bag, for lots received on 14 Oct 2026."). */
  text: string;
  day: string;
  today: string;
  onChangeDay: (day: string) => void;
  /** The day is fixed (a read-only card opened from a GRN): no Change date, no Back to today. */
  fixed?: boolean;
}

const makeStyles = (th: ThemeTokens) => ({
  bar: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    gap: space.xs,
    backgroundColor: th.surface.header,
  },
  text: { ...typography.footnote, color: th.text.secondary },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.sm },
  overlay: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: th.overlay.scrim },
  sheet: { backgroundColor: th.surface.sheet, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.lg },
  sheetActions: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
});

/** Three years back, two years ahead (the server refuses a start outside this; the list shares it). */
export const dayLimits = (today: string) => ({
  min: parseLocalISODate(addDays(today, -365 * 3)),
  max: parseLocalISODate(addDays(today, 365 * 2)),
});

export function RatesOnBar({ text, day, today, onChangeDay, fixed = false }: RatesOnBarProps) {
  const styles = useThemedStyles(makeStyles);
  const { tokens: th, resolvedMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parseLocalISODate(day));
  const limits = dayLimits(today);

  const show = () => {
    setDraft(parseLocalISODate(day));
    setOpen(true);
  };
  const onAndroid = (event: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (event.type === 'set' && picked) onChangeDay(toLocalISODate(picked));
  };

  return (
    <View style={styles.bar}>
      <Text style={styles.text} accessibilityLiveRegion="polite" testID="rates-on-text">{text}</Text>
      {fixed ? null : (
        <View style={styles.actions}>
          <Button type="tertiary" leftIcon="calendar-outline" onPress={show} testID="change-date">
            {t('pricing.list.changeDate')}
          </Button>
          {day !== today ? (
            <Button type="tertiary" onPress={() => onChangeDay(today)} testID="back-to-today">
              {t('pricing.list.backToToday')}
            </Button>
          ) : null}
        </View>
      )}
      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          onChange={onAndroid}
          minimumDate={limits.min}
          maximumDate={limits.max}
          themeVariant={resolvedMode}
        />
      ) : null}
      {open && Platform.OS !== 'android' ? (
        <Modal transparent animationType="slide" visible onRequestClose={() => setOpen(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetActions}>
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                  <Text style={styles.text}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setOpen(false); onChangeDay(toLocalISODate(draft)); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done')}
                >
                  <Text style={styles.text}>{t('common.done')}</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                locale={getLanguage() === 'gu' ? 'gu-IN' : 'en-IN'}
                onChange={(_e, picked) => { if (picked) setDraft(picked); }}
                minimumDate={limits.min}
                maximumDate={limits.max}
                accentColor={th.brand.tint}
                textColor={th.text.primary}
                themeVariant={resolvedMode}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
