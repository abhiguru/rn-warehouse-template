/**
 * Weights on the saved-items sheet of the GRN Items step (owner's decision of
 * 2026-10-14). The sheet used to add up bags times weight into a "Total
 * weight" badge; a lot stores the weight of one package, and that total is no
 * longer shown. Each saved line says what one package weighs: "50 kg each".
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
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

const renderSheet = (items: ItemFormData[]) =>
  render(<ItemsSummaryBottomSheet isVisible onClose={jest.fn()} items={items} onRemoveItem={jest.fn()} onEditItem={jest.fn()} />);

afterEach(() => {
  setLanguage('en');
});

const textOf = (node: { props: { children?: unknown } }) => ([] as unknown[]).concat(node.props.children).join('');
/** Every Text node, in order, hidden ones too (the absence checks must see every node). */
const texts = () => screen.queryAllByText(/[\s\S]*/, { includeHiddenElements: true }).map(textOf);
/** The icon glyphs on the screen. The mocked icon is a bare host 'Icon' that no query reaches, so this walks toJSON(). */
const icons = () => {
  const names: string[] = [];
  const walk = (node: ReturnType<typeof screen.toJSON>) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'Icon') names.push(node.props.name as string);
    node.children?.forEach((child) => typeof child !== 'string' && walk(child));
  };
  walk(screen.toJSON());
  return names;
};
/** The neutral tags of a saved line that carry a weight. */
const weightTags = () => screen.queryAllByText(/kg|કિલો/, { includeHiddenElements: true }).map(textOf);
const cardLabels = () => screen.queryAllByLabelText(/^(Item|આઇટમ) /).map((node) => node.props.accessibilityLabel as string);
/** The badges of the totals row: only the quantity one exists, as its label then its value. */
const expectOnlyTotal = (label: string, value: string) => {
  expect(screen.queryAllByText(/^(Total |કુલ ).*:$/).map(textOf)).toEqual([label]);
  expect(screen.getByText(label)).toBeOnTheScreen();
  // The value sits beside its label in the same badge (the card's own quantity shows the same digits).
  expect(within(screen.getByText(label).parent!).getByText(value)).toBeOnTheScreen();
};

describe('GRN saved-items sheet', () => {
  // Ten lines of 100 bags at 50 kg: the sheet used to say "Total weight: 50,000 kg".
  const TEN = Array.from({ length: 10 }, (_, n) => saved(n + 1));

  it('shows the total quantity as its only total: no "Total weight"', async () => {
    await renderSheet(TEN);

    expectOnlyTotal('Total quantity:', '1,000');
    expect(texts()).not.toContain('Total weight:');
    expect(texts()).not.toContain('50,000 kg');
    expect(texts().some((text) => /total weight/i.test(text))).toBe(false);
    // The weight badge's glyph went with it; a line's weight tag has its own.
    expect(icons()).not.toContain('weight');
  });

  it('shows no total for one line of 100 bags at 50 kg either', async () => {
    await renderSheet([saved(1)]);

    expectOnlyTotal('Total quantity:', '100');
    expect(texts()).not.toContain('5,000 kg');
    expect(weightTags()).toEqual(['50 kg each']);
  });

  it('says what one package weighs on every saved line, on the tag and aloud', async () => {
    await renderSheet([saved(1), saved(2, { qty: '40', weight: '25' })]);

    expect(weightTags()).toEqual(['50 kg each', '25 kg each']);
    expect(cardLabels()).toEqual([
      'Item 1, Fictional item 1, Bag, quantity 100, 50 kg each',
      'Item 2, Fictional item 2, Bag, quantity 40, 25 kg each',
    ]);
  });

  it.each([['0'], [''], ['abc']])('shows no weight tag, and says no weight, for a line saved with weight %p', async (weight) => {
    await renderSheet([saved(1, { weight })]);

    expect(weightTags()).toEqual([]);
    expect(icons()).not.toContain('weight-kilogram');
    expect(cardLabels()).toEqual(['Item 1, Fictional item 1, Bag, quantity 100']);
    expectOnlyTotal('Total quantity:', '100');
  });

  it('writes the weight as "દરેક ૫૦ કિલો" in Gujarati, and still has one total', async () => {
    setLanguage('gu');
    await renderSheet([saved(1)]);

    expect(weightTags()).toEqual(['દરેક ૫૦ કિલો']);
    expectOnlyTotal('કુલ નંગ:', '૧૦૦');
    expect(texts()).not.toContain('કુલ વજન:');
  });
});

describe('SavedItemCard weight', () => {
  const card = (weight: SavedItemCardData['weight']) =>
    render(<SavedItemCard index={0} item={{ name: 'Potato', packaging: 'Bag', quantity: '100', weight, rack: 'B-14' }} />);

  it.each([
    [50, '50 kg each'],
    ['50', '50 kg each'],
    [1250.5, '1,250.5 kg each'],
  ])('shows the weight %p as %p', async (weight, shown) => {
    await card(weight);

    expect(weightTags()).toEqual([shown]);
    expect(cardLabels()).toEqual([`Item 1, Potato, Bag, quantity 100, ${shown}, rack B-14`]);
  });

  it.each([[0], ['0'], [undefined], [''], [-5]])('shows no weight tag for the weight %p', async (weight) => {
    await card(weight);

    expect(weightTags()).toEqual([]);
    expect(icons()).not.toContain('weight-kilogram');
    expect(icons()).toContain('view-grid-outline');
    expect(cardLabels()).toEqual(['Item 1, Potato, Bag, quantity 100, rack B-14']);
  });
});

describe('GRN saved-items sheet lock tags', () => {
  const renderLocked = (lineLocks: Map<string, 'invoiced' | 'dispatched' | 'quantity'>) =>
    render(
      <ItemsSummaryBottomSheet
        isVisible
        onClose={jest.fn()}
        items={[saved(1), saved(2), saved(3), saved(4)]}
        onRemoveItem={jest.fn()}
        onEditItem={jest.fn()}
        lineLocks={lineLocks}
      />
    );

  it('tags a line as the review step does: invoiced, dispatched, or (an older server) quantity only', async () => {
    await renderLocked(new Map([['line-1', 'invoiced'], ['line-2', 'dispatched'], ['line-3', 'quantity']]));

    expect(texts().filter((text) => /locked/.test(text))).toEqual([
      'Quantity, item, packing and weight locked',
      'Quantity, item and packing locked',
      'Quantity locked',
    ]);
    expect(cardLabels()[0]).toContain('on an invoice, quantity, item, packing and weight locked');
    expect(cardLabels()[3]).not.toMatch(/locked/);
  });
});
