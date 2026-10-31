/**
 * The weight on an invoice's line items is the lot's own: the weight of one
 * bag, box or crate (get_invoice_items_detailed and get_invoice_data send
 * goodsreceived_trl.weight). It picks the price band, so it stays on the
 * screen, worded "50 kg each" under the item (after the mark); a lot without
 * a weight shows none. Names and numbers are fictional.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { InvoiceLineItemsTab, type InvoiceLineItem } from '../InvoiceLineItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: 1 }),
}));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
});

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<GestureHandlerRootView>{element}</GestureHandlerRootView>);
  });
  mounted.push(tree);
  return {
    texts: () => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('').replace(/\u00A0/g, ' ')),
    /** Text drawn outside a Text (a `0` left by `weight && …`), which a phone refuses to draw. */
    bareTexts: () =>
      tree.root.findAll(node => (node.type as unknown) === 'View').flatMap(node => node.children.filter(child => typeof child === 'string')),
  };
}
const weightWords = (texts: string[]) => texts.filter(text => /kg|each|કિલો|દરેક/.test(text));

/** One lot as the Items tab gets it: 4 bags of a lot of 100. */
const lines = (weight: number | undefined, mark = ''): InvoiceLineItem[] => [
  { id: 'l1', item_name: 'Fictional Onions', charge: 5, tax: 5, grn_item_id: 'gi-1', dispatch_id: 'd1', dispatch_no: 'I0001', dispatch_qty: 4, grn_quantity: 100, weight, package_mark: mark, no_of_days: 30, duration: '1' },
];

describe('invoice details, the Items table', () => {
  it('reads "50 kg each" under the item, the weight of one bag and not of the 4 dispatched or the 100 received', () => {
    const { texts } = render(<InvoiceLineItemsTab items={lines(50)} />);
    expect(weightWords(texts())).toEqual(['50 kg each']);
  });

  it('puts the mark before the weight', () => {
    expect(render(<InvoiceLineItemsTab items={lines(50, 'PT')} />).texts()).toContain('PT · 50 kg each');
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati', () => {
    setLanguage('gu');
    expect(render(<InvoiceLineItemsTab items={lines(50)} />).texts()).toContain('દરેક ૫૦ કિલો');
  });

  it.each([[0], [undefined]])('a lot with weight %s shows no weight', weight => {
    const { texts, bareTexts } = render(<InvoiceLineItemsTab items={lines(weight)} />);
    expect(texts()).toContain('Fictional Onions');
    expect(weightWords(texts())).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });
});
