/**
 * The A–Z rail of the Customers list (style guide §14.1, G-21).
 *
 * `railKey(name)` is the rail entry a name belongs to: the first letter after
 * leading spaces, punctuation, symbols and emoji, with accents folded
 * ("Élan" -> E). A Gujarati letter is 'ગુ'; digits and anything else are '#'.
 * The list is sorted by this key, so every row can be reached from the rail.
 */

export const GUJARATI_KEY = 'ગુ';
export const OTHER_KEY = '#';

const A_TO_Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SKIPPED = new RegExp(
  '^(?:[\\p{P}\\p{S}\\p{Z}\\s]|\\p{Extended_Pictographic}|' + String.fromCharCode(0x200d) + '|' + String.fromCharCode(0xfe0f) + ')+',
  'u'
);

export function railKey(name: string | null | undefined): string {
  const trimmed = (name ?? '').replace(SKIPPED, '');
  if (!trimmed) return OTHER_KEY;
  const first = Array.from(trimmed)[0];
  const code = first.codePointAt(0) ?? 0;
  // Gujarati block: U+0A80 to U+0AFF.
  if (code >= 0x0a80 && code <= 0x0aff) return GUJARATI_KEY;
  const folded = first.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  return /^[A-Z]$/.test(folded) ? folded : OTHER_KEY;
}

const groupOrder = (key: string) =>
  key === OTHER_KEY ? 27 : key === GUJARATI_KEY ? 26 : A_TO_Z.indexOf(key);

/** Sort by rail group (A…Z, ગુ, #), then by name ignoring case and accents. */
export function sortForRail<T extends { name: string }>(rows: readonly T[]): T[] {
  return rows
    .map(row => ({ row, key: railKey(row.name) }))
    .sort((a, b) => {
      const byGroup = groupOrder(a.key) - groupOrder(b.key);
      if (byGroup !== 0) return byGroup;
      return a.row.name.localeCompare(b.row.name, 'en', { sensitivity: 'base' });
    })
    .map(entry => entry.row);
}

/** The rail: A–Z always, then 'ગુ' and '#' only when a name falls there. */
export function railLetters(available: ReadonlySet<string>): string[] {
  const letters = [...A_TO_Z];
  if (available.has(GUJARATI_KEY)) letters.push(GUJARATI_KEY);
  if (available.has(OTHER_KEY)) letters.push(OTHER_KEY);
  return letters;
}
