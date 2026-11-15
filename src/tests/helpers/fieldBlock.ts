/**
 * Reading the declared field blocks (WH-228) on a rendered screen: the focused input's nearest ancestor marked
 * `nativeID={FIELD_BLOCK_ID}` is the block the wizard bar keeps above itself. A marker test asserts that the block
 * exists, that it holds the group's message, and that it holds no other field.
 */
import { TextInput } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { FIELD_BLOCK_ID } from '@/hooks/useRevealFocusedField';

/** The nearest ancestor of `input` marked FIELD_BLOCK_ID, or null. */
export function blockOf(input: ReactTestInstance): ReactTestInstance | null {
  for (let node = input.parent; node; node = node.parent) {
    if (node.props?.nativeID === FIELD_BLOCK_ID) return node;
  }
  return null;
}

/** The words shown in the block, one per Text. */
export function wordsIn(block: ReactTestInstance): string[] {
  return block
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat(Infinity).filter((part) => typeof part === 'string' || typeof part === 'number').join(''));
}

/** How many text inputs the block holds (a block holds one field, never the next one). */
export function inputsIn(block: ReactTestInstance): number {
  return block.findAllByType(TextInput).length;
}
