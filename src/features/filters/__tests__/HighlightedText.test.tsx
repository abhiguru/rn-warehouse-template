import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { fontWeight } from '@/theme/tokens';
import { HighlightedText, matchRanges, matchesAnyWord, searchWords, wholeClusters } from '../components/HighlightedText';

/**
 * The pieces of the rendered text, with which of them are bold. No query reports which part of one Text is bold, so this
 * walks the children of the rendered outer Text.
 */
async function pieces(text: string, words?: string[]): Promise<{ text: string; bold: boolean }[]> {
  await render(<HighlightedText text={text} words={words} />);
  const outer = screen.toJSON();
  if (!outer || Array.isArray(outer)) throw new Error('expected one outer Text');
  const result = (outer.children ?? []).map(child =>
    typeof child === 'string'
      ? { text: child, bold: false }
      : { text: (child.children ?? []).join(''), bold: StyleSheet.flatten(child.props.style)?.fontWeight === fontWeight.bold }
  );
  await screen.unmount();
  return result;
}

describe('search words', () => {
  it('splits on spaces and lower-cases', () => {
    expect(searchWords('  Lakeview   GARLIC ')).toEqual(['lakeview', 'garlic']);
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });
});

describe('match ranges', () => {
  it('finds every occurrence of every word, whatever the case', () => {
    expect(matchRanges('Garlic and garlic', ['garlic'])).toEqual([[0, 6], [11, 17]]);
    expect(matchRanges('Lakeview Spices', ['spice', 'lake'])).toEqual([[0, 4], [9, 14]]);
  });

  it('merges matches that overlap or touch', () => {
    expect(matchRanges('DV0198', ['dv01', '0198'])).toEqual([[0, 6]]);
    expect(matchRanges('abcd', ['ab', 'cd'])).toEqual([[0, 4]]);
  });

  it('finds nothing for no words, an empty word or no match', () => {
    expect(matchRanges('Garlic', [])).toEqual([]);
    expect(matchRanges('Garlic', [''])).toEqual([]);
    expect(matchRanges('Garlic', ['onion'])).toEqual([]);
  });

  it('tells whether a text matches any word', () => {
    expect(matchesAnyWord('Rack B7', ['b7'])).toBe(true);
    expect(matchesAnyWord('Rack B7', ['c1'])).toBe(false);
    expect(matchesAnyWord(null, ['b7'])).toBe(false);
    expect(matchesAnyWord('', ['b7'])).toBe(false);
  });
});

describe('HighlightedText', () => {
  it('puts every matched word in bold and leaves the rest plain', async () => {
    expect(await pieces('Lakeview Spices, Garlic', ['garlic', 'lake'])).toEqual([
      { text: 'Lake', bold: true },
      { text: 'view Spices, ', bold: false },
      { text: 'Garlic', bold: true },
    ]);
  });

  it('keeps the original capitals of the matched text', async () => {
    expect(await pieces('GARLIC paste', ['garlic'])).toEqual([
      { text: 'GARLIC', bold: true },
      { text: ' paste', bold: false },
    ]);
  });

  it('renders the text unchanged when nothing matches or there is no search', async () => {
    expect(await pieces('Garlic', ['onion'])).toEqual([{ text: 'Garlic', bold: false }]);
    expect(await pieces('Garlic', [])).toEqual([{ text: 'Garlic', bold: false }]);
    expect(await pieces('Garlic')).toEqual([{ text: 'Garlic', bold: false }]);
  });
});

describe('Gujarati text', () => {
  it('never cuts a letter from the vowel signs drawn on it', async () => {
    // બ ટ ા ક ા: "બટ" ends between ટ and its vowel sign, so the match grows to "બટા".
    expect(matchRanges('બટાકા', ['બટ'])).toEqual([[0, 3]]);
    expect(await pieces('બટાકા', ['બટ'])).toEqual([
      { text: 'બટા', bold: true },
      { text: 'કા', bold: false },
    ]);
    // A whole match is left as it is.
    expect(matchRanges('બટાકા', ['બટા'])).toEqual([[0, 3]]);
    expect(matchRanges('લસણ', ['લસ'])).toEqual([[0, 2]]);
  });

  it('keeps a conjunct together', async () => {
    // ઑ ર ્ ડ ર: ર + virama + ડ is one shape, whichever half was typed.
    expect(await pieces('ઑર્ડર', ['ઑર'])).toEqual([
      { text: 'ઑર્ડ', bold: true },
      { text: 'ર', bold: false },
    ]);
    expect(await pieces('ઑર્ડર', ['ડ'])).toEqual([
      { text: 'ઑ', bold: false },
      { text: 'ર્ડ', bold: true },
      { text: 'ર', bold: false },
    ]);
    // ક ્ ષ with a zero-width joiner in between.
    expect(wholeClusters('ક્\u200dષા', 0, 1)).toEqual([0, 5]);
  });

  it('takes nukta, anusvara, candrabindu and visarga with their letter', () => {
    expect(matchRanges('ડુંગળી', ['ડ'])).toEqual([[0, 3]]);
    expect(matchRanges('મરચાં લાલ', ['ચ'])).toEqual([[2, 5]]);
    expect(matchRanges('દુઃખ', ['દ'])).toEqual([[0, 3]]);
  });

  it('grows a match that starts on a sign back to its letter', () => {
    expect(matchRanges('બટાકા', ['ાક'])).toEqual([[1, 5]]);
  });

  it('leaves Latin text and mixed text exact', () => {
    expect(matchRanges('Garlic લસણ', ['gar', 'લ'])).toEqual([[0, 3], [7, 8]]);
    expect(wholeClusters('Garlic', 0, 3)).toEqual([0, 3]);
  });
});
