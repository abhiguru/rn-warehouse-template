/**
 * The last searches of each list, offered when its search field is focused and
 * empty. Module state: gone when the app closes, and forgotten whenever a
 * session ends (clearSessionScopedState), because a search names customers and
 * items of the facility and the person who typed it.
 *
 * Kept apart from the search field so the session teardown can reach it
 * without loading a component.
 */
export const SEARCH_MIN_LENGTH = 2;
const RECENT_LIMIT = 5;

const recentByList = new Map<string, string[]>();

export function rememberSearch(listKey: string, text: string) {
  const trimmed = text.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return;
  const others = (recentByList.get(listKey) ?? []).filter(entry => entry.toLowerCase() !== trimmed.toLowerCase());
  recentByList.set(listKey, [trimmed, ...others].slice(0, RECENT_LIMIT));
}
export const recentSearches = (listKey: string) => recentByList.get(listKey) ?? [];
export const forgetRecentSearches = () => recentByList.clear();
