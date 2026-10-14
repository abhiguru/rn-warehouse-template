/**
 * The weight on an invoice's line items is the lot's own: the weight of one
 * bag, box or crate (get_invoice_items_detailed and get_invoice_data send
 * goodsreceived_trl.weight). It picks the price band, so it stays on the
 * screen, worded "50 kg each"; a lot without a weight shows none.
 * Names and numbers are fictional.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { InvoiceLineItemCard } from '../InvoiceLineItemCard';
import { InvoiceLineItemGroup, type InvoiceLineItemGroupData } from '../InvoiceLineItemGroup';
import { groupItemsByGrnItem } from '../InvoiceLineItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
});

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return {
    texts: () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')),
    weightIcons: () => tree.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'weight'),
    /** Text drawn outside a Text (a `0` left by `weight && …`), which a phone refuses to draw. */
    bareTexts: () =>
      tree.root.findAll(node => (node.type as unknown) === 'View').flatMap(node => node.children.filter(child => typeof child === 'string')),
  };
}
const weightWords = (texts: string[]) => texts.filter(text => /kg|each|કિલો|દરેક/.test(text));

/** A group as the Items tab builds it from the invoice's lines: 4 bags of a lot of 100. */
const group = (weight: number | undefined): InvoiceLineItemGroupData =>
  groupItemsByGrnItem([
    { id: 'l1', item_name: 'Fictional Onions', charge: 5, tax: 5, grn_item_id: 'gi-1', dispatch_id: 'd1', dispatch_no: 'I0001', dispatch_qty: 4, grn_quantity: 100, weight, no_of_days: 30, duration: '1' } as never,
  ])[0];

describe('invoice details, a line item group', () => {
  it('reads "50 kg each" in its metrics, the weight of one bag and not of the 4 dispatched or the 100 received', () => {
    const { texts, weightIcons } = render(<InvoiceLineItemGroup group={group(50)} />);
    expect(texts()).toContain('50 kg each');
    expect(weightWords(texts())).toEqual(['50 kg each']);
    expect(weightIcons()).toHaveLength(1);
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati', () => {
    setLanguage('gu');
    expect(render(<InvoiceLineItemGroup group={group(50)} />).texts()).toContain('દરેક ૫૦ કિલો');
  });

  it.each([[0], [undefined]])('a lot with weight %s shows no weight and no weight icon', weight => {
    const { texts, weightIcons, bareTexts } = render(<InvoiceLineItemGroup group={group(weight)} />);
    expect(texts()).toContain('Fictional Onions');
    expect(weightWords(texts())).toEqual([]);
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });
});

// No screen mounts this card; it is kept in step with the group.
describe('invoice details, a line item card', () => {
  const card = (weight: number | undefined) => (
    <InvoiceLineItemCard itemName="Fictional Onions" charge={20} tax={1} packageMark="PT" rack="B-14" weight={weight} dispatchQty={4} grnQuantity={100} />
  );

  it('reads "50 kg each" under the plain label "Weight"', () => {
    const { texts } = render(card(50));
    expect(texts()).toEqual(expect.arrayContaining(['Weight', '50 kg each']));
    expect(texts()).not.toContain('Weight each');
    expect(weightWords(texts())).toEqual(['50 kg each']);
  });

  it('reads "દરેક ૫૦ કિલો" under "વજન" in Gujarati', () => {
    setLanguage('gu');
    expect(render(card(50)).texts()).toEqual(expect.arrayContaining(['વજન', 'દરેક ૫૦ કિલો']));
  });

  it.each([[0], [undefined]])('a lot with weight %s shows neither the label nor a weight', weight => {
    const { texts, weightIcons, bareTexts } = render(card(weight));
    expect(texts()).toEqual(expect.arrayContaining(['PT', 'B-14']));
    expect(texts()).not.toContain('Weight');
    expect(weightWords(texts())).toEqual([]);
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });
});
