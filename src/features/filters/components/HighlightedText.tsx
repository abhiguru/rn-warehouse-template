/**
 * Text with every searched word in bold (docs/STYLE_GUIDE.md §14.6: "results
 * highlight the match in bold", never by colour alone).
 */
import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { fontWeight } from '@/theme/tokens';

/** The words of a search, lower-cased, for matching. */
export const searchWords = (text: string | undefined): string[] =>
  (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);

/** Start and end of every match of any word, merged and in order. */
export function matchRanges(text: string, words: string[]): [number, number][] {
  const haystack = text.toLowerCase();
  const found: [number, number][] = [];
  for (const word of words) {
    if (!word) continue;
    let from = haystack.indexOf(word);
    while (from !== -1) {
      found.push([from, from + word.length]);
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
