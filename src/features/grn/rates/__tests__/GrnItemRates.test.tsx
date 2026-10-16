/** The Rates section of the GRN Overview tab: sources, grouping, no rate, varies, states, figures, fallback. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnItemRates, groupRates } from '../GrnItemRates';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { RpcGrnItemRate, RpcGrnRate } from '@/types/rpc-canonical.types';

jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const read = getGrnItemRates as jest.Mock;
const lot = (over: Partial<RpcGrnItemRate>): RpcGrnItemRate => ({
  grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'item',
  unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false, ...over,
});
const answer = (rates: RpcGrnItemRate[], price_type: 'monthly' | 'one_time' = 'monthly') =>
  ({ gr_id: 'g1', grn_date: '2026-10-01', price_type, invoiced: false, rates });
const only = (): RpcGrnRate => ({ id: 'r1', item_id: 'gur', item_name: 'Fictional Gur', price_type: 'monthly', weight_min: 21, weight_max: 40, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, archived: false });

let tree: ReactTestRenderer;
const mount = async (el: React.ReactElement) => { await act(async () => { tree = create(el); }); };
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('').replace(/\u00a0/g, ' '));
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => tree.unmount()));

describe('GrnItemRates', () => {
  it('shows each source tag, the weight of one bag, and monthly figures with the band', async () => {
    read.mockResolvedValue(answer([
      lot({ grn_item_id: 'a', source: 'grn' }),
      lot({ grn_item_id: 'b', item_id: 'rice', item_name: 'Fictional Rice', weight: 30, source: 'customer', unit_price: 3 }),
      lot({ grn_item_id: 'c', item_id: 'egg', item_name: 'Fictional Eggs', weight: 10, source: 'item', unit_price: 2, labour_rate: 0.5, tax_percent: 12 }),
    ]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual([
      'RATES',
      'Fictional Gur', '25 kg each', '0–50 kg · ₹4.50 rent · ₹1.50 labour · 5% tax', 'This GRN only',
      'Fictional Rice', '30 kg each', '0–50 kg · ₹3.00 rent · ₹1.50 labour · 5% tax', 'Customer rate',
      'Fictional Eggs', '10 kg each', '0–50 kg · ₹2.00 rent · ₹0.50 labour · 12% tax', 'Item rate',
    ]);
  });

  it('invoice source has no band; varies adds a second tag; one-time leaves labour out', async () => {
    read.mockResolvedValue(answer([lot({ source: 'invoice', weight_min: null, weight_max: null, unit_price: 4.3, varies: true })], 'one_time'));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual(['RATES', 'Fictional Gur', '25 kg each', '₹4.30 rent · 5% tax', 'On the invoice', 'differs by dispatch']);
  });

  it('shares one row between lots with the same item, weight and figures, and splits on a different weight or figure', () => {
    const groups = groupRates([lot({ grn_item_id: 'a' }), lot({ grn_item_id: 'b' }), lot({ grn_item_id: 'c', weight: 50 }), lot({ grn_item_id: 'd', unit_price: 9 })]);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.weight)).toEqual([25, 50, 25]);
  });

  it('a lot with no rate shows "No rate set" and no figures', async () => {
    read.mockResolvedValue(answer([lot({ source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null })]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual(['RATES', 'Fictional Gur', '25 kg each', 'No rate set']);
  });

  it('shows a loading row first, then the rows', async () => {
    let resolve!: (v: unknown) => void;
    read.mockReturnValue(new Promise(r => { resolve = r; }));
    await mount(<GrnItemRates grnId="g1" />);
    expect(tree.root.findAllByProps({ testID: 'grn-item-rates-loading' }).length).toBeGreaterThan(0);
    await act(async () => { resolve(answer([lot({})])); });
    expect(tree.root.findAllByProps({ testID: 'grn-item-rates-loading' })).toHaveLength(0);
    expect(texts()).toContain('Fictional Gur');
  });

  it('shows an error line with Retry, and Retry reads again', async () => {
    read.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(answer([lot({})]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toContain("Couldn't load the rates of this GRN.");
    await act(async () => { tree.root.findByProps({ testID: 'grn-item-rates-retry' }).props.onPress(); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(texts()).toContain('Fictional Gur');
    expect(texts()).not.toContain("Couldn't load the rates of this GRN.");
  });

  it('shows nothing when there are no rows, and nothing on an older server without fallback rates', async () => {
    read.mockResolvedValue(answer([]));
    await mount(<GrnItemRates grnId="g1" />);
    expect(texts()).toEqual([]);
    act(() => tree.unmount());
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
    expect(texts()).toContain('Item rate');
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
    expect(texts()).toContain('Item rate');
  });
});
