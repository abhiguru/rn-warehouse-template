/**
 * The Edit sensor form (app/sensor-edit/[id].tsx): its values as typed, what they must be
 * before Save, and whether they differ from the sensor as it was opened.
 *
 * Numbers are held as the text typed (always 0-9: the Input's `numeric` converts), and read
 * here. The limits match update_sensor_device: -100 to 100 °C, the lowest below the highest.
 * Pure functions apart from the words, which are looked up when called.
 */
import type { SensorDevice } from '@/types/sensor.types';
import { t as tr } from '@/i18n';

export const NAME_MAX = 100;
export const LOCATION_MAX = 200;
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 1440;
export const TEMPERATURE_MIN = -100;
export const TEMPERATURE_MAX = 100;

export interface SensorFormValues {
  name: string;
  location: string;
  minutes: string;
  lowest: string;
  highest: string;
}

export type SensorFormField = keyof SensorFormValues;
export type SensorFormErrors = Partial<Record<SensorFormField, string>>;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The form as it starts for a sensor: its settings, the limits from `alert_config` (empty when it has none). */
export function formFromDevice(device: SensorDevice): SensorFormValues {
  const config = device.alert_config;
  return {
    name: device.device_name ?? '',
    location: device.location ?? '',
    minutes: String(device.staleness_threshold_minutes > 0 ? device.staleness_threshold_minutes : 30),
    lowest: config && finite(config.temperature_min) ? String(config.temperature_min) : '',
    highest: config && finite(config.temperature_max) ? String(config.temperature_max) : '',
  };
}

/** A whole number of minutes, or null when the text is not one. */
export function parseMinutes(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,5}$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * A temperature in °C as typed: an optional minus (also the typographic one), digits, and an
 * optional decimal part after a point or a comma
 * ("5." and ".5" are accepted). Empty is "no limit" (`undefined`); text
 * that is not a number is `null`.
 */
export function parseTemperature(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/−/g, '-').replace(',', '.');
  if (trimmed === '') return undefined;
  // "5." and ".5" are numbers too; a bare sign or point is not.
  return /^-?(\d{1,3}\.?|\d{0,3}\.\d{1,2}|\d{1,3}\.\d{1,2})$/.test(trimmed) ? Number(trimmed) : null;
}

/** Everything wrong with the form, by field; empty when it can be saved. */
export function validateForm(values: SensorFormValues): SensorFormErrors {
  const errors: SensorFormErrors = {};
  if (values.name.trim().length < 1) errors.name = tr('sensors.edit.nameRequired');
  else if (values.name.trim().length > NAME_MAX) errors.name = tr('sensors.edit.tooLong', { max: NAME_MAX });
  if (values.location.trim().length > LOCATION_MAX) errors.location = tr('sensors.edit.tooLong', { max: LOCATION_MAX });
  const minutes = parseMinutes(values.minutes);
  if (minutes === null || minutes < MINUTES_MIN || minutes > MINUTES_MAX) {
    errors.minutes = tr('sensors.edit.minutesInvalid', { min: MINUTES_MIN, max: MINUTES_MAX });
  }
  const lowest = parseTemperature(values.lowest);
  const highest = parseTemperature(values.highest);
  const outside = (value: number) => value < TEMPERATURE_MIN || value > TEMPERATURE_MAX;
  if (lowest === null || (lowest !== undefined && outside(lowest))) {
    errors.lowest = tr('sensors.edit.temperatureInvalid', { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX });
  }
  if (highest === null || (highest !== undefined && outside(highest))) {
    errors.highest = tr('sensors.edit.temperatureInvalid', { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX });
  }
  if (!errors.lowest && !errors.highest && lowest != null && highest != null && lowest >= highest) {
    errors.highest = tr('sensors.edit.limitsOrder');
  }
  return errors;
}

/** The limits of a form that passed `validateForm`: null where a field is empty. */
export function limitsOf(values: SensorFormValues): { min: number | null; max: number | null } {
  return { min: parseTemperature(values.lowest) ?? null, max: parseTemperature(values.highest) ?? null };
}

/** Whether a limit typed differs from the one the form started with; text that is not a number counts as typed. */
const limitChanged = (typed: string, original: string): boolean => {
  const now = parseTemperature(typed);
  const before = parseTemperature(original);
  return now === null || before === null ? typed.trim() !== original.trim() : now !== before;
};

/** Whether the limits typed differ from the ones the form started with. */
export function limitsChanged(values: SensorFormValues, original: SensorFormValues): boolean {
  return limitChanged(values.lowest, original.lowest) || limitChanged(values.highest, original.highest);
}

/** Whether anything differs from the sensor as it was opened (both sides trimmed, numbers compared as numbers). */
export function hasChanges(values: SensorFormValues, original: SensorFormValues): boolean {
  return (
    values.name.trim() !== original.name.trim() ||
    values.location.trim() !== original.location.trim() ||
    (parseMinutes(values.minutes) ?? values.minutes.trim()) !== (parseMinutes(original.minutes) ?? original.minutes.trim()) ||
    limitsChanged(values, original)
  );
}
