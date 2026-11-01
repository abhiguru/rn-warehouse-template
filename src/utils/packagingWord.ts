/**
 * What a lot of an item is counted in. Packaging is free text on the item; Bag, Box and Crate are named as such
 * ("Boxes to dispatch", "₹6.00 per box"), anything else, or nothing, stays "bag".
 */
import { countNoun, formatCount } from '@/utils/formatters';

export type PackagingWord = 'bag' | 'box' | 'crate' | 'unit';

const PLURALS: Record<PackagingWord, string> = { bag: 'bags', box: 'boxes', crate: 'crates', unit: 'units' };

/**
 * Stands for "counted in different things" in a total over lines (see sharedPackaging). It is not packaging text an item
 * can have, so an item's own "Unit"/"Units" stays "bag" on per-item texts.
 */
export const MIXED_PACKAGING = '\u0000mixed';

/** The word for an item's packaging: its own for Bag, Box and Crate (any case, with or without a final "s"), else "bag". */
export function packagingWord(packaging: string | null | undefined): PackagingWord {
  if (packaging === MIXED_PACKAGING) return 'unit';
  const key = (packaging ?? '').trim().toLowerCase();
  if (/^bags?$/.test(key)) return 'bag';
  if (/^box(es)?$/.test(key)) return 'box';
  if (/^crates?$/.test(key)) return 'crate';
  return 'bag';
}

/** "1 box", "12 boxes" ("12 bags" for other packaging), in the language of the app. */
export const formatPackages = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const word = packagingWord(packaging);
  return formatCount(count, word, PLURALS[word]);
};

/** The noun after "per": "box", "bag" (singular), in the language of the app. */
export const packageUnit = (packaging: string | null | undefined): string => countNoun(1, packagingWord(packaging));

/** The plural noun alone, as in "Enter boxes": "bags", "boxes", "crates" (the Gujarati word does not change). */
export const packNoun = (packaging: string | null | undefined): string => {
  const word = packagingWord(packaging);
  return countNoun(2, word, PLURALS[word]);
};

/** The same with a capital letter, to start a label: "Boxes to dispatch". */
export const packNounCapital = (packaging: string | null | undefined): string => {
  const noun = packNoun(packaging);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
};

/** The noun alone, singular for exactly 1: "bag", "boxes". */
export const packNounFor = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const word = packagingWord(packaging);
  return countNoun(count, word, PLURALS[word]);
};

/** The noun to head a count column or chip, with a capital letter and the number in mind: "Bag", "Boxes". */
export const packLabel = (count: number | null | undefined, packaging: string | null | undefined): string => {
  const noun = packNounFor(count, packaging);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
};

/**
 * The packaging a total can be counted in: the one word all the lines share, MIXED_PACKAGING ("units") when the lines are counted in
 * different things, and undefined (counted as bags) when there are no lines.
 */
export const sharedPackaging = (packagings: ReadonlyArray<string | null | undefined>): string | undefined => {
  if (packagings.length === 0) return undefined;
  const first = packagingWord(packagings[0]);
  // 'unit' only comes from MIXED_PACKAGING (an item's own "Unit" reads bag), so all-mixed stays mixed.
  return first !== 'unit' && packagings.every(p => packagingWord(p) === first) ? first : MIXED_PACKAGING;
};
