/**
 * The name this phone gives itself (WH-410): maker and model from React Native's `Platform.constants`, for example
 * "Samsung SM-A156E". Sent with `hold_items` so the holding list can say which phone a held item came from.
 *
 * Android has `Manufacturer` (or `Brand`) and `Model`. iOS has no model in `Platform.constants`, so there is no real name and
 * the answer is null: the Phone fact is then left out, never a guess. Nothing personal is read (no device name the owner typed).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** "samsung" and "SAMSUNG" read as "Samsung"; a maker already written in mixed case ("OnePlus") stays as it is. */
const makerAsRead = (maker: string): string =>
  maker === maker.toLowerCase() || maker === maker.toUpperCase() ? maker.charAt(0).toUpperCase() + maker.slice(1).toLowerCase() : maker;

/** One random value per installation, made on first need. Not tied to a person, a session or a facility; gone with an uninstall. */
export const INSTALL_MARK_KEY = 'install_mark_v1';
const MARK_LENGTH = 4;

/**
 * The install mark: the first 4 hex characters, upper case, of the random id kept under `install_mark_v1`. Nothing is cached in
 * module state (so nothing for the session registry), and the key matches no sign-out, delete-account or cache clearing, so the mark
 * survives sign-out and a facility switch. Null when the storage cannot be read or written.
 */
async function installMark(): Promise<string | null> {
  try {
    let id = await AsyncStorage.getItem(INSTALL_MARK_KEY);
    if (id === null || !/^[0-9a-f-]{8,}$/i.test(id)) {
      id = Crypto.randomUUID();
      await AsyncStorage.setItem(INSTALL_MARK_KEY, id);
    }
    return id.slice(0, MARK_LENGTH).toUpperCase();
  } catch {
    return null;
  }
}

/** The maker and model of this phone, with its install mark in brackets ("Samsung SM-A156E (7F3A)"); null without a model. */
export async function phoneDisplayName(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const constants = Platform.constants as unknown as Record<string, unknown>;
  const model = textOf(constants.Model);
  if (model === null) return null;
  const maker = textOf(constants.Manufacturer) ?? textOf(constants.Brand);
  const name = maker === null || model.toLowerCase().startsWith(maker.toLowerCase()) ? model : `${makerAsRead(maker)} ${model}`;
  const mark = await installMark();
  return mark === null ? name : `${name} (${mark})`;
}
