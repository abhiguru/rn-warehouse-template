/**
 * Reading the declared field blocks (WH-228) on a rendered screen: the focused input's nearest ancestor marked
 * `nativeID={FIELD_BLOCK_ID}` is the block the wizard bar keeps above itself. A marker test asserts that the block
 * exists, that it holds the group's message, and that it holds no other field.
 */
import type { screen } from '@testing-library/react-native';
import { FIELD_BLOCK_ID } from '@/hooks/useRevealFocusedField';

/** A rendered host element (Testing Library exports no name for the type). */
export type Host = ReturnType<typeof screen.getByRole>;

/**
 * The hook's reach: MAX_BLOCK_DEPTH in src/hooks/useRevealFocusedField.ts (not exported), counted in views, the way
 * the hook walks parentElement. Keep the two equal: a mark further up than this is one the reveal cannot reach.
 */
const MAX_BLOCK_DEPTH = 12;

/**
 * The nearest ancestor of `input` marked FIELD_BLOCK_ID within the hook's reach, or null. Testing Library's tree
 * holds host views only, which are the levels the hook counts.
 */
export function blockOf(input: Host): Host | null {
  let depth = 0;
  for (let node = input.parent; node; node = node.parent) {
    if (depth >= MAX_BLOCK_DEPTH) return null;
    depth++;
    if (node.props?.nativeID === FIELD_BLOCK_ID) return node;
  }
  return null;
}

/** The words shown in the block, one per Text. */
export function wordsIn(block: Host): string[] {
  return block
    .queryAll((node) => node.type === 'Text')
    .map((node) => node.children.filter((part) => typeof part === 'string').join(''));
}

/** How many text inputs the block holds (a block holds one field, never the next one). */
export function inputsIn(block: Host): number {
  return block.queryAll((node) => node.type === 'TextInput').length;
}
