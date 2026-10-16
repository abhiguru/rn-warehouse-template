/**
 * Weights on the page of a saved dispatch (phone review 2026-10-14, UX-06).
 *
 * The Items and GRNs tables show the weight a lot stores, the weight of one bag,
 * under the item name. "50 kg" beside "4 bags" read like the weight of the line;
 * it reads "50 kg each". A lot without a weight shows no weight (it used to read
 * "0 kg"). The received quantity is in the Items row's details.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { DispatchItemsTab } from '@/components/dispatch-details/DispatchItemsTab';
import { DispatchGRNsTab } from '@/components/dispatch-details/DispatchGRNsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: 1 }),
}));

type Weight = number | null | undefined;
const item = (weight: Weight, over: { original_quantity?: number; package_mark?: string } = { original_quantity: 10, package_mark: 'PM' }) => ({
  id: 'line-1',
  item_name: 'Potatoes',
  dispatch_quantity: 4,
  grn_no: '311',
  grn_date: '2026-10-09',
  grn_id: 'g1',
  // The backend sends null for a lot without a weight.
  weight,
  ...over,
});

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const icons = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => (node.type as unknown) === 'Icon').map((node) => node.props.name as string);
/** Children of host Views that are bare text or numbers: what React Native throws on. */
const looseText = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'View')
    .flatMap((node) => React.Children.toArray(node.props.children))
    .filter((child) => typeof child === 'string' || typeof child === 'number');

let tree: ReactTestRenderer;
const render = (element: React.ReactElement) => {
  act(() => { tree = create(element); });
  return tree;
};
afterEach(() => {
  act(() => tree.unmount());
  setLanguage('en');
});

/** The Items row, opened so its received quantity shows. */
function openedItems(weight: Weight, over?: Parameters<typeof item>[1]) {
  render(<DispatchItemsTab items={[item(weight, over)]} />);
  const row = tree.root.findAll((node) => node.props.testID === 'dispatch-item-row-line-1' && typeof node.type !== 'string')[0];
  if (!row.props.disabled) act(() => row.props.onPress());
  return tree;
}

describe.each([
  ['Items table', (weight: Weight, over?: Parameters<typeof item>[1]) => openedItems(weight, over)],
  // One source GRN starts expanded.
  ['GRNs table', (weight: Weight, over?: Parameters<typeof item>[1]) => render(<DispatchGRNsTab items={[item(weight, over)]} />)],
])('%s', (name, show) => {
  // The Items table joins the mark and the weight under the item; the GRNs table has a Mark column.
  const weightLine = name === 'Items table' ? 'PM · 50 kg each' : '50 kg each';

  it('writes the weight of one bag as "50 kg each" under the item', () => {
    show(50);

    expect(texts(tree)).toContain(weightLine);
    expect(texts(tree)).not.toContain('50 kg');
  });

  it('writes it as દરેક ૫૦ કિલો in Gujarati', () => {
    setLanguage('gu');
    show(50);

    expect(texts(tree).some((text) => text.includes('દરેક ૫૦ કિલો'))).toBe(true);
  });

  it.each([[0], [null], [undefined]])('shows no weight for a lot without a weight (%s); the mark stays', (weight) => {
    show(weight);

    expect(texts(tree).some((text) => /kg/i.test(text))).toBe(false);
    expect(texts(tree)).toContain('PM');
    expect(looseText(tree)).toEqual([]);
  });

  it.each([[0], [null]])('draws no empty line under the item when a weight of %s was the only detail', (weight) => {
    show(weight, { package_mark: '' });

    expect(texts(tree).some((text) => /kg/i.test(text))).toBe(false);
    expect(texts(tree)).not.toContain('');
    expect(looseText(tree)).toEqual([]);
  });
});

it('shows the bags received on the lot in the Items row details', () => {
  openedItems(50);
  expect(texts(tree)).toContain('Received 10 bags');
  expect(icons(tree)).toContain('package-variant-closed');
});
