/** Orders tab card: a deactivated business gets a neutral "Deactivated" tag (backend migration 82 field customer.active). */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import type { Order } from '@/types/order.types';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const orderWith = (customer: Record<string, unknown>) => ({
  id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN',
  customer: { id: 'fictional-customer', name: 'Fictional Traders', city: 'Fictional Town', ...customer },
  item_count: 3, quantity_sum: 120, updated_at: new Date().toISOString(),
} as unknown as Order);

/** What a screen reader says for the card: the label of its one button. */
const label = () => screen.getByRole('button').props.accessibilityLabel as string;

async function renderCard(order: Order, words?: string[]) {
  await render(<MemoizedOrderItem order={order} onPress={jest.fn()} words={words} />);
}

describe('Orders tab card of a deactivated business', () => {
  it('shows Deactivated and says so in the accessibility label', async () => {
    await renderCard(orderWith({ active: false }));
    expect(screen.getByText('Deactivated')).toBeOnTheScreen();
    // An open order with items has no status tag (owner, 2026-10-17).
    expect(screen.queryByText('Open')).not.toBeOnTheScreen();
    expect(label().endsWith(', deactivated')).toBe(true);
  });

  it.each([['an active business', { active: true }], ['an older backend without the field', {}]])('shows no tag for %s', async (_n, customer) => {
    await renderCard(orderWith(customer));
    expect(screen.queryByText('Deactivated')).not.toBeOnTheScreen();
    expect(label()).not.toContain('deactivated');
  });

  it('draws again when only customer.active changes on the same order', async () => {
    const onPress = jest.fn();
    const base = orderWith({ active: true });
    await render(<MemoizedOrderItem order={base} onPress={onPress} />);
    expect(screen.queryByText('Deactivated')).not.toBeOnTheScreen();
    const next = { ...base, customer: { ...base.customer!, active: false } } as Order;
    expect(next.updated_at).toBe(base.updated_at);
    await screen.rerender(<MemoizedOrderItem order={next} onPress={onPress} />);
    expect(screen.getByText('Deactivated')).toBeOnTheScreen();
  });
});

/**
 * Orders polish (owner, 2026-10-17): the units total is the main value on the right with its status tag under it
 * only when the tag says something, and TalkBack reads what the card shows, in card order.
 */
describe('Orders tab card: value column and TalkBack label', () => {
  const at = new Date(2026, 9, 16, 10, 30).toISOString();
  const order = (extra: Record<string, unknown>) => ({ ...orderWith({}), updated_at: at, ...extra } as unknown as Order);
  // The texts of the value column on the right, top to bottom (it has no role or label of its own).
  const value = () => {
    const column = within(screen.getByTestId('order-card-value'));
    const texts = column.queryAllByText(/./);
    return texts.map(node => [node.props.children].flat().join(''));
  };

  it('shows the units total over its unit word, with no tag, for an open order with items', async () => {
    await renderCard(order({}));
    expect(value()).toEqual(['120', 'units']);
    expect(screen.getByText('3 items')).toBeOnTheScreen();
  });

  it('shows the tag under the value for a dispatched order, and only the tag for an order with no items', async () => {
    await renderCard(order({ status: 'DISPATCHED' }));
    expect(value()).toEqual(['120', 'units', 'Dispatched']);
    await screen.rerender(<MemoizedOrderItem order={order({ item_count: 0, quantity_sum: 0 })} onPress={jest.fn()} />);
    expect(value()).toEqual(['Empty']);
  });

  it('reads the card in order: customer, items and units, city, date; the status only when its tag shows', async () => {
    // The card shows the date as 16/10/26; a screen reader is given it in words.
    const date = '16 Oct 2026';
    await renderCard(order({}));
    expect(screen.getByText('Fictional Town · 16/10/26')).toBeOnTheScreen();
    expect(screen.getByRole('button')).toHaveAccessibleName(`Order for Fictional Traders, 3 items · 120 units, Location: Fictional Town, ${date}`);
    await screen.rerender(<MemoizedOrderItem order={order({ status: 'DISPATCHED' })} onPress={jest.fn()} />);
    expect(screen.getByRole('button'))
      .toHaveAccessibleName(`Order for Fictional Traders, 3 items · 120 units, Dispatched, Location: Fictional Town, ${date}`);
  });

  it('reads why a search found the order, worded as on the Dispatch card', async () => {
    const items = [{ grn_items_item_name: 'Fictional Garlic', grn_items_package_mark: 'FG-1', grns_gr_no: null }];
    await renderCard(order({ items }), ['garlic']);
    expect(label().endsWith(', Matched Fictional Garlic')).toBe(true);
  });
});

describe('Orders tab card read aloud for an order older than a day', () => {
  it('says the date in words ("9 Oct 2026"), while the card shows DD/MM/YY', async () => {
    const old = { ...orderWith({}), updated_at: '2020-10-09T08:00:00.000Z' } as Order;
    await renderCard(old);
    expect(screen.getByText('Fictional Town · 09/10/20')).toBeOnTheScreen();
    expect(label()).toContain('9 Oct 2020');
    expect(label()).not.toMatch(/\d\d\/\d\d\/\d\d/);
  });
});
