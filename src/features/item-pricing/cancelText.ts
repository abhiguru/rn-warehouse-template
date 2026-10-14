import { t } from '@/i18n';
import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';
import type { UpcomingGroup } from './rateModel';
import { addDays, dateText, unitText } from './rateText';

/** The scope the Cancel new rate dialog is about. */
export interface CancelScope {
  priceType: PriceType;
  bands: ItemStoragePrice[];
  upcoming: UpcomingGroup | null;
}

/**
 * What the Cancel new rate dialog promises. undo_rate_change re-opens only the rows that end the
 * day before the new rate, so a current rate with a scheduled stop earlier than that does not
 * continue: the dialog says when it stops instead of saying it continues.
 */
export function cancelMessage(scope: CancelScope | null, current: string | null, incoming: string): string {
  if (!scope?.upcoming || !current) return t('pricing.cancel.messageNone', { new: incoming });
  const dayBefore = addDays(scope.upcoming.startsOn, -1);
  const runsOn = scope.bands.length > 0 && scope.bands.every(b => b.effective_to === dayBefore);
  if (runsOn) {
    return t('pricing.cancel.message', { current, unit: unitText(scope.priceType), date: dateText(dayBefore), new: incoming });
  }
  const stops = scope.bands.map(b => b.effective_to).filter((d): d is string => Boolean(d)).sort()[0];
  if (!stops) {
    // Open-ended rows do not end before the new rate: nothing to re-open, the rate simply runs on.
    return t('pricing.cancel.message', { current, unit: unitText(scope.priceType), date: dateText(dayBefore), new: incoming });
  }
  return t('pricing.cancel.messageGap', { current, unit: unitText(scope.priceType), stop: dateText(stops), new: incoming });
}

