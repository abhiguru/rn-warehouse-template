import type { PersistedState } from 'redux-persist';
import { sanitizeReportPrefs } from './slices/reportPrefsSlice';

// A write whitelist does not filter older state during rehydration.
// Restore preferences only; SecureStore is the source of session identity.
export async function restorePreferences(
  state: PersistedState
): Promise<PersistedState> {
  if (!state) return state;
  const saved = state as PersistedState & Record<string, unknown>;
  return {
    _persist: state._persist,
    theme: saved.theme,
    // Only when something was stored: a key that is present but undefined would
    // replace the slice's initial state with undefined. What was stored is
    // checked part by part, never taken as it is.
    ...(saved.reportPrefs === undefined ? {} : { reportPrefs: sanitizeReportPrefs(saved.reportPrefs) }),
  } as PersistedState;
}
