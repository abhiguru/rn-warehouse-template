/**
 * Reading components that Testing Library does not show. Its tree holds host views only, so a test that has to read the
 * props of a component (a dialog's `title`, the table an editor hands to its rows) searches React's fiber tree through
 * `unstable_fiber`. Use it only where no screen query can say the same.
 */
import { screen } from '@testing-library/react-native';

export interface FiberLike {
  type?: unknown;
  memoizedProps?: Record<string, any>;
  stateNode?: any;
  child: FiberLike | null;
  sibling: FiberLike | null;
  return: FiberLike | null;
}

/** Every fiber of the tree that is on screen and `matches`, in tree order. */
export const findFibers = (matches: (fiber: FiberLike) => boolean): FiberLike[] => {
  let top = screen.root!.unstable_fiber as FiberLike | null;
  while (top?.return) top = top.return;
  // React keeps two copies of the tree; the root's `current` is the one that is on screen.
  top = top?.stateNode?.current ?? top;
  const found: FiberLike[] = [];
  const visit = (fiber: FiberLike | null) => {
    for (let node = fiber; node; node = node.sibling) {
      if (matches(node)) found.push(node);
      visit(node.child);
    }
  };
  visit(top);
  return found;
};

/** The first component in the tree (in tree order) that `matches`; throws when there is none. */
export const findFiber = (matches: (fiber: FiberLike) => boolean): FiberLike => {
  const found = findFibers(matches)[0];
  if (!found) throw new Error('the component the test reads is not in the tree');
  return found;
};
