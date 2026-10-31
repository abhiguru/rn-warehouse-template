/** The grouped history card: a removed rate that had already begun reads "from", one still planned reads "planned from". */
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import ChangeGroupCard from '../components/ChangeGroupCard';
import type { GroupView } from '../utils/priceHistory';
import type { ItemPriceHistoryEntry } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const entries = [{ id: 1, item_name: 'Fictional Gur', customer_id: null, changed_at: '2026-10-31T14:26:00+00:00', changed_by_name: 'Admin' }] as unknown as ItemPriceHistoryEntry[];
const band = { min: 0, max: 50 };
const view = (removed: GroupView['removed']): GroupView => ({ kind: 'changed', day: '2026-09-05', bands: [], removed });

it('says "from" for a removed rate that had begun and "planned from" for one that had not', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <ChangeGroupCard
        entries={entries}
        view={view([
          { band, field: 'monthlyPrice', price: 10, from: '2026-09-15', begun: true },
          { band, field: 'monthlyPrice', price: 12, from: '2026-12-01', begun: false },
        ])}
      />,
    );
  });
  const texts = tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
  expect(texts).toEqual(expect.arrayContaining(['Removed: 0–50 kg, ₹10.00, from 15/09/26', 'Removed: 0–50 kg, ₹12.00, planned from 01/12/26']));
  await act(async () => { tree.unmount(); });
});
