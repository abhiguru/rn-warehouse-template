/** G-56: packaging words this facility already uses, grouped by spelling, and saved in one spelling. */
import { MAX_PACKAGING_SUGGESTIONS, normalizePackaging, packagingGroups, packagingSuggestions } from '../packagingSuggestions';

const VALUES = ['Bag', 'Bag', 'bag', 'Box', 'Bags', ''];

describe('packagingSuggestions', () => {
  it('orders the words by how often they are used, ties A to Z, one spelling per word', () => {
    // 'bag' is used 3 times (Bag twice, bag once): "Bag" is the most used spelling.
    // 'Bags' and 'Box' are used once each: A to Z puts Bags first.
    expect(packagingSuggestions(VALUES)).toEqual(['Bag', 'Bags', 'Box']);
  });

  it('leaves out empty values and values that are only spaces', () => {
    expect(packagingSuggestions(['', '   ', null, undefined])).toEqual([]);
  });

  it('keeps at most six chips', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    expect(MAX_PACKAGING_SUGGESTIONS).toBe(6);
    expect(packagingSuggestions(many)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('writes a typed word in the spelling the facility already uses', () => {
    const groups = packagingGroups(VALUES);
    expect(normalizePackaging(' bag ', groups)).toBe('Bag');
    expect(normalizePackaging('BOX', groups)).toBe('Box');
    expect(normalizePackaging('Crate', groups)).toBe('Crate');
    expect(normalizePackaging('   ', groups)).toBe('');
  });
});
