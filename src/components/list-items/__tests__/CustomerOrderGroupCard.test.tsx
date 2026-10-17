/**
 * An order card that cannot load its lines asks once, shows why, and asks
 * again only when the user says so (M9-1: it used to ask without end).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CustomerOrderGroupCard } from '@/components/list-items/CustomerOrderGroupCard';
import { OrderService } from '@/services/order-service';
import { t } from '@/i18n';
import type { Order } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
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

function texts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

async function render(isExpanded = true) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<CustomerOrderGroupCard order={order} isExpanded={isExpanded} onToggleExpand={jest.fn()} />);
  });
  // Let any follow-up requests a looping card would make run.
  for (let i = 0; i < 5; i += 1) await act(async () => {});
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('asks once when the server refuses, and shows the reason with a retry', async () => {
  getOrderWithItems.mockResolvedValue({ success: false, message: 'Order not found' });
  const tree = await render();

  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('Order not found');
  expect(texts(tree)).not.toContain(t('lists.orderGroup.noItems'));
  expect(tree.root.findAllByProps({ accessibilityLabel: t('lists.orderGroup.retryLabel') }).length).toBeGreaterThan(0);
});

it('asks once when the request throws', async () => {
  getOrderWithItems.mockRejectedValue(new Error('Network request failed'));
  const tree = await render();

  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain(t('lists.orderGroup.loadFailed'));
});

it('asks again when "Try again" is pressed, and shows the lines when that works', async () => {
  getOrderWithItems.mockResolvedValueOnce({ success: false, message: 'Order not found' });
  const tree = await render();
  getOrderWithItems.mockResolvedValue({ success: true, data: { ...order, items: lines } });

  const retry = tree.root.findAll(node => node.props.accessibilityLabel === t('lists.orderGroup.retryLabel') && typeof node.props.onPress === 'function')[0];
  await act(async () => {
    retry.props.onPress();
  });
  for (let i = 0; i < 3; i += 1) await act(async () => {});

  expect(getOrderWithItems).toHaveBeenCalledTimes(2);
  expect(texts(tree)).toContain('Example Potatoes');
  expect(texts(tree)).not.toContain('Order not found');
});

it('asks once for an order that loads', async () => {
  getOrderWithItems.mockResolvedValue({ success: true, data: { ...order, items: lines } });
  const tree = await render();
  expect(getOrderWithItems).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('Example Potatoes');
});

it('asks for nothing while the card is closed', async () => {
  getOrderWithItems.mockResolvedValue({ success: false, message: 'Order not found' });
  await render(false);
  expect(getOrderWithItems).not.toHaveBeenCalled();
});

describe('Queue card of a deactivated business', () => {
  const withActive = (active?: boolean) => ({ ...order, customer: { ...order.customer, ...(active === undefined ? {} : { active }) } }) as unknown as Order;
  const label = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityState?.expanded !== undefined)[0].props.accessibilityLabel as string;
  const draw = async (o: Order) => {
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CustomerOrderGroupCard order={o} isExpanded={false} onToggleExpand={jest.fn()} />); });
    return tree;
  };

  it('shows the Deactivated tag and says so in the header label', async () => {
    const tree = await draw(withActive(false));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Deactivated']));
    // A queue card shows no fixed "Open" tag: every order in the queue is open (owner, 2026-10-17).
    expect(texts(tree)).not.toContain('Open');
    expect(label(tree).endsWith(', deactivated')).toBe(true);
  });

  it.each([[true], [undefined]])('shows no tag when active is %s', async (active) => {
    const tree = await draw(withActive(active));
    expect(texts(tree)).not.toContain('Deactivated');
    expect(label(tree)).not.toContain('deactivated');
  });

  it('redraws when only customer.active changes on the same order', async () => {
    const onToggleExpand = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<CustomerOrderGroupCard order={withActive(true)} isExpanded={false} onToggleExpand={onToggleExpand} />); });
    expect(texts(tree)).not.toContain('Deactivated');
    await act(async () => { tree.update(<CustomerOrderGroupCard order={withActive(false)} isExpanded={false} onToggleExpand={onToggleExpand} />); });
    expect(texts(tree)).toContain('Deactivated');
  });
});
