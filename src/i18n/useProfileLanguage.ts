/**
 * The language belongs to the phone; the profile only carries a person's last
 * choice to a phone that has none (docs/I18N.md, "Language on this phone").
 *
 * - On sign-in with no choice on this phone ("Phone language"), the profile's
 *   language is taken, if it has one.
 * - On sign-in with a choice on this phone, that choice stays and nothing is
 *   read or written: on a shared phone, the next person does not inherit it
 *   into their profile, and the phone does not change under them.
 * - A change in Settings while signed in is saved to the profile, once.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectLanguagePreference, setLanguagePreference } from '@/store/slices/themeSlice';
import { fetchProfileLanguage, saveProfileLanguage } from './profileLanguage';
import type { LanguagePreference } from './language';

type AuthState = { auth: { userProfile?: { id?: string } | null } };

export function useProfileLanguage(): void {
  const dispatch = useAppDispatch();
  const preference = useAppSelector(selectLanguagePreference);
  // A profile in the store is what "signed in" means here (see useAuthGuard); a session
  // restored from saved tokens has no session object.
  const profileId = useAppSelector((state: AuthState) => state.auth.userProfile?.id);
  const last = useRef<{ profileId?: string; preference?: LanguagePreference }>({});
  // The language just taken from the profile: applying it is not a change to save back.
  const fromProfile = useRef<LanguagePreference | null>(null);

  useEffect(() => {
    const previous = last.current;
    last.current = { profileId, preference };
    if (!profileId) return;

    const signedIn = previous.profileId !== profileId;
    if (signedIn) {
      fromProfile.current = null;
      if (preference !== 'system') return undefined;
      let current = true;
      void fetchProfileLanguage().then(language => {
        if (!current || !language) return;
        fromProfile.current = language;
        dispatch(setLanguagePreference(language));
      });
      return () => {
        current = false;
      };
    }
    if (previous.preference !== preference) {
      const taken = fromProfile.current === preference;
      fromProfile.current = null;
      if (!taken) void saveProfileLanguage(preference);
    }
    return undefined;
  }, [dispatch, profileId, preference]);
}
