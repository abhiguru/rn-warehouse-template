import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { fontWeight } from '@/theme/tokens';
import { HighlightedText, matchRanges, matchesAnyWord, searchWords } from '../components/HighlightedText';

/** The pieces of the rendered text, with which of them are bold. */
function pieces(text: string, words?: string[]): { text: string; bold: boolean }[] {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HighlightedText text={text} words={words} />);
  });
  const outer = renderer.root.findAllByType(Text)[0];
  const children = React.Children.toArray(outer.props.children) as (string | React.ReactElement<{ children: string; style?: { fontWeight?: string } }>)[];
  const result = children.map(child =>
    typeof child === 'string'
      ? { text: child, bold: false }
      : { text: child.props.children, bold: child.props.style?.fontWeight === fontWeight.bold }
  );
  act(() => renderer.unmount());
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
  it('puts every matched word in bold and leaves the rest plain', () => {
    expect(pieces('Lakeview Spices, Garlic', ['garlic', 'lake'])).toEqual([
      { text: 'Lake', bold: true },
      { text: 'view Spices, ', bold: false },
      { text: 'Garlic', bold: true },
    ]);
  });

  it('keeps the original capitals of the matched text', () => {
    expect(pieces('GARLIC paste', ['garlic'])).toEqual([
      { text: 'GARLIC', bold: true },
      { text: ' paste', bold: false },
    ]);
  });

  it('renders the text unchanged when nothing matches or there is no search', () => {
    expect(pieces('Garlic', ['onion'])).toEqual([{ text: 'Garlic', bold: false }]);
    expect(pieces('Garlic', [])).toEqual([{ text: 'Garlic', bold: false }]);
    expect(pieces('Garlic')).toEqual([{ text: 'Garlic', bold: false }]);
  });
});
