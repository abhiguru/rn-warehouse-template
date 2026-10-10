/**
 * Text with every searched word in bold (docs/STYLE_GUIDE.md §14.6: "results
 * highlight the match in bold", never by colour alone).
 */
import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { normalizeDigits } from '@/i18n/language';
import { fontWeight } from '@/theme/tokens';

/** The words of a search, lower-cased and with ૦-૯ read as 0-9 (as the search itself reads them), for matching. */
export const searchWords = (text: string | undefined): string[] =>
  normalizeDigits(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);

const VIRAMA = 0x0acd;
const ZERO_WIDTH_NON_JOINER = 0x200c;
const ZERO_WIDTH_JOINER = 0x200d;

/**
 * A Gujarati sign that is drawn on the letter before it: nukta, the vowel signs
 * and the virama (U+0ABC to U+0ACD, without the avagraha U+0ABD, which stands
 * alone), and candrabindu, anusvara and visarga (U+0A81 to U+0A83).
 */
const isGujaratiSign = (code: number) =>
  (code >= 0x0abc && code <= 0x0acd && code !== 0x0abd) || (code >= 0x0a81 && code <= 0x0a83);
const isGujaratiConsonant = (code: number) => code >= 0x0a95 && code <= 0x0ab9;
const isJoiner = (code: number) => code === ZERO_WIDTH_JOINER || code === ZERO_WIDTH_NON_JOINER;

/** Whether the character at `index` is drawn as part of the one before it: a sign, or a consonant joined by a virama. */
function continuesCluster(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const code = text.charCodeAt(index);
  if (isGujaratiSign(code)) return true;
  const before = text.charCodeAt(index - 1);
  if (isJoiner(code)) return before === VIRAMA;
  if (before === VIRAMA) return isGujaratiConsonant(code);
  // A consonant after virama + joiner ("ક્‍ષ") still belongs to the conjunct.
  return isJoiner(before) && index >= 2 && text.charCodeAt(index - 2) === VIRAMA && isGujaratiConsonant(code);
}

/**
 * Widen a match to whole letters as they are drawn. A Gujarati letter with its
 * vowel signs, or a conjunct ("ર્ડ" in "ઑર્ડર"), is one shape: making half of
 * it bold would break it apart on screen. "બટ" in "બટાકા" becomes "બટા".
 */
export function wholeClusters(text: string, from: number, to: number): [number, number] {
  let start = from;
  let end = to;
  while (start > 0 && continuesCluster(text, start)) start -= 1;
  while (end < text.length && continuesCluster(text, end)) end += 1;
  return [start, end];
}

/** Start and end of every match of any word, widened to whole letters, merged and in order. */
export function matchRanges(text: string, words: string[]): [number, number][] {
  const haystack = text.toLowerCase();
  const found: [number, number][] = [];
  for (const word of words) {
    if (!word) continue;
    let from = haystack.indexOf(word);
    while (from !== -1) {
      found.push(wholeClusters(text, from, from + word.length));
      from = haystack.indexOf(word, from + word.length);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

export const matchesAnyWord = (text: string | null | undefined, words: string[]) =>
  Boolean(text) && matchRanges(text as string, words).length > 0;

export interface HighlightedTextProps extends TextProps {
  text: string;
  /** Lower-cased search words (see `searchWords`). */
  words?: string[];
  style?: StyleProp<TextStyle>;
}

const BOLD: TextStyle = { fontWeight: fontWeight.bold };

export function HighlightedText({ text, words, style, ...rest }: HighlightedTextProps) {
  const ranges = words && words.length > 0 ? matchRanges(text, words) : [];
  if (ranges.length === 0) return <Text style={style} {...rest}>{text}</Text>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([from, to], index) => {
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(<Text key={index} style={BOLD}>{text.slice(from, to)}</Text>);
    cursor = to;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Text style={style} {...rest}>{parts}</Text>;
}

export default HighlightedText;
