/**
 * Who has accepted the terms on this phone (docs/CENTRAL_LOGIN.md). The tick
 * box on central sign-in is asked of every mobile NUMBER once per terms
 * version, not of the phone: two people who share a device each see it on their
 * own first sign-in, and `terms_version` is only ever sent for a number whose
 * tick was given.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TERMS_VERSION } from './envConfig';

export const CENTRAL_TERMS_PREFIX = 'central_terms_accepted_v1:';

/** `91` and the ten digits, whatever form the number was typed in; '' when it is not a number. */
export const termsSubject = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return national.length === 10 ? `91${national}` : '';
};

export const termsKeyFor = (phone: string): string | null => {
  const subject = termsSubject(phone);
  return subject ? `${CENTRAL_TERMS_PREFIX}${subject}` : null;
};

/** True when this number has signed in on this phone under the current terms version. */
export async function hasAcceptedTerms(phone: string): Promise<boolean> {
  const key = termsKeyFor(phone);
  if (!key) return false;
  try {
    return (await AsyncStorage.getItem(key)) === TERMS_VERSION;
  } catch {
    return false;
  }
}

/** Called after a successful central sign-in: the tick is not asked of this number again. */
export async function recordTermsAccepted(phone: string): Promise<void> {
  const key = termsKeyFor(phone);
  if (!key) return;
  await AsyncStorage.setItem(key, TERMS_VERSION).catch(() => {});
}
