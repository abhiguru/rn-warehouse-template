/**
 * The language in effect, from the choice saved in Settings (or the phone's
 * language when the choice is "System"). It sets the language for formatters and
 * `t` while rendering, before any child reads it.
 */
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectLanguagePreference, setLanguagePreference } from '@/store/slices/themeSlice';
import { resolveLanguage, setLanguage, type AppLanguage, type LanguagePreference } from './language';

export function useAppLanguage(): {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference: (next: LanguagePreference) => void;
} {
  const dispatch = useAppDispatch();
  const preference = useAppSelector(selectLanguagePreference);
  const language = resolveLanguage(preference);
  // Formatters and `t` are plain functions: give them the language now, not in an effect,
  // so the first render after a change is already in the new language.
  setLanguage(language);
  return { language, preference, setPreference: next => dispatch(setLanguagePreference(next)) };
}
