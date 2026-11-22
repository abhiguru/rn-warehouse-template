/** The head of a group's card: the mark on up to two lines with the full mark spoken, no empty chip, weights, bags dispatched. */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, textsOf } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
afterEach(() => setLanguage('en'));

async function mount(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor />);
}
const head = () => screen.getByTestId(/^items-head-(?!total-)/);
const spoken = () => {
  const found = head().queryAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessible === true, { includeSelf: true });
  expect(found).toHaveLength(1);
  return found[0].props.accessibilityLabel as string;
};
const icons = (name: string) => screen.root!.queryAll((node) => node.type === 'Icon' && node.props.name === name, { includeSelf: true });

const LONG_MARK = 'BL/STRETCH-LOT-0004/WWWWWWWWWWWWWWWWWWWW';

describe('the head of a group', () => {
  it('draws a long mark on up to two lines and speaks the whole mark', async () => {
    await mount([invoiceLine({ package_mark: LONG_MARK })]);
    const chip = within(head()).getAllByText(LONG_MARK);
    expect(chip).toHaveLength(1);
    expect(chip[0]).toHaveProp('numberOfLines', 2);
    expect(spoken()).toContain(`mark ${LONG_MARK}`);
  });

  it('draws no mark chip when the lot has no mark', async () => {
    await mount(edgeLines.smallest());
    expect(icons('tag-outline')).toHaveLength(0);
    expect(spoken()).not.toContain('mark');
    // and no weight chip for a lot without a weight
    expect(icons('weight-kilogram')).toHaveLength(0);
  });

  it('draws the mark chip when there is a mark', async () => {
    await mount([invoiceLine({ package_mark: 'M1' })]);
    expect(icons('tag-outline')).toHaveLength(1);
  });

  it('reads "50 kg each" as one tag and says how many bags were dispatched of those received', async () => {
    await mount([invoiceLine({ qty: 120, grn_original_qty: 150 })]);
    const texts = textsOf();
    expect(texts).toContain('50 kg each');
    expect(texts).toContain('120 of 150 bags dispatched');
    expect(spoken()).toBe('Example Potatoes, mark M1, 50 kg each, 120 of 150 bags dispatched, total ₹882.00');
  });

  it('counts the dispatched in the lot\'s packaging word: boxes for Box, units when mixed, bags when the server sends none (D18)', async () => {
    await mount([invoiceLine({ qty: 120, grn_original_qty: 150, packaging: 'Box' })]);
    expect(textsOf()).toContain('120 of 150 boxes dispatched');
    await screen.unmount();
    await mount([invoiceLine({ qty: 100, grn_original_qty: 100, packaging: 'Box' }, 0), invoiceLine({ qty: 20, grn_original_qty: 100, packaging: 'Bag' }, 1)]);
    expect(textsOf().some((text) => text.endsWith('units dispatched'))).toBe(true);
    await screen.unmount();
    await mount([invoiceLine({ qty: 120, grn_original_qty: 150, packaging: undefined })]);
    expect(textsOf()).toContain('120 of 150 bags dispatched');
  });

  it('gives lots of 25 kg and 50 kg in one group a tag for each, lightest first', async () => {
    await mount([invoiceLine({ weight: 50 }, 0), invoiceLine({ weight: 25 }, 1)]);
    expect(spoken()).toContain('25 kg each, 50 kg each');
  });

  it.each([[0], [null], [undefined]])('a lot with weight %s shows no weight tag and reads no weight', async (weight) => {
    await mount([invoiceLine({ weight: weight as never })]);
    expect(icons('weight-kilogram')).toHaveLength(0);
    expect(spoken()).toBe('Example Potatoes, mark M1, 100 of 100 bags dispatched, total ₹735.00');
    expect(spoken()).not.toMatch(/, ,|0 kg/);
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati, shown and spoken, and both weights of a group in order', async () => {
    setLanguage('gu');
    await mount([invoiceLine({ weight: 50 }, 0), invoiceLine({ weight: 25 }, 1)]);
    expect(textsOf().filter((text) => text.startsWith('દરેક'))).toEqual(['દરેક ૨૫ કિલો', 'દરેક ૫૦ કિલો']);
    expect(spoken()).toContain('દરેક ૨૫ કિલો, દરેક ૫૦ કિલો');
  });

  it('puts the group total in the heading', async () => {
    await mount([invoiceLine({}, 0), invoiceLine({}, 1)]);
    expect(spoken()).toContain('total ₹1,470.00');
  });
});
