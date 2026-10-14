/**
 * A GRN line saved without a weight has weight 0. `{0 && <Text/>}` puts a bare
 * 0 inside a View, which React Native refuses to render (M8-3).
 *
 * A weight that is there is the weight of one package and says so: "50 kg
 * each" (owner's decision of 2026-10-14). A line without one shows no weight.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import GRNItemDispatchTable from '@/components/grn-details/GRNItemDispatchTable';
import { GRNItemCard } from '@/components/grn-details/GRNItemCard';
import type { GRNItem } from '@/components/grn-details/GRNItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const item = (weight: number | null | undefined) =>
  ({ id: 'line-1', item_name: 'Example Potatoes', qty: 10, stock: 10, weight, package_mark: 'M1', rack: '', packaging: 'Bag' }) as unknown as GRNItem;

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}

/** Children of host Views that are bare text or numbers: what React Native throws on. */
function looseText(tree: ReactTestRenderer) {
  return tree.root
    .findAll(node => (node.type as unknown) === 'View')
    .flatMap(node => React.Children.toArray(node.props.children))
    .filter(child => typeof child === 'string' || typeof child === 'number');
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
/** What a screen reader says for the card or header. */
const spoken = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string')[0].props.accessibilityLabel as string;

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach(tree => tree.unmount())));

describe('GRN Dispatches tab, item header', () => {
  it.each([[0], [null], [undefined]])('renders nothing for a weight of %p, not a bare 0', (weight) => {
    const tree = render(<GRNItemDispatchTable item={item(weight)} dispatches={[]} />);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree).some(text => /kg/.test(text))).toBe(false);
    // The mark is still there: only the weight is left out.
    expect(texts(tree)).toContain('M1');
  });

  it('shows a weight that is there as the weight of one package', () => {
    const tree = render(<GRNItemDispatchTable item={item(50)} dispatches={[]} />);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree)).toContain('50 kg each');
    expect(texts(tree)).not.toContain('50 kg');
  });
});

describe('GRN Items tab, item card', () => {
  it.each([[0], [null], [undefined]])('shows no weight, and no "Weight" label, for a line with weight %p', (weight) => {
    const tree = render(<GRNItemCard item_name="Example Potatoes" qty={10} stock={10} total_dispatched={0} weight={weight} />);
    expect(texts(tree).some(text => /kg/.test(text))).toBe(false);
    expect(texts(tree)).not.toContain('Weight');
    expect(spoken(tree)).toBe('Example Potatoes, 10 received, In stock, 10 in stock, 0 dispatched');
  });

  it('shows "50 kg each" under the label "Weight", and says it', () => {
    const tree = render(<GRNItemCard item_name="Example Potatoes" qty={10} stock={10} total_dispatched={0} weight={50} />);
    const all = texts(tree);
    expect(all.slice(all.indexOf('Weight'), all.indexOf('Weight') + 2)).toEqual(['Weight', '50 kg each']);
    expect(all).not.toContain('Weight each');
    expect(spoken(tree)).toBe('Example Potatoes, 10 received, In stock, 10 in stock, 0 dispatched, 50 kg each');
  });
});
