/**
 * A GRN line saved without a weight has weight 0. `{0 && <Text/>}` puts a bare
 * 0 inside a View, which React Native refuses to render (M8-3).
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

const item = (weight: number | undefined) =>
  ({ id: 'line-1', item_name: 'Example Potatoes', qty: 10, stock: 10, weight, package_mark: 'M1', rack: '', packaging: 'Bag' }) as unknown as GRNItem;

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
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

describe('GRN Dispatches tab, item header', () => {
  it('renders nothing for a weight of 0, not a bare 0', () => {
    const tree = render(<GRNItemDispatchTable item={item(0)} dispatches={[]} />);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree).some(text => /kg/.test(text))).toBe(false);
  });

  it('shows a weight that is there', () => {
    const tree = render(<GRNItemDispatchTable item={item(50)} dispatches={[]} />);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree)).toContain('50 kg');
  });
});

describe('GRN Items tab, item card', () => {
  it('does not show "0 kg" for a line without a weight', () => {
    const tree = render(<GRNItemCard item_name="Example Potatoes" qty={10} stock={10} total_dispatched={0} weight={0} />);
    expect(texts(tree).some(text => /kg/.test(text))).toBe(false);
  });
});
