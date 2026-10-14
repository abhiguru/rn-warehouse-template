/**
 * Shown on the item page and the customer-rate page when the day chosen with "Change date" is not
 * today: rates are changed only from today's rows, so the write actions are hidden until the
 * person goes back to today.
 */
import React from 'react';
import { t } from '@/i18n';
import { dateText } from '../rateText';
import { RateStrip } from './RateStrip';

interface Props {
  day: string;
  onBack: () => void;
}

export function OtherDayStrip({ day, onBack }: Props) {
  return (
    <RateStrip
      variant="info"
      message={t('pricing.otherDay.strip', { date: dateText(day) })}
      actions={[{ label: t('pricing.list.backToToday'), onPress: onBack, testID: 'other-day-back' }]}
      testID="other-day-strip"
    />
  );
}
