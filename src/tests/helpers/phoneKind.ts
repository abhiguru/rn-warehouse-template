/**
 * WH-411: makes the phone under test an Android phone with a model, one whose storage cannot keep the install mark, or an
 * iPhone, by faking only the native edges (`Platform` and the storage of `install_mark_v1`). Returns the undo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type PhoneKind = 'android, no mark kept' | 'android' | 'ios';

/** In this order: a mark once made is kept while the app runs, so the storage failure must come first in a file. */
export const SIGN_IN_PHONES: readonly [PhoneKind, RegExp | null][] = [
  ['android, no mark kept', /^Samsung SM-A156E$/],
  ['android', /^Samsung SM-A156E \([0-9A-F]{4}\)$/],
  ['ios', null],
];

export function asPhone(kind: PhoneKind): () => void {
  const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  const constants = Object.getOwnPropertyDescriptor(Platform, 'constants')!;
  const getItem = jest.mocked(AsyncStorage.getItem);
  const real = getItem.getMockImplementation()!;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => (kind === 'ios' ? 'ios' : 'android') });
  Object.defineProperty(Platform, 'constants', { configurable: true, get: () => ({ Manufacturer: 'samsung', Model: 'SM-A156E' }) });
  if (kind === 'android, no mark kept') {
    getItem.mockImplementation(async (key, ...rest) => {
      if (key === 'install_mark_v1') throw new Error('disk I/O error');
      return real(key, ...rest);
    });
  }
  return () => {
    Object.defineProperty(Platform, 'OS', os);
    Object.defineProperty(Platform, 'constants', constants);
    getItem.mockImplementation(real);
  };
}
