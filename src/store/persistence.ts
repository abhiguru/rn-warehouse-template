import type { PersistedState } from 'redux-persist';

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
    filter: saved.filter,
  } as PersistedState;
}
