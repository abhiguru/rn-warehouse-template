/**
 * What a lot of an item is counted in. Packaging is free text on the item; Bag, Box and Crate are named as such
 * ("Boxes to dispatch", "₹6.00 per box"), anything else, or nothing, stays "bag".
 */
import { countNoun, formatCount } from '@/utils/formatters';

export type PackagingWord = 'bag' | 'box' | 'crate';

const PLURALS: Record<PackagingWord, string> = { bag: 'bags', box: 'boxes', crate: 'crates' };

/** The word for an item's packaging: its own for Bag, Box and Crate (any case, with or without a final "s"), else "bag". */
export function packagingWord(packaging: string | null | undefined): PackagingWord {
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
