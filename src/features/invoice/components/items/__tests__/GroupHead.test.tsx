/** The head of a group's card: the mark on up to two lines with the full mark spoken, no empty chip, weights, bags dispatched. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, textsOf } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
afterEach(() => setLanguage('en'));

async function render(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor />); });
  return tree;
}
const head = (tree: ReactTestRenderer) => tree.root.find((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('items-head-'));
const spoken = (tree: ReactTestRenderer) => head(tree).find((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessible === true).props.accessibilityLabel as string;
const icons = (tree: ReactTestRenderer, name: string) => tree.root.findAll((node) => (node.type as unknown) === 'Icon' && node.props.name === name);

const LONG_MARK = 'BL/STRETCH-LOT-0004/WWWWWWWWWWWWWWWWWWWW';

describe('the head of a group', () => {
  it('draws a long mark on up to two lines and speaks the whole mark', async () => {
    const tree = await render([invoiceLine({ package_mark: LONG_MARK })]);
    const chip = head(tree).findAll((node) => (node.type as unknown) === 'Text' && node.props.children === LONG_MARK);
    expect(chip).toHaveLength(1);
    expect(chip[0].props.numberOfLines).toBe(2);
    expect(spoken(tree)).toContain(`mark ${LONG_MARK}`);
  });

  it('draws no mark chip when the lot has no mark', async () => {
    const tree = await render(edgeLines.smallest());
    expect(icons(tree, 'tag-outline')).toHaveLength(0);
    expect(spoken(tree)).not.toContain('mark');
    // and no weight chip for a lot without a weight
    expect(icons(tree, 'weight-kilogram')).toHaveLength(0);
  });

  it('draws the mark chip when there is a mark', async () => {
    const tree = await render([invoiceLine({ package_mark: 'M1' })]);
    expect(icons(tree, 'tag-outline')).toHaveLength(1);
  });

  it('reads "50 kg each" as one tag and says how many bags were dispatched of those received', async () => {
    const tree = await render([invoiceLine({ qty: 120, grn_original_qty: 150 })]);
    const texts = textsOf(tree);
    expect(texts).toContain('50 kg each');
    expect(texts).toContain('120 of 150 bags dispatched');
    expect(spoken(tree)).toBe('Example Potatoes, mark M1, 50 kg each, 120 of 150 bags dispatched, total ₹882.00');
  });

  it('gives lots of 25 kg and 50 kg in one group a tag for each, lightest first', async () => {
    const tree = await render([invoiceLine({ weight: 50 }, 0), invoiceLine({ weight: 25 }, 1)]);
    expect(spoken(tree)).toContain('25 kg each, 50 kg each');
  });

  it.each([[0], [null], [undefined]])('a lot with weight %s shows no weight tag and reads no weight', async (weight) => {
    const tree = await render([invoiceLine({ weight: weight as never })]);
    expect(icons(tree, 'weight-kilogram')).toHaveLength(0);
    expect(spoken(tree)).toBe('Example Potatoes, mark M1, 100 of 100 bags dispatched, total ₹735.00');
    expect(spoken(tree)).not.toMatch(/, ,|0 kg/);
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati, shown and spoken, and both weights of a group in order', async () => {
    setLanguage('gu');
    const tree = await render([invoiceLine({ weight: 50 }, 0), invoiceLine({ weight: 25 }, 1)]);
    expect(textsOf(tree).filter((text) => text.startsWith('દરેક'))).toEqual(['દરેક ૨૫ કિલો', 'દરેક ૫૦ કિલો']);
    expect(spoken(tree)).toContain('દરેક ૨૫ કિલો, દરેક ૫૦ કિલો');
  });

  it('puts the group total in the heading', async () => {
    const tree = await render([invoiceLine({}, 0), invoiceLine({}, 1)]);
    expect(spoken(tree)).toContain('total ₹1,470.00');
  });
});
