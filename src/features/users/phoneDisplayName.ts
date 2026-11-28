/**
 * The name this phone gives itself (WH-410): maker and model from React Native's `Platform.constants`, for example
 * "Samsung SM-A156E". Sent with `hold_items` so the holding list can say which phone a held item came from.
 *
 * Android has `Manufacturer` (or `Brand`) and `Model`. iOS has no model in `Platform.constants`, so there is no real name and
 * the answer is null: the Phone fact is then left out, never a guess. Nothing personal is read (no device name the owner typed).
 */
import { Platform } from 'react-native';

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** "samsung" and "SAMSUNG" read as "Samsung"; a maker already written in mixed case ("OnePlus") stays as it is. */
const makerAsRead = (maker: string): string =>
  maker === maker.toLowerCase() || maker === maker.toUpperCase() ? maker.charAt(0).toUpperCase() + maker.slice(1).toLowerCase() : maker;

/** The maker and model of this phone, or null when the platform does not say (iOS, or an Android that reports no model). */
export function phoneDisplayName(): string | null {
  if (Platform.OS !== 'android') return null;
  const constants = Platform.constants as unknown as Record<string, unknown>;
  const model = textOf(constants.Model);
  if (model === null) return null;
  const maker = textOf(constants.Manufacturer) ?? textOf(constants.Brand);
  if (maker === null || model.toLowerCase().startsWith(maker.toLowerCase())) return model;
  return `${makerAsRead(maker)} ${model}`;
}
