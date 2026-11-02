/**
 * What a lot of an item is counted in. Packaging is free text on the item and the word is the item's own, as entered
 * (WH-41): Bag, Box and Crate are named as such ("12 boxes", "₹6.00 per box", "નંગ" in Gujarati); any other word
 * ("Katta", "Trey", "Unit") shows as typed, with no plural and no translation; no word at all reads "bag".
 * Outer spaces and invisible characters (U+FEFF, U+2007, U+202F, no-break space) never change the word, and the
 * match ignores case. The server follows the same rule (`warehouse_security.shared_packaging`, migration 144).
 */
import { countNoun, formatCount, indianNumber } from '@/utils/formatters';

export type PackagingWord = 'bag' | 'box' | 'crate' | 'unit' | 'custom';

const PLURALS: Record<'bag' | 'box' | 'crate' | 'unit', string> = { bag: 'bags', box: 'boxes', crate: 'crates', unit: 'units' };

/**
 * Stands for "counted in different things" in a total over lines (see sharedPackaging). It is not packaging text an item
 * can have, so an item's own "Unit" is its own word, shown as typed.
 */
export const MIXED_PACKAGING = '\u0000mixed';

/** The word without its outer spaces and invisible characters (JavaScript's trim() removes all of them). */
export const cleanPackaging = (packaging: string | null | undefined): string => (packaging ?? '').trim();

/** The kind of word, and for a word of the item's own (`custom`) the text to show. */
function resolve(packaging: string | null | undefined): { word: PackagingWord; text: string; key: string } {
  if (packaging === MIXED_PACKAGING) return { word: 'unit', text: 'unit', key: 'unit' };
  const text = cleanPackaging(packaging);
  const key = text.toLowerCase();
  if (key === '' || /^bags?$/.test(key)) return { word: 'bag', text: 'bag', key: 'bag' };
  if (/^box(es)?$/.test(key)) return { word: 'box', text: 'box', key: 'box' };
  if (/^crates?$/.test(key)) return { word: 'crate', text: 'crate', key: 'crate' };
  return { word: 'custom', text, key };
}

/** Which word an item's packaging is: bag, box, crate, unit (a mixed total) or custom (the item's own word, shown as typed). */
export function packagingWord(packaging: string | null | undefined): PackagingWord {
  return resolve(packaging).word;
}

/** The word to show for an item's packaging: Bag, Box or Crate (a blank word is Bag), else the word as typed. */
export const displayPackaging = (packaging: string | null | undefined): string => {
  const { word, text } = resolve(packaging);
  return word === 'custom' ? text : word === 'unit' ? '' : text.charAt(0).toUpperCase() + text.slice(1);
};

/** An item's name with its own word beside it, "Egg \u00B7 Trey" ("Egg \u00B7 Bag" for a blank word; just the name for a mixed total). */
export const itemWithPackaging = (name: string, packaging: string | null | undefined): string => {
  const word = displayPackaging(packaging);
  return word ? `${name} \u00B7 ${word}` : name;
};

/** The word to put beside an item's name when the lots show it: the shared word (a blank word is Bag), nothing when the lots differ. */
export const itemWordOfLots = (packagings: ReadonlyArray<string | null | undefined>): string | undefined => sharedPackaging(packagings);

/** "1 box", "12 boxes", "12 Katta" (a word of the item's own has no plural), in the language of the app. */
export const formatPackages = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const { word, text } = resolve(packaging);
  if (word === 'custom') return `${indianNumber(count === null || count === undefined || isNaN(count) ? 0 : count)} ${text}`;
  return formatCount(count, word, PLURALS[word]);
};

/** The noun after "per": "box", "bag" (singular), in the language of the app. */
export const packageUnit = (packaging: string | null | undefined): string => {
  const { word, text } = resolve(packaging);
  return word === 'custom' ? text : countNoun(1, word);
};

/** The plural noun alone, as in "Enter boxes": "bags", "boxes", "crates" (the Gujarati word does not change). */
export const packNoun = (packaging: string | null | undefined): string => {
  const { word, text } = resolve(packaging);
  return word === 'custom' ? text : countNoun(2, word, PLURALS[word]);
};

/** The same with a capital letter, to start a label: "Boxes to dispatch". */
export const packNounCapital = (packaging: string | null | undefined): string => {
  const noun = packNoun(packaging);
  // A word of the item's own is shown as typed.
  return packagingWord(packaging) === 'custom' ? noun : noun.charAt(0).toUpperCase() + noun.slice(1);
};

/** The noun alone, singular for exactly 1: "bag", "boxes". */
export const packNounFor = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const { word, text } = resolve(packaging);
  return word === 'custom' ? text : countNoun(count, word, PLURALS[word]);
};

/** The noun to head a count column or chip, with a capital letter and the number in mind: "Bag", "Boxes". */
export const packLabel = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const noun = packNounFor(count, packaging);
  return packagingWord(packaging) === 'custom' ? noun : noun.charAt(0).toUpperCase() + noun.slice(1);
};

/**
 * The packaging a total can be counted in: the one word all the lines share ("bag" and a blank line are the same word; the
 * spelling of a word of the item's own is the smallest one), MIXED_PACKAGING ("units") when the lines are counted in
 * different things, and undefined (counted as bags) when there are no lines.
 */
export const sharedPackaging = (packagings: ReadonlyArray<string | null | undefined>): string | undefined => {
  if (packagings.length === 0) return undefined;
  const first = resolve(packagings[0]);
  if (first.word === 'unit') return MIXED_PACKAGING;
  let shown = first.text;
  for (const packaging of packagings) {
    const next = resolve(packaging);
    if (next.key !== first.key || next.word === 'unit') return MIXED_PACKAGING;
    if (next.text < shown) shown = next.text;
  }
  return shown;
};
