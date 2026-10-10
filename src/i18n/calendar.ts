/**
 * The words of the calendar (react-native-paper-dates) in Gujarati.
 *
 * The library keeps its own text per locale. English uses the library's `en`;
 * Gujarati is registered in app/_layout.tsx with `registerTranslation('gu', gujaratiCalendar)`.
 * Every `DatePickerModal` is given `locale={getLanguage()}`.
 *
 * This is a function the library calls when it draws, so `t` is not called at
 * module level. Month and weekday names are not here: the library builds them
 * with `Intl.DateTimeFormat(locale)`.
 */
import type { TranslationsType } from 'react-native-paper-dates';
import { t } from './index';

/** The texts one locale of the calendar needs (the library's TranslationsType). */
export type CalendarTranslation = TranslationsType;

export const gujaratiCalendar = (): CalendarTranslation => ({
  save: t('components.calendar.save', undefined, 'gu'),
  selectSingle: t('components.calendar.selectSingle', undefined, 'gu'),
  selectMultiple: t('components.calendar.selectMultiple', undefined, 'gu'),
  selectRange: t('components.calendar.selectRange', undefined, 'gu'),
  notAccordingToDateFormat: inputFormat => t('components.calendar.notAccordingToDateFormat', { format: inputFormat }, 'gu'),
  mustBeHigherThan: date => t('components.calendar.mustBeHigherThan', { date }, 'gu'),
  mustBeLowerThan: date => t('components.calendar.mustBeLowerThan', { date }, 'gu'),
  mustBeBetween: (startDate, endDate) => t('components.calendar.mustBeBetween', { start: startDate, end: endDate }, 'gu'),
  dateIsDisabled: t('components.calendar.dateIsDisabled', undefined, 'gu'),
  previous: t('components.calendar.previous', undefined, 'gu'),
  next: t('components.calendar.next', undefined, 'gu'),
  typeInDate: t('components.calendar.typeInDate', undefined, 'gu'),
  pickDateFromCalendar: t('components.calendar.pickDateFromCalendar', undefined, 'gu'),
  close: t('components.calendar.close', undefined, 'gu'),
  hour: t('components.calendar.hour', undefined, 'gu'),
  minute: t('components.calendar.minute', undefined, 'gu'),
});
