/**
 * Types of the translation tables.
 *
 * A text is a string, or a pair `{ one, other }` chosen by the `count` parameter.
 * Placeholders are written `{{name}}`.
 */
export interface Plural {
  one: string;
  other: string;
}

/**
 * The shape another language may have: the same keys, text for text and plural for plural, but a key may be missing
 * (the app then shows the English text; `npm run i18n:release-check` fails a release while any is missing).
 * A key that English does not have, or a text of the wrong kind, is still a compile error.
 */
export type Translation<T> = {
  [K in keyof T]?: T[K] extends string ? string : T[K] extends Plural ? Plural : Translation<T[K]>;
};

/** The same shape with every key present: the type other code sees for the Gujarati table. */
export type FullTranslation<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : FullTranslation<T[K]>;
};

/** Every key path that ends in a text: "filters.clearAll", "grn.list.title". */
export type KeyPath<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${Prefix}${K}` : KeyPath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationParams = Record<string, string | number | null | undefined>;
