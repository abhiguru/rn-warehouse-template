/**
 * The facility's charging rule (backend migration 164, WH-137): how storage time is counted and how totals are rounded.
 * The server alone works out durations, storage amounts and totals from it; the app only reads the rule, shows it in the
 * facility's words and sends it back with a new invoice (`charging`) so the server can tell that it changed meanwhile.
 */
import { t, type TranslationKey } from '@/i18n';

export type ChargeStep = 15 | 30 | 1;
export type MinimumDays = 0 | 15 | 30 | 60 | 90;
export type DaysCounted = 'legacy' | 'standard';
export type TotalRounding = 'up' | 'nearest' | 'none';

export interface ChargingRule {
  /** Storage is charged in steps of this many days: 15 (half a month), 30 (a month) or 1 (a day). */
  step_days: ChargeStep;
  /** The least charged, in days; 0 means one step. */
  minimum_days: MinimumDays;
  /** `legacy`: from the day after receipt; `standard`: including the day of receipt. */
  days_counted: DaysCounted;
  /** How header tax and the grand total are rounded. */
  rounding: TotalRounding;
}

export const STEP_CHOICES: readonly ChargeStep[] = [15, 30, 1];
export const MINIMUM_CHOICES: readonly MinimumDays[] = [0, 15, 30, 60, 90];
export const DAYS_CHOICES: readonly DaysCounted[] = ['legacy', 'standard'];
export const ROUNDING_CHOICES: readonly TotalRounding[] = ['up', 'nearest', 'none'];

/** Today's rule: what every invoice made before migration 164 used. */
export const DEFAULT_CHARGING_RULE: ChargingRule = { step_days: 15, minimum_days: 30, days_counted: 'legacy', rounding: 'up' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The four fields of a rule as the server sent them, or null when any is missing or not one of the allowed values. */
export function parseChargingRule(value: unknown): ChargingRule | null {
  if (!isRecord(value)) return null;
  const step = Number(value.step_days);
  const minimum = Number(value.minimum_days);
  const days = value.days_counted;
  const rounding = value.rounding;
  if (!STEP_CHOICES.includes(step as ChargeStep) || !MINIMUM_CHOICES.includes(minimum as MinimumDays)) return null;
  if (days !== 'legacy' && days !== 'standard') return null;
  if (rounding !== 'up' && rounding !== 'nearest' && rounding !== 'none') return null;
  return { step_days: step as ChargeStep, minimum_days: minimum as MinimumDays, days_counted: days, rounding };
}

export const sameChargingRule = (a: ChargingRule, b: ChargingRule): boolean =>
  a.step_days === b.step_days && a.minimum_days === b.minimum_days && a.days_counted === b.days_counted && a.rounding === b.rounding;

/** A minimum shorter than one step is not allowed (0, "One step", always is). */
export const minimumAllowed = (minimum: MinimumDays, step: ChargeStep): boolean => minimum === 0 || minimum >= step;

/** The least duration the rule charges, in months of 30 days: the minimum, or one step when the minimum is "One step". */
export function minimumMonths(rule: Pick<ChargingRule, 'step_days' | 'minimum_days'>): number {
  return (rule.minimum_days === 0 ? rule.step_days : rule.minimum_days) / 30;
}

export const STEP_LABEL: Record<ChargeStep, TranslationKey> = {
  15: 'charging.step.half',
  30: 'charging.step.month',
  1: 'charging.step.day',
};
export const DAYS_LABEL: Record<DaysCounted, TranslationKey> = {
  legacy: 'charging.days.after',
  standard: 'charging.days.including',
};
export const ROUNDING_LABEL: Record<TotalRounding, TranslationKey> = {
  up: 'charging.round.up',
  nearest: 'charging.round.nearest',
  none: 'charging.round.none',
};

/** "One step", "Half a month", "1 month", "2 months": the choice in the words of the Charging screen. */
export function minimumLabel(minimum: MinimumDays): string {
  if (minimum === 0) return t('charging.minimum.oneStep');
  if (minimum === 15) return t('charging.minimum.half');
  return t('charging.minimum.months', { count: minimum / 30 });
}

/**
 * The rule in one sentence, in the facility's words (spec step 10): "Storage charged in half-month steps, minimum
 * 1 month, from the day after receipt. Total rounded up to the next rupee." Shown under the totals of the invoice form's
 * review step, in the preview and on invoice details (from the invoice's own stored rule).
 */
export function describeChargingRule(rule: ChargingRule): string {
  const step: Record<ChargeStep, TranslationKey> = {
    15: 'charging.line.stepHalf',
    30: 'charging.line.stepMonth',
    1: 'charging.line.stepDay',
  };
  const days: Record<DaysCounted, TranslationKey> = { legacy: 'charging.line.daysAfter', standard: 'charging.line.daysIncluding' };
  const rounding: Record<TotalRounding, TranslationKey> = {
    up: 'charging.line.roundUp',
    nearest: 'charging.line.roundNearest',
    none: 'charging.line.roundNone',
  };
  return t('charging.line.sentence', { step: t(step[rule.step_days]), minimum: minimumInWords(rule), days: t(days[rule.days_counted]), rounding: t(rounding[rule.rounding]) });
}

/** The text for "Duration must be at least {{minimum}}": the rule's minimum in words. */
export function minimumInWords(rule: Pick<ChargingRule, 'minimum_days'>): string {
  return rule.minimum_days === 0 ? t('charging.line.minOneStep') : rule.minimum_days === 15 ? t('charging.line.minHalf') : t('charging.minimum.months', { count: rule.minimum_days / 30 });
}
