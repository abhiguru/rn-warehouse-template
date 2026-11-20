/** The Rates section of the GRN Overview tab: sources, grouping, no rate, varies, states, figures, fallback. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GrnItemRates, groupRates } from '../GrnItemRates';
import { router } from 'expo-router';
import { MIXED_PACKAGING } from '@/utils/packagingWord';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { RpcGrnItemRate, RpcGrnRate } from '@/types/rpc-canonical.types';

jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The owner's phone: 411 dp wide at font scale 1.3 (jest's default window is font scale 2).
let mockFontScale = 1.3;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: mockFontScale }),
}));

const read = getGrnItemRates as jest.Mock;
const lot = (over: Partial<RpcGrnItemRate>): RpcGrnItemRate => ({
  grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'item',
  unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false, ...over,
});
const answer = (rates: RpcGrnItemRate[], price_type: 'monthly' | 'one_time' = 'monthly') =>
  ({ gr_id: 'g1', grn_date: '2026-10-01', price_type, invoiced: false, rates });
const only = (): RpcGrnRate => ({ id: 'r1', item_id: 'gur', item_name: 'Fictional Gur', price_type: 'monthly', weight_min: 21, weight_max: 40, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, archived: false });

// A test that mounts twice gets a new key, so the second element is mounted afresh, not updated.
let mounts = 0;
let rendered = false;
const mount = async (el: React.ReactElement) => {
  const keyed = React.cloneElement(el, { key: ++mounts });
  if (rendered) await screen.rerender(keyed);
  else {
    rendered = true;
    await render(keyed);
  }
};
const user = () => userEvent.setup({ delay: 0 });
// A rate row is a Pressable with the role "button" and the testID below; the other buttons on the screen are not rows.
const links = () => screen.queryAllByRole('button').filter(n => n.props.testID === 'grn-item-rate-row');
// Every row, a link or a plain one: its accessible label is read from the row itself.
const rows = () => screen.queryAllByTestId('grn-item-rate-row');
const texts = () => screen.queryAllByText(/[\s\S]/).map(n => [n.props.children].flat(Infinity).join('').replace(/\u00a0/g, ' '));
let held: (() => void) | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  rendered = false;
});
afterEach(() => {
  held?.();
  held = undefined;
  mockFontScale = 1.3;
  mockRole = 'admin';
});

describe('GrnItemRates', () => {
  it('is a table, Item | Rent (₹) | Labour (₹) | Tax (%), one row per lot with its weight, band and source tag', async () => {
    read.mockResolvedValue(answer([
      lot({ grn_item_id: 'a', source: 'grn' }),
      lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', weight: 30, source: 'customer', unit_price: 3 }),
      lot({ grn_item_id: 'c', item_id: 'egg', item_name: 'Fictional Eggs', weight: 10, source: 'item', unit_price: 2, labour_rate: 0.5, tax_percent: 12 }),
    ]));
    await mount(<GrnItemRates grnId="g1" />);
    // Only the name in the item cell (owner, 2026-10-16): the rate card has the details.
    expect(texts()).toEqual([
      'RATES',
      'Item', 'Rent (₹)', 'Labour (₹)', 'Tax (%)',
      'Fictional Gur', '4.50', '1.50', '5',
      'Fictional Rice', '3.00', '1.50', '5',
      'Fictional Eggs', '2.00', '0.50', '12',
      'Rent and labour per bag, per month.',
    ]);
  });

  it('gives each number column one width, so the values line up under their heading', async () => {
    read.mockResolvedValue(answer([lot({ grn_item_id: 'a', unit_price: 99.95 }), lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', unit_price: 4.3 })]));
    await mount(<GrnItemRates grnId="g1" />);
    const widthOf = (text: string) => {
      const node = screen.getByText(text);
      return StyleSheet.flatten(node.props.style).width;
    };
    expect(widthOf('99.95')).toBe(widthOf('4.30'));
    expect(widthOf('Rent (₹)')).toBe(widthOf('4.30'));
  });

  it('invoice source has no band; varies adds a second tag; a one-time GRN has no Labour column', async () => {
    read.mockResolvedValue(answer([lot({ source: 'invoice', weight_min: null, weight_max: null, unit_price: 4.3, varies: true })], 'one_time'));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual(['RATES', 'Item', 'Rent (₹)', 'Tax (%)', 'Fictional Gur', '4.30', '5', 'Rent per bag, once.']);
  });

  it('at large text keeps the Rent column and moves labour and tax under the item', async () => {
    mockFontScale = 2;
    read.mockResolvedValue(answer([lot({ source: 'grn' })]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual(['RATES', 'Item', 'Rent (₹)', 'Fictional Gur', 'Labour ₹1.50 · Tax 5%', '4.50', 'Rent and labour per bag, per month.']);
  });

  it('shares one row between lots with the same item, weight and figures, and splits on a different weight or figure', () => {
    const groups = groupRates([lot({ grn_item_id: 'a' }), lot({ grn_item_id: 'b' }), lot({ grn_item_id: 'c', weight: 50 }), lot({ grn_item_id: 'd', unit_price: 9 })]);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.weight)).toEqual([25, 50, 25]);
  });

  it('a lot with no rate shows "No rate set" and "—" in its number cells', async () => {
    read.mockResolvedValue(answer([lot({ source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null })]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual([
      'RATES', 'Item', 'Rent (₹)', 'Labour (₹)', 'Tax (%)',
      'Fictional Gur', 'No rate set', '—', '—', '—',
      'Rent and labour per bag, per month.',
    ]);
  });

  it('shows the weight of one bag only when an item has more than one row', async () => {
    read.mockResolvedValue(answer([lot({ grn_item_id: 'a' }), lot({ grn_item_id: 'b', weight: 50, weight_min: 41, weight_max: 100, unit_price: 6 }), lot({ grn_item_id: 'c', item_id: 'rice', item_name: 'Fictional Rice' })]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual([
      'RATES', 'Item', 'Rent (₹)', 'Labour (₹)', 'Tax (%)',
      'Fictional Gur', '25 kg each', '4.50', '1.50', '5',
      'Fictional Gur', '50 kg each', '6.00', '1.50', '5',
      'Fictional Rice', '4.50', '1.50', '5',
      'Rent and labour per bag, per month.',
    ]);
  });

  const noRate = { source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null } as const;
  const rowsBySource = [
    lot({ grn_item_id: 'a', item_id: 'gur', item_name: 'Fictional Gur', source: 'item' }),
    lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', source: 'customer', unit_price: 3 }),
    lot({ grn_item_id: 'c', item_id: 'egg', item_name: 'Fictional Eggs', source: 'grn', unit_price: 2 }),
    lot({ grn_item_id: 'd', item_id: 'tea', item_name: 'Fictional Tea', source: 'invoice', unit_price: 6 }),
    lot({ grn_item_id: 'e', item_id: 'ajwain', item_name: 'Fictional Ajwain', ...noRate }),
  ];

  it.each(['admin', 'supervisor'])('a %s taps an item rate to the item\'s Pricing tab (no day), and a customer rate to the customer\'s Pricing tab on that item', async role => {
    const { router } = require('expo-router');
    mockRole = role;
    read.mockResolvedValue(answer(rowsBySource));
    await mount(<GrnItemRates grnId="g1" grnNumber="WM0001" customerId="cust-1" customerName="Fictional Traders" canEdit />);
    // 'item', 'customer' and 'grn' rows are links: 'invoice' and no-rate rows are plain rows.
    expect(links()).toHaveLength(3);
    expect(links().map(n => n.props.accessibilityHint)).toEqual([
      "Opens the item's Pricing tab.",
      "Opens Fictional Traders's own rate.",
      'Opens Edit GRN at its Rates, where this rate is changed.',
    ]);
    await user().press(links()[0]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'gur', tab: 'pricing' } });
    expect(router.push.mock.calls[router.push.mock.calls.length - 1][0].params).not.toHaveProperty('on');
    await user().press(links()[1]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/customer/[id]', params: { id: 'cust-1', tab: 'pricing', item: 'rice' } });
    // A rate typed on this GRN opens the GRN's edit on its Review step, at the Rates block (owner, 2026-10-17).
    await user().press(links()[2]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step3', params: { id: 'g1', focus: 'rates' } });
    // The plain rows keep their label (with the source) for a screen reader.
    const plain = rows().filter(n => n.props.accessibilityRole !== 'button');
    expect(plain.map(n => n.props.accessibilityLabel)).toEqual([
      'Fictional Tea, On the invoice, Rent ₹6.00, Labour ₹1.50, Tax 5%',
      'Fictional Ajwain, No rate set',
    ]);
  });

  it('a customer rate is not a link while the GRN\'s customer is unknown', async () => {
    read.mockResolvedValue(answer(rowsBySource));
    await mount(<GrnItemRates grnId="g1" />);
    expect(links().map(n => n.props.accessibilityHint)).toEqual(["Opens the item's Pricing tab."]);
  });

  it('a rate typed on this GRN is not a link for a manager who may not edit the GRN', async () => {
    read.mockResolvedValue(answer(rowsBySource));
    await mount(<GrnItemRates grnId="g1" customerId="cust-1" customerName="Fictional Traders" />);
    expect(links().map(n => n.props.accessibilityHint)).toEqual(["Opens the item's Pricing tab.", "Opens Fictional Traders's own rate."]);
  });

  it('staff never get the GRN-rate link, even when they may edit the GRN', async () => {
    mockRole = 'staff';
    read.mockResolvedValue(answer(rowsBySource));
    await mount(<GrnItemRates grnId="g1" customerId="cust-1" canEdit />);
    expect(links()).toHaveLength(0);
  });

  it('staff get the table only: no row is a link to the price list', async () => {
    mockRole = 'staff';
    read.mockResolvedValue(answer([lot({ grn_item_id: 'a' })]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(links()).toHaveLength(0);
    expect(texts()).toEqual(expect.arrayContaining(['Fictional Gur', '4.50', '1.50', '5']));
  });

  it('a customer, who cannot open Item pricing, gets "Your rate" for a priced row, and no link without a rate', async () => {
    const { router } = require('expo-router');
    mockRole = 'customer';
    read.mockResolvedValue(answer([lot({ grn_item_id: 'a' }), lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null })]));
    await mount(<GrnItemRates grnId="g1" grnNumber="WM0001" />);
    const links = screen.queryAllByRole('button').filter(n => n.props.testID === 'grn-item-rate-row');
    expect(links.map(r => r.props.accessibilityLabel)).toEqual(['Fictional Gur, Rent ₹4.50, Labour ₹1.50, Tax 5%']);
    expect(links[0].props.accessibilityHint).toBe('Opens your rate.');
    await user().press(links[0]);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/grn-rate/[grnId]/[itemId]', params: { grnId: 'g1', itemId: 'gur', no: 'WM0001' } });
  });

  it('never tells a customer where a rate comes from, in the screen-reader label either; staff still hear it', async () => {
    const lots = [lot({ grn_item_id: 'a', source: 'item' }), lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', source: 'customer', unit_price: 3 }), lot({ grn_item_id: 'c', item_id: 'egg', item_name: 'Fictional Eggs', source: 'grn', unit_price: 2 })];
    const labels = () => rows().map(n => n.props.accessibilityLabel as string);
    mockRole = 'customer';
    read.mockResolvedValue(answer(lots));
    await mount(<GrnItemRates grnId="g1" />);
    expect(labels()).toEqual(['Fictional Gur, Rent ₹4.50, Labour ₹1.50, Tax 5%', 'Fictional Rice, Rent ₹3.00, Labour ₹1.50, Tax 5%', 'Fictional Eggs, Rent ₹2.00, Labour ₹1.50, Tax 5%']);
    expect([...labels(), ...texts()].join(' ')).not.toMatch(/Item rate|Customer rate|This GRN only/);
    mockRole = 'staff';
    await mount(<GrnItemRates grnId="g1" />);
    expect(labels()[0]).toContain('Item rate');
  });

  it('shows a loading row first, then the rows', async () => {
    let resolve!: () => void;
    read.mockReturnValue(new Promise(r => { resolve = () => r(answer([lot({})])); held = resolve; }));
    await mount(<GrnItemRates grnId="g1" />);
    expect(screen.getByText('Loading rates')).toBeOnTheScreen();
    await act(async () => { resolve(); });
    expect(screen.queryByText('Loading rates')).not.toBeOnTheScreen();
    expect(texts()).toContain('Fictional Gur');
  });

  it('shows an error line with Retry, and Retry reads again', async () => {
    read.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(answer([lot({})]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toContain("Couldn't load the rates of this GRN.");
    await user().press(screen.getByRole('button', { name: 'Try again' }));
    expect(read).toHaveBeenCalledTimes(2);
    expect(texts()).toContain('Fictional Gur');
    expect(texts()).not.toContain("Couldn't load the rates of this GRN.");
  });

  it('shows nothing when there are no rows, and nothing on an older server without fallback rates', async () => {
    read.mockResolvedValue(answer([]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual([]);
    read.mockResolvedValue(null);
    await mount(<GrnItemRates grnId="g1" fallbackRates={[]} />);
    expect(texts()).toEqual([]);
  });
});

describe('GRNOverviewTab Rates section', () => {
  it('shows the new section', async () => {
    read.mockResolvedValue(answer([lot({})]));
    await mount(<GRNOverviewTab grn_id="g1" pricing_mode="MONTHLY" rates={[only()]} />);
    expect(texts()).toContain('RATES');
    expect(texts()).not.toContain('RATES FOR THIS GRN ONLY');
    expect(texts()).toContain('Rent (₹)');
  });

  it('passes the GRN number on, for the customer\'s "Your rate" page', async () => {
    const { router } = require('expo-router');
    mockRole = 'customer';
    read.mockResolvedValue(answer([lot({})]));
    await mount(<GRNOverviewTab grn_id="g1" gr_no="WM0001" pricing_mode="MONTHLY" />);
    const row = links()[0];
    await user().press(row);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/grn-rate/[grnId]/[itemId]', params: { grnId: 'g1', itemId: 'gur', no: 'WM0001' } });
  });

  it('passes the GRN\'s customer on: a manager\'s tap on a customer rate opens that customer\'s Pricing tab', async () => {
    const { router } = require('expo-router');
    read.mockResolvedValue(answer([lot({ item_id: 'rice', item_name: 'Fictional Rice', source: 'customer' })]));
    await mount(<GRNOverviewTab grn_id="g1" gr_no="WM0001" pricing_mode="MONTHLY" customer_details={{ id: 'cust-9', name: 'Fictional Traders' }} />);
    await user().press(links()[0]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/customer/[id]', params: { id: 'cust-9', tab: 'pricing', item: 'rice' } });
    expect(links()[0].props.accessibilityHint).toBe("Opens Fictional Traders's own rate.");
  });

  it('passes can_edit on: a manager\'s tap on a rate typed on this GRN opens its Rates block only when the GRN may be edited', async () => {
    const { router } = require('expo-router');
    read.mockResolvedValue(answer([lot({ item_id: 'egg', item_name: 'Fictional Eggs', source: 'grn' })]));
    await mount(<GRNOverviewTab grn_id="g1" gr_no="WM0001" pricing_mode="MONTHLY" />);
    expect(links()).toHaveLength(0);
    await mount(<GRNOverviewTab grn_id="g1" gr_no="WM0001" pricing_mode="MONTHLY" can_edit />);
    await user().press(links()[0]);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/grn-edit/[id]/step3', params: { id: 'g1', focus: 'rates' } });
  });

  it('falls back to the GRN-only rates on an older server', async () => {
    read.mockResolvedValue(null);
    await mount(<GRNOverviewTab grn_id="g1" pricing_mode="MONTHLY" rates={[only()]} />);
    expect(texts()).toContain('RATES FOR THIS GRN ONLY');
    expect(texts()).toContain('21–40 kg · ₹4.50 rent · ₹1.50 labour · 5% tax');
  });

  it('a customer (no edit, no delete, no actions) still sees the rates of their own GRN', async () => {
    read.mockResolvedValue(answer([lot({})]));
    await mount(<GRNOverviewTab grn_id="g1" pricing_mode="MONTHLY" can_edit={false} can_delete={false} />);
    expect(texts()).toContain('RATES');
    expect(texts()).toContain('Rent (₹)');
  });
});

describe('the note under the table names what the GRN is counted in (D18)', () => {
  it('says per box for boxes, per unit when the lots are counted in different things, per bag otherwise', async () => {
    read.mockResolvedValue(answer([lot({})]));
    await mount(<GrnItemRates grnId="g1" packaging="box" />);
    expect(texts()).toContain('Rent and labour per box, per month.');

    await mount(<GrnItemRates grnId="g1" packaging={MIXED_PACKAGING} />);
    expect(texts()).toContain('Rent and labour per unit, per month.');

    await mount(<GrnItemRates grnId="g1" packaging="crate" />);
    expect(texts()).toContain('Rent and labour per crate, per month.');

    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toContain('Rent and labour per bag, per month.');
  });

  it('the Your-rate link carries the lot\'s own packaging', async () => {
    mockRole = 'customer';
    read.mockResolvedValue(answer([lot({ grn_item_id: 'lot-a' })]));
    await mount(<GrnItemRates grnId="g1" grnNumber="A1" packagingByLot={{ 'lot-a': 'Box' }} />);
    await user().press(links()[0]);
    expect(jest.mocked(router.push)).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ pack: 'Box' }) }));
  });
});
