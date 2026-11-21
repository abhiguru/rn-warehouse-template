/** "Rates for this GRN only" on the GRN details screen: band and figures, and the tag once the GRN is invoiced. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { GrnOnlyRates } from '../GrnOnlyRates';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import type { RpcGrnRate } from '@/types/rpc-canonical.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
// No GRN id: the Rates section reads nothing and falls back to the GRN-only rates.
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const rate = (over: Partial<RpcGrnRate>): RpcGrnRate => ({
  id: 'r1', item_id: 'gur', item_name: 'Fictional Gur', price_type: 'monthly', weight_min: 21, weight_max: 40, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, archived: false, ...over,
});
const TITLE = 'RATES FOR THIS GRN ONLY';

describe(TITLE, () => {
  it('lists each rate with its band and figures; the tag appears only on an archived one', async () => {
    await render(<GrnOnlyRates rates={[rate({}), rate({ id: 'r2', item_name: 'Fictional Rice', archived: true, price_type: 'one_time' })]} />);
    const expected = [
      TITLE,
      'Fictional Gur', '21–40 kg · ₹4.50 rent · ₹1.50 labour · 5% tax',
      'Fictional Rice', '21–40 kg · ₹4.50 rent · 5% tax', 'Archived once invoiced',
    ];
    const shown = screen.getAllByText(/./);
    expect(shown).toHaveLength(expected.length);
    shown.forEach((node, i) => expect(node).toHaveTextContent(expected[i], { exact: true }));
    expect(screen.getAllByText('Archived once invoiced')).toHaveLength(1);
  });

  it('is on the overview tab when the GRN has such rates, and absent when it has none or the server sends none', async () => {
    const { unmount } = await render(<GRNOverviewTab rates={[rate({})]} pricing_mode="MONTHLY" />);
    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    await unmount();
    const second = await render(<GRNOverviewTab rates={[]} pricing_mode="MONTHLY" />);
    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
    await second.unmount();
    await render(<GRNOverviewTab pricing_mode="MONTHLY" />);
    expect(screen.queryByText(TITLE)).not.toBeOnTheScreen();
  });
});
