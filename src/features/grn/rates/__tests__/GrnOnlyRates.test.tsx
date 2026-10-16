/** "Rates for this GRN only" on the GRN details screen: band and figures, and the tag once the GRN is invoiced. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnOnlyRates } from '../GrnOnlyRates';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import type { RpcGrnRate } from '@/types/rpc-canonical.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
// No GRN id: the Rates section reads nothing and falls back to the GRN-only rates.
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const rate = (over: Partial<RpcGrnRate>): RpcGrnRate => ({
  id: 'r1', item_id: 'gur', item_name: 'Fictional Gur', price_type: 'monthly', weight_min: 21, weight_max: 40, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, archived: false, ...over,
});
let tree: ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
afterEach(() => act(() => tree.unmount()));

describe('RATES FOR THIS GRN ONLY', () => {
  it('lists each rate with its band and figures; the tag appears only on an archived one', () => {
    act(() => { tree = create(<GrnOnlyRates rates={[rate({}), rate({ id: 'r2', item_name: 'Fictional Rice', archived: true, price_type: 'one_time' })]} />); });
    expect(texts()).toEqual([
      'RATES FOR THIS GRN ONLY',
      'Fictional Gur', '21–40 kg · ₹4.50 rent · ₹1.50 labour · 5% tax',
      'Fictional Rice', '21–40 kg · ₹4.50 rent · 5% tax', 'Archived once invoiced',
    ]);
  });

  it('is on the overview tab when the GRN has such rates, and absent when it has none or the server sends none', () => {
    act(() => { tree = create(<GRNOverviewTab rates={[rate({})]} pricing_mode="MONTHLY" />); });
    expect(texts()).toContain('RATES FOR THIS GRN ONLY');
    act(() => tree.unmount());
    act(() => { tree = create(<GRNOverviewTab rates={[]} pricing_mode="MONTHLY" />); });
    expect(texts()).not.toContain('RATES FOR THIS GRN ONLY');
    act(() => tree.unmount());
    act(() => { tree = create(<GRNOverviewTab pricing_mode="MONTHLY" />); });
    expect(texts()).not.toContain('RATES FOR THIS GRN ONLY');
  });
});
