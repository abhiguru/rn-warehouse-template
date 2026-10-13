/**
 * The last searches of each list, offered when its search field is focused and
 * empty. Module state: gone when the app closes, and forgotten whenever a
 * session ends (clearSessionScopedState), because a search names customers and
 * items of the facility and the person who typed it.
 *
 * Kept apart from the search field so the session teardown can reach it
 * without loading a component.
 *
 * The key is the list's recent key (`recentSearchKey` in ./useListFilters):
 * the list key, or the list key and its scope (`report-grn-activity-customer:c-1`)
 * for a list whose search is kept per customer, so one customer's searches are
 * not offered on another's report.
 */
export const SEARCH_MIN_LENGTH = 2;
const RECENT_LIMIT = 5;

/** By recent key. */
const recentByList = new Map<string, string[]>();

export function rememberSearch(recentKey: string, text: string) {
  const trimmed = text.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return;
  const others = (recentByList.get(recentKey) ?? []).filter(entry => entry.toLowerCase() !== trimmed.toLowerCase());
  recentByList.set(recentKey, [trimmed, ...others].slice(0, RECENT_LIMIT));
}
export const recentSearches = (recentKey: string) => recentByList.get(recentKey) ?? [];
export const forgetRecentSearches = () => recentByList.clear();
