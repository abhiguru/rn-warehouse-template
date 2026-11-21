/**
 * An order card that cannot load its lines asks once, shows why, and asks
 * again only when the user says so (M9-1: it used to ask without end).
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import { OrderService } from '@/services/order-service';
import { t } from '@/i18n';
import type { Order } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));

const getOrderWithItems = OrderService.getOrderWithItems as jest.Mock;

const order = {
  id: 'order-1',
  customer_id: 'customer-1',
  customer: { id: 'customer-1', name: 'Fictional Traders' },
  item_count: 1,
  quantity_sum: 5,
  updated_at: '2026-10-10T08:00:00Z',
} as unknown as Order;

const lines = [{ id: 'line-1', requested_quantity: 5, grn_item: { name: 'Example Potatoes', current_stock: 20 } }];

const texts = (): string[] => screen.queryAllByText(/[\s\S]*/, { includeHiddenElements: true }).map(node => [].concat(node.props.children).join(''));

async function draw(isExpanded = true) {
  await render(<CustomerOrderGroupCard order={order} isExpanded={isExpanded} onToggleExpand={jest.fn()} />);
  // Let any follow-up requests a looping card would make run.
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('asks once when the server refuses, and shows the reason with a retry', async () => {
  getOrderWithItems.mockResolvedValue({ success: false, message: 'Order not found' });
  await draw();

  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Order not found')).toBeOnTheScreen();
  expect(texts()).not.toContain(t('lists.orderGroup.noItems'));
  expect(screen.getAllByLabelText(t('lists.orderGroup.retryLabel')).length).toBeGreaterThan(0);
});

it('asks once when the request throws', async () => {
  getOrderWithItems.mockRejectedValue(new Error('Network request failed'));
  await draw();

  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(texts()).toContain(t('lists.orderGroup.loadFailed'));
});

it('asks again when "Try again" is pressed, and shows the lines when that works', async () => {
  getOrderWithItems.mockResolvedValueOnce({ success: false, message: 'Order not found' });
  await draw();
  getOrderWithItems.mockResolvedValue({ success: true, data: { ...order, items: lines } });

  await userEvent.press(screen.getAllByLabelText(t('lists.orderGroup.retryLabel'))[0]);
  for (let i = 0; i < 3; i += 1) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

  expect(getOrderWithItems).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Example Potatoes')).toBeOnTheScreen();
  expect(texts()).not.toContain('Order not found');
});

it('asks once for an order that loads', async () => {
  getOrderWithItems.mockResolvedValue({ success: true, data: { ...order, items: lines } });
  await draw();
  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Example Potatoes')).toBeOnTheScreen();
});

it('asks for nothing while the card is closed', async () => {
  getOrderWithItems.mockResolvedValue({ success: false, message: 'Order not found' });
  await draw(false);
  expect(getOrderWithItems).not.toHaveBeenCalled();
});

describe('Queue card of a deactivated business', () => {
  const withActive = (active?: boolean) => ({ ...order, customer: { ...order.customer, ...(active === undefined ? {} : { active }) } }) as unknown as Order;
  /** The card's header: the one control that says whether it is open. */
  const header = () => screen.getByRole('button', { expanded: false });
  const drawOrder = async (o: Order) => {
    await render(<CustomerOrderGroupCard order={o} isExpanded={false} onToggleExpand={jest.fn()} />);
  };

  it('shows the Deactivated tag and says so in the header label', async () => {
    await drawOrder(withActive(false));
    expect(texts()).toEqual(expect.arrayContaining(['Deactivated']));
    // A queue card shows no fixed "Open" tag: every order in the queue is open (owner, 2026-10-17).
    expect(texts()).not.toContain('Open');
    expect(header()).toHaveAccessibleName(/, deactivated$/);
  });

  it.each([[true], [undefined]])('shows no tag when active is %s', async (active) => {
    await drawOrder(withActive(active));
    expect(texts()).not.toContain('Deactivated');
    expect(header()).not.toHaveAccessibleName(/deactivated/);
  });

  it('redraws when only customer.active changes on the same order', async () => {
    const onToggleExpand = jest.fn();
    await render(<CustomerOrderGroupCard order={withActive(true)} isExpanded={false} onToggleExpand={onToggleExpand} />);
    expect(texts()).not.toContain('Deactivated');
    await screen.rerender(<CustomerOrderGroupCard order={withActive(false)} isExpanded={false} onToggleExpand={onToggleExpand} />);
    expect(texts()).toContain('Deactivated');
  });
});
