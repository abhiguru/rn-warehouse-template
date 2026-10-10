/**
 * The search rule of the list backends, for lists that are assembled in the app
 * (customer accounts on Dispatches and Invoices). It must stay the same as
 * `warehouse_security.search_terms` in the backend: the text is cut at 120
 * characters, split into at most eight words, and every word must be found,
 * whatever its case, in at least one of the columns.
 */
const MAX_LENGTH = 120;
const MAX_WORDS = 8;

/** The words of a search as the backend reads them, lower-cased. */
export const searchTerms = (query: string | null | undefined): string[] =>
  (query ?? '').slice(0, MAX_LENGTH).trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).map(word => word.toLowerCase());

/** True when every word is in at least one column. No words means no search: everything matches. */
export function matchesSearch(terms: string[], columns: (string | number | null | undefined)[]): boolean {
  if (terms.length === 0) return true;
  const haystacks = columns.filter(column => column !== null && column !== undefined).map(column => String(column).toLowerCase());
  return terms.every(term => haystacks.some(haystack => haystack.includes(term)));
}
