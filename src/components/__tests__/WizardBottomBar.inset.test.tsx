/**
 * WizardBottomBar (style guide §13.8, §14.3): the bottom inset is added on iOS only (the root stack already pads
 * Android screens by it), the buttons stack from font scale 1.5 with the primary one on top, and the optional
 * Back label and test ids reach the buttons.
 */
import React from 'react';
import { Dimensions, Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import WizardBottomBar from '../WizardBottomBar';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}));

const originalOS = Platform.OS;
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  Platform.OS = originalOS;
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([] as unknown[]).concat(style as never).flat(Infinity as 1).filter(Boolean));

function render(os: 'ios' | 'android', fontScale: number, props: Partial<React.ComponentProps<typeof WizardBottomBar>> = {}) {
  Platform.OS = os;
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<WizardBottomBar currentStep={2} totalSteps={3} onPrevious={jest.fn()} onNext={jest.fn()} {...props} />);
  });
  mounted.push(tree);
  return tree;
}
const bar = (tree: ReactTestRenderer) => flat(tree.root.findAll((n) => (n.type as unknown) === 'View')[0].props.style);
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const styleOf = (node: { props: Record<string, any> }) => flat(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

describe('WizardBottomBar bottom inset', () => {
  it('pads Android by space.md only', () => {
    expect(bar(render('android', 1)).paddingBottom).toBe(space.md);
  });

  it('adds the inset on iOS', () => {
    expect(bar(render('ios', 1)).paddingBottom).toBe(34 + space.md);
  });
});

describe('WizardBottomBar at large text', () => {
  it('keeps Back and Next side by side at font scale 1.3', () => {
    const tree = render('android', 1.3);
    expect(bar(tree).flexDirection).toBe('row');
    expect(styleOf(button(tree, 'Next')).flex).toBe(1);
  });

  it('stacks the buttons at font scale 1.5, Next on top', () => {
    const tree = render('android', 1.5);
    expect(bar(tree).flexDirection).toBe('column');
    expect(styleOf(button(tree, 'Next'))).toMatchObject({ flex: 0, alignSelf: 'stretch' });
    expect(styleOf(button(tree, 'Back'))).toMatchObject({ flex: 0, alignSelf: 'stretch' });
  });
});

describe('WizardBottomBar reading and focus order', () => {
  /** The buttons in the order a screen reader and the keyboard visit them: the order of the tree. */
  const order = (tree: ReactTestRenderer) =>
    tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel);

  it('is Back then Next side by side', () => {
    expect(order(render('android', 1))).toEqual(['Back', 'Next']);
  });

  it('is Next then Back when the buttons stack from font scale 1.5, the order they are drawn in', () => {
    expect(order(render('android', 1.5))).toEqual(['Next', 'Back']);
    expect(order(render('ios', 2))).toEqual(['Next', 'Back']);
  });

  it('speaks a given label for Next without changing what it shows', () => {
    const tree = render('android', 1, { nextAccessibilityLabel: 'Next: review' });
    const next = button(tree, 'Next: review');
    expect(next.findAll((n) => (n.type as unknown) === 'Text').map((n) => n.props.children)).toEqual(['Next']);
  });
});

describe('WizardBottomBar labels and test ids', () => {
  it('uses a given Back label and test ids, and keeps "Back" otherwise', () => {
    const tree = render('android', 1, { previousAccessibilityLabel: 'Back to dispatch details', previousTestID: 'bar-back', nextTestID: 'bar-next' });
    expect(button(tree, 'Back to dispatch details').props.testID).toBe('bar-back');
    expect(button(tree, 'Next').props.testID).toBe('bar-next');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Back')).toHaveLength(0);
    const plain = render('android', 1);
    expect(button(plain, 'Back').props.testID).toBeUndefined();
  });
});
