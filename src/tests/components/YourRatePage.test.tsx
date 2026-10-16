/**
 * "Your rate" (app/grn-rate): what a customer sees on tapping a row of a GRN's Rates. Only the rate their own
 * lots of the item are invoiced at, never named as the item's default, a customer rate or a GRN rate.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import YourRatePage from '../../../app/grn-rate/[grnId]/[itemId]';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { RpcGrnItemRate } from '@/types/rpc-canonical.types';

let mockParams: Record<string, string> = { grnId: 'g1', itemId: 'gur', no: 'WM0001' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'customer' } } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn() }));

const read = getGrnItemRates as jest.Mock;
const lot = (over: Partial<RpcGrnItemRate>): RpcGrnItemRate => ({
  grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'item',
  unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false, ...over,
});
const answer = (rates: RpcGrnItemRate[], price_type: 'monthly' | 'one_time' = 'monthly') =>
  ({ gr_id: 'g1', grn_date: '2026-10-01', price_type, invoiced: false, rates });
const RICE = lot({ grn_item_id: 'r1', item_id: 'rice', item_name: 'Fictional Rice', source: 'customer', unit_price: 7.25, labour_rate: 2.75, tax_percent: 12 });

let tree: ReactTestRenderer;
const open = async () => { await act(async () => { tree = create(<YourRatePage />); }); };
/** The plain texts, without the wrapper of the figure line. */
const texts = () =>
  tree.root.findAllByType(Text)
    .map(n => [n.props.children].flat(Infinity))
    .filter(parts => parts.every(part => typeof part === 'string'))
    .map(parts => parts.join(''));
const cards = () => tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('your-rate-card-') && typeof n.type === 'string');

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  act(() => tree.unmount());
  mockParams = { grnId: 'g1', itemId: 'gur', no: 'WM0001' };
});

describe('Your rate', () => {
  it('shows the item\'s default rate as the customer\'s own rate, and nothing of other items', async () => {
    read.mockResolvedValue(answer([lot({ source: 'item' }), RICE]));
    await open();
    expect(read).toHaveBeenCalledWith('g1');
    expect(texts()).toEqual([
      'Back',
      'Fictional Gur',
      'GRN WM0001, goods received on 1 Oct 2026',
      'YOUR RATE',
      '₹4.50', '  per bag, per month',
      'Weight each', '0–50 kg', 'Labour', '₹1.50 per bag', 'Tax', '5%',
    ]);
    const all = texts().join(' ');
    expect(all).not.toMatch(/default|Item rate|Customer rate|This GRN only|Standard/i);
    expect(all).not.toContain('7.25');
    expect(all).not.toContain('Fictional Rice');
  });

  it('a customer rate and a GRN rate look the same as the default: no source is named', async () => {
    read.mockResolvedValue(answer([lot({ source: 'customer', unit_price: 3.75 })]));
    await open();
    const customer = texts();
    act(() => tree.unmount());
    read.mockResolvedValue(answer([lot({ source: 'grn', unit_price: 3.75 })]));
    await open();
    expect(texts()).toEqual(customer);
  });

  it('gives each rate of the item its own card, titled with the bag weight, when its lots differ', async () => {
    read.mockResolvedValue(answer([lot({ grn_item_id: 'a' }), lot({ grn_item_id: 'b', weight: 60, unit_price: 6, weight_min: 51, weight_max: 100 }), lot({ grn_item_id: 'c' })]));
    await open();
    expect(cards().map(c => c.props.testID)).toEqual(['your-rate-card-a', 'your-rate-card-b']);
    expect(texts()).toEqual(expect.arrayContaining(['25 kg each', '60 kg each', '₹4.50', '₹6.00', '51–100 kg']));
  });

  it('on an invoiced GRN shows the invoice\'s figures without a band, says so, and notes a rate that differs by dispatch', async () => {
    read.mockResolvedValue(answer([lot({ source: 'invoice', weight_min: null, weight_max: null, unit_price: 4.3, varies: true })]));
    await open();
    const s = texts();
    expect(s).not.toContain('Weight each');
    expect(s).toContain('₹4.30');
    expect(s).toContain('Dispatches of these bags were invoiced at different rates. This is the rate of the first dispatch.');
    expect(s).toContain('As charged on the invoice.');
  });

  it('a one-time GRN has no labour and says once', async () => {
    read.mockResolvedValue(answer([lot({ unit_price: 9 })], 'one_time'));
    await open();
    expect(texts()).toEqual(expect.arrayContaining(['₹9.00', '  per bag, once']));
    expect(texts()).not.toContain('Labour');
  });

  it('says there is no rate yet, with Back, when the item has none on this GRN', async () => {
    read.mockResolvedValue(answer([lot({ source: null, unit_price: null, labour_rate: null, tax_percent: null, weight_min: null, weight_max: null })]));
    await open();
    expect(texts()).toContain('There is no rate for this item on this GRN yet.');
    expect(texts()).not.toContain('YOUR RATE');
    act(() => tree.root.findAll(n => n.props.testID === 'your-rate-missing')[0].findAll(n => typeof n.props.onPress === 'function')[0].props.onPress());
    expect(router.back).toHaveBeenCalled();
  });

  it('without the GRN number names the day only; a failed read offers Try again', async () => {
    mockParams = { grnId: 'g1', itemId: 'gur' };
    read.mockRejectedValueOnce(new Error('down')).mockResolvedValue(answer([lot({})]));
    await open();
    const retry = tree.root.findAll(n => n.props.testID === 'your-rate-error')[0].findAll(n => typeof n.props.onPress === 'function')[0];
    await act(async () => { retry.props.onPress(); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(texts()).toContain('Goods received on 1 Oct 2026');
  });
});
