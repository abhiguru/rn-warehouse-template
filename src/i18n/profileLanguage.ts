/**
 * The language choice kept on the person's profile at the facility, so a new
 * phone or a fresh install starts in the language they chose.
 *
 * Both calls are best effort: a facility whose server does not have them yet, or
 * a phone that is offline, simply keeps the choice on the phone.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type { AppLanguage, LanguagePreference } from './language';

/** The language saved on the signed-in person's profile; undefined when none or not known. */
export async function fetchProfileLanguage(): Promise<AppLanguage | undefined> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('get_my_language');
    if (error) return undefined;
    const language = (data as { language?: unknown } | null)?.language;
    return language === 'en' || language === 'gu' ? language : undefined;
  } catch {
    return undefined;
  }
}

/** Saves the choice on the profile; "Phone language" clears it. True when the server kept it. */
export async function saveProfileLanguage(preference: LanguagePreference): Promise<boolean> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('set_my_language', {
      p_language: preference === 'system' ? null : preference,
    });
    return !error && (data as { success?: unknown } | null)?.success === true;
  } catch {
    return false;
  }
}
