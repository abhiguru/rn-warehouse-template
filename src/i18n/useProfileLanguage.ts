/**
 * Keeps the language choice on the phone and on the person's profile in step.
 *
 * - On sign-in with no choice on this phone ("Phone language"), the profile's
 *   language is taken, if it has one.
 * - On sign-in with a choice on this phone, that choice is saved to the profile.
 * - A change in Settings while signed in is saved to the profile.
 */
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectLanguagePreference, setLanguagePreference } from '@/store/slices/themeSlice';
import { fetchProfileLanguage, saveProfileLanguage } from './profileLanguage';
import type { LanguagePreference } from './language';

type AuthState = { auth: { session?: unknown; userProfile?: { id?: string } | null } };

export function useProfileLanguage(): void {
  const dispatch = useAppDispatch();
  const preference = useAppSelector(selectLanguagePreference);
  const profileId = useAppSelector((state: AuthState) =>
    state.auth.session ? state.auth.userProfile?.id : undefined
  );
  const last = useRef<{ profileId?: string; preference?: LanguagePreference }>({});

  useEffect(() => {
    const previous = last.current;
    last.current = { profileId, preference };
    if (!profileId) return;

    const signedIn = previous.profileId !== profileId;
    if (signedIn && preference === 'system') {
      let current = true;
      void fetchProfileLanguage().then(language => {
        if (current && language) dispatch(setLanguagePreference(language));
      });
      return () => {
        current = false;
      };
    }
    if (signedIn || previous.preference !== preference) {
      void saveProfileLanguage(preference);
    }
    return undefined;
  }, [dispatch, profileId, preference]);
}
