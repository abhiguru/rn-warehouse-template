/**
 * A GRN line saved without a weight has weight 0. `{0 && <Text/>}` puts a bare
 * 0 inside a View, which React Native refuses to render (M8-3).
 *
 * A weight that is there is the weight of one package and says so: "50 kg
 * each" (owner's decision of 2026-10-14). A line without one shows no weight.
 * Both GRN tables write it under the item, after the mark: "M1 · 50 kg each".
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GRNDispatchesTab } from '@/components/grn-details/GRNDispatchesTab';
import { GRNItemsTab, type GRNItem } from '@/components/grn-details/GRNItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
let mockFontScale = 2;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: mockFontScale }),
}));

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
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join('').replace(/\u00A0/g, ' '));
/** What a screen reader says for the card or header (the sort headings above the rows say their own). */
const spoken = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string' && !/^Sort by /.test(node.props.accessibilityLabel)
  )[0].props.accessibilityLabel as string;

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach(tree => tree.unmount())));

const dispatch = { id: 'r1', dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', disp_quantity: 3, customer_name: '', registration: '', supervisor_name: '' };

describe.each([
  ['Items table', (weight: number | null | undefined) => render(<GRNItemsTab items={[item(weight)]} />)],
  ['Dispatches table', (weight: number | null | undefined) => render(<GRNDispatchesTab items={[item(weight)]} dispatchesByItem={{ 'line-1': [dispatch] }} />)],
])('GRN %s, the line under the item', (_name, show) => {
  // Review 2026-10-14, finding 7: at font scale 2.0 on a 360 dp phone a long mark and
  // "1,250 kg each" must wrap, never be cut.
  it('writes the mark and the weight in full, with no line limit, at font scale 2', () => {
    mockFontScale = 2;
    const tree = show(1250);
    const line = tree.root.find(node => (node.type as unknown) === 'Text' && String(node.props.children).replace(/\u00A0/g, ' ') === 'M1 · 1,250 kg each');
    expect(line.props.numberOfLines).toBeUndefined();
    let column = line.parent!;
    while (typeof column.type !== 'string') column = column.parent!;
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
  });

  it.each([[0], [null], [undefined]])('renders nothing for a weight of %p, not a bare 0', (weight) => {
    const tree = show(weight);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree).some(text => /kg/.test(text))).toBe(false);
    // The mark is still there: only the weight is left out.
    expect(texts(tree)).toContain('M1');
  });

  it('shows a weight that is there as the weight of one package', () => {
    const tree = show(50);
    expect(looseText(tree)).toEqual([]);
    expect(texts(tree)).toContain('M1 · 50 kg each');
    expect(texts(tree).some(text => /\b50 kg$/.test(text))).toBe(false);
  });
});

describe('GRN Items table, what a screen reader says', () => {
  it.each([[0], [null], [undefined]])('says no weight for a line with weight %p', (weight) => {
    const tree = render(<GRNItemsTab items={[item(weight)]} />);
    expect(spoken(tree)).toBe('Example Potatoes, M1, 10 received, 10 in stock');
  });

  it('says the weight of one package', () => {
    const tree = render(<GRNItemsTab items={[item(50)]} />);
    expect(spoken(tree)).toBe('Example Potatoes, M1 · 50 kg each, 10 received, 10 in stock');
  });
});
