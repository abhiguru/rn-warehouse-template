/**
 * Text typed by a person, made safe to put into a PostgREST filter.
 *
 * In a LIKE pattern `%` and `_` are wildcards and `\` escapes them. In an
 * `or=(...)` list, commas, brackets, dots and colons are syntax unless the
 * value is in double quotes. Both are data when they come from a search box.
 * (`*` cannot be escaped: PostgREST reads it as `%` in every LIKE pattern.)
 */

/** The text as a literal inside a LIKE pattern. */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

/** A pattern that matches rows containing the text, for `.like()` / `.ilike()`. */
export const containsPattern = (text: string): string => `%${escapeLike(text)}%`;

/** A value for one condition of an `.or()` list, quoted so its punctuation is data. */
export const quoteFilterValue = (value: string): string => `"${value.replace(/[\\"]/g, '\\$&')}"`;

/** `column.ilike."%text%"` for an `.or()` list. */
export const orContains = (column: string, text: string): string =>
  `${column}.ilike.${quoteFilterValue(containsPattern(text))}`;
