/**
 * Weights on the saved-items sheet of the GRN Items step (owner's decision of
 * 2026-10-14). The sheet used to add up bags times weight into a "Total
 * weight" badge; a lot stores the weight of one package, and that total is no
 * longer shown. Each saved line says what one package weighs: "50 kg each".
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import ItemsSummaryBottomSheet, { type ItemFormData } from '../ItemsSummaryBottomSheet';
import { SavedItemCard, type SavedItemCardData } from '../SavedItemCard';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode }) => require('react').createElement('Swipeable', null, props.children),
}));
jest.mock('react-native-gesture-handler', () => {
  const mockReact = require('react');
  return {
    GestureHandlerRootView: (props: { children?: React.ReactNode }) => mockReact.createElement('GHRoot', null, props.children),
  };
});

const saved = (n: number, over: Partial<ItemFormData> = {}): ItemFormData => ({
  grn_trl_id: `line-${n}`,
  item_table_id: `item-${n}`,
  item_name: `Fictional item ${n}`,
  packaging: 'Bag',
  qty: '100',
  weight: '50',
  rack: '',
  package_mark: '',
  trl_images: [],
  errors: {},
  ...over,
});

const mounted: ReactTestRenderer[] = [];
function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}
const renderSheet = (items: ItemFormData[]) =>
  mount(<ItemsSummaryBottomSheet isVisible onClose={jest.fn()} items={items} onRemoveItem={jest.fn()} onEditItem={jest.fn()} />);

afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  setLanguage('en');
});

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) => ([] as unknown[]).concat(node.props.children).join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll(isText).map(textOf);
const hostParent = (node: ReactTestInstance) => {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent!;
};
/** The badges of the totals row: each as its label and value. */
const totals = (tree: ReactTestRenderer) => {
  const quantityLabel = tree.root.findAll(isText).find((node) => /^(Total quantity:|કુલ નંગ:)$/.test(textOf(node)))!;
  const row = hostParent(hostParent(quantityLabel));
  return row.findAll((node) => typeof node.type === 'string' && hostParent(node) === row).map((badge) => badge.findAll(isText).map(textOf));
};
const icons = (tree: ReactTestRenderer) => tree.root.findAll((node) => (node.type as unknown) === 'Icon').map((node) => node.props.name as string);
/** The neutral tags of a saved line that carry a weight. */
const weightTags = (tree: ReactTestRenderer) => texts(tree).filter((text) => /kg|કિલો/.test(text));
const cardLabels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.accessible === true && typeof node.props.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => /^(Item|આઇટમ) /.test(label));

describe('GRN saved-items sheet', () => {
  // Ten lines of 100 bags at 50 kg: the sheet used to say "Total weight: 50,000 kg".
  const TEN = Array.from({ length: 10 }, (_, n) => saved(n + 1));

  it('shows the total quantity as its only total: no "Total weight"', () => {
    const tree = renderSheet(TEN);

    expect(totals(tree)).toEqual([['Total quantity:', '1,000']]);
    expect(texts(tree)).not.toContain('Total weight:');
    expect(texts(tree)).not.toContain('50,000 kg');
    expect(texts(tree).some((text) => /total weight/i.test(text))).toBe(false);
    // The weight badge's glyph went with it; a line's weight tag has its own.
    expect(icons(tree)).not.toContain('weight');
  });

  it('shows no total for one line of 100 bags at 50 kg either', () => {
    const tree = renderSheet([saved(1)]);

    expect(totals(tree)).toEqual([['Total quantity:', '100']]);
    expect(texts(tree)).not.toContain('5,000 kg');
    expect(weightTags(tree)).toEqual(['50 kg each']);
  });

  it('says what one package weighs on every saved line, on the tag and aloud', () => {
    const tree = renderSheet([saved(1), saved(2, { qty: '40', weight: '25' })]);

    expect(weightTags(tree)).toEqual(['50 kg each', '25 kg each']);
    expect(cardLabels(tree)).toEqual([
      'Item 1, Fictional item 1, Bag, quantity 100, 50 kg each',
      'Item 2, Fictional item 2, Bag, quantity 40, 25 kg each',
    ]);
  });

  it.each([['0'], [''], ['abc']])('shows no weight tag, and says no weight, for a line saved with weight %p', (weight) => {
    const tree = renderSheet([saved(1, { weight })]);

    expect(weightTags(tree)).toEqual([]);
    expect(icons(tree)).not.toContain('weight-kilogram');
    expect(cardLabels(tree)).toEqual(['Item 1, Fictional item 1, Bag, quantity 100']);
    expect(totals(tree)).toEqual([['Total quantity:', '100']]);
  });

  it('writes the weight as "દરેક ૫૦ કિલો" in Gujarati, and still has one total', () => {
    setLanguage('gu');
    const tree = renderSheet([saved(1)]);

    expect(weightTags(tree)).toEqual(['દરેક ૫૦ કિલો']);
    expect(totals(tree)).toEqual([['કુલ નંગ:', '૧૦૦']]);
    expect(texts(tree)).not.toContain('કુલ વજન:');
  });
});

describe('SavedItemCard weight', () => {
  const card = (weight: SavedItemCardData['weight']) =>
    mount(<SavedItemCard index={0} item={{ name: 'Potato', packaging: 'Bag', quantity: '100', weight, rack: 'B-14' }} />);

  it.each([
    [50, '50 kg each'],
    ['50', '50 kg each'],
    [1250.5, '1,250.5 kg each'],
  ])('shows the weight %p as %p', (weight, shown) => {
    const tree = card(weight);

    expect(weightTags(tree)).toEqual([shown]);
    expect(cardLabels(tree)).toEqual([`Item 1, Potato, Bag, quantity 100, ${shown}, rack B-14`]);
  });

  it.each([[0], ['0'], [undefined], [''], [-5]])('shows no weight tag for the weight %p', (weight) => {
    const tree = card(weight);

    expect(weightTags(tree)).toEqual([]);
    expect(icons(tree)).not.toContain('weight-kilogram');
    expect(icons(tree)).toContain('view-grid-outline');
    expect(cardLabels(tree)).toEqual(['Item 1, Potato, Bag, quantity 100, rack B-14']);
  });
});

describe('GRN saved-items sheet lock tags', () => {
  const renderLocked = (lineLocks: Map<string, 'invoiced' | 'dispatched' | 'quantity'>) =>
    mount(
      <ItemsSummaryBottomSheet
        isVisible
        onClose={jest.fn()}
        items={[saved(1), saved(2), saved(3), saved(4)]}
        onRemoveItem={jest.fn()}
        onEditItem={jest.fn()}
        lineLocks={lineLocks}
      />
    );

  it('tags a line as the review step does: invoiced, dispatched, or (an older server) quantity only', () => {
    const tree = renderLocked(new Map([['line-1', 'invoiced'], ['line-2', 'dispatched'], ['line-3', 'quantity']]));

    expect(texts(tree).filter((text) => /locked/.test(text))).toEqual([
      'Quantity, item, packing and weight locked',
      'Quantity, item and packing locked',
      'Quantity locked',
    ]);
    expect(cardLabels(tree)[0]).toContain('on an invoice, quantity, item, packing and weight locked');
    expect(cardLabels(tree)[3]).not.toMatch(/locked/);
  });
});
