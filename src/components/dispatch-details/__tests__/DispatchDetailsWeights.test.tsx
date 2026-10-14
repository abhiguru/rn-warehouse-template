/**
 * Weights on the page of a saved dispatch (phone review 2026-10-14, UX-06).
 *
 * The Items and GRNs tabs show the weight a lot stores, the weight of one bag,
 * as a neutral tag. "50 kg" beside "4 bags" read like the weight of the line;
 * the tag now reads "50 kg each". A lot without a weight has no weight tag
 * (it used to read "0 kg").
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { DispatchItemCard } from '@/components/dispatch-details/DispatchItemCard';
import { DispatchGRNsTab } from '@/components/dispatch-details/DispatchGRNsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

type Weight = number | null | undefined;
const item = (weight: Weight, over: { original_quantity?: number; package_mark?: string } = { original_quantity: 10, package_mark: 'PM' }) => ({
  item_name: 'Potatoes',
  dispatch_quantity: 4,
  grn_no: '311',
  grn_date: '2026-10-09',
  grn_id: 'g1',
  // The backend sends null for a lot without a weight; the prop is typed as a number.
  weight: weight as number | undefined,
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

describe.each([
  ['Items tab card', (weight: Weight, over?: Parameters<typeof item>[1]) => <DispatchItemCard {...item(weight, over)} />],
  ['GRNs tab', (weight: Weight, over?: Parameters<typeof item>[1]) => (
    <DispatchGRNsTab grns={[{ grn_id: 'g1', grn_no: '311', grn_date: '2026-10-09', items: [item(weight, over)] }]} />
  )],
])('%s', (_name, element) => {
  it('tags the weight of one bag as "50 kg each"', () => {
    render(element(50));

    expect(texts(tree)).toContain('50 kg each');
    expect(texts(tree)).not.toContain('50 kg');
    expect(icons(tree)).toContain('weight-kilogram');
  });

  it('tags it as દરેક ૫૦ કિલો in Gujarati', () => {
    setLanguage('gu');
    render(element(50));

    expect(texts(tree)).toContain('દરેક ૫૦ કિલો');
  });

  it.each([[0], [null], [undefined]])('has no weight tag for a lot without a weight (%s); the other tags stay', (weight) => {
    render(element(weight));

    expect(texts(tree).some((text) => /kg/i.test(text))).toBe(false);
    expect(icons(tree)).not.toContain('weight-kilogram');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Received 10 bags', 'PM']));
    expect(looseText(tree)).toEqual([]);
  });

  it.each([[0], [null]])('draws no empty row of tags when a weight of %s was the only detail', (weight) => {
    render(element(weight, { package_mark: '' }));

    expect(texts(tree).some((text) => /kg/i.test(text))).toBe(false);
    expect(icons(tree)).not.toContain('weight-kilogram');
    expect(icons(tree)).not.toContain('package-variant-closed');
    expect(looseText(tree)).toEqual([]);
  });
});
