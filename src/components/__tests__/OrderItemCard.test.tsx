import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { act, render, screen, userEvent } from '@testing-library/react-native';
import OrderItemCard from '../OrderItemCard';
import type { OrderItem } from '@/types/order.types';
import { getTokens, type Brand, type Mode } from '@/theme/tokens';
import { formatDate } from '@/utils/formatters';
import { setLanguage } from '@/i18n';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../StockIndicator', () => 'StockIndicator');
let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (state: unknown) => unknown) => sel({ theme: mockTheme }),
}));

const item: OrderItem = {
  id: 'line-1', order_id: 'order-1', grn_item_id: 'lot-1', requested_quantity: 3, created_at: '',
  grn_item: {
    id: 'lot-1', name: 'Fictional Onions', packaging: 'Bag', current_stock: 10, original_quantity: 10, gr_id: 'grn-1',
  },
};

// Promises a test holds open are released in afterEach, so a failing test cannot leave Jest hanging.
const held: (() => void)[] = [];
function deferred<T>(release: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  held.push(() => resolve(release));
  return { promise, resolve };
}

type JsonNode = { type: string; props: Record<string, unknown>; children: (JsonNode | string)[] | null };

const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
// The first match, as before: at quantity 1 the − button carries the same "Remove …" name as the trash button.
const button = (name: string) => screen.getAllByRole('button', { name })[0];
const press = (name: string) => user.press(button(name));
/** The card's own handler, called past the disabled state: what the card's guard has to hold against. */
const pressPastDisabled = async (name: string) => {
  // Testing Library shows host views only; the Pressable's own onPress is on the fiber above the button's view.
  let fiber = button(name).unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const onPress = fiber?.memoizedProps.onPress as () => void;
  await act(async () => { onPress(); });
};
/** The state exactly as the card states it: the `disabled` key is there, true or false (not just missing). */
const expectOff = (name: string, off: boolean) => {
  const el = button(name);
  if (off) expect(el).toBeDisabled(); else expect(el).toBeEnabled();
  expect(el.props.accessibilityState.disabled).toBe(off);
};
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const collect = (node: unknown, found: JsonNode[] = []): JsonNode[] => {
  if (Array.isArray(node)) node.forEach(child => collect(child, found));
  else if (node && typeof node === 'object') {
    found.push(node as JsonNode);
    collect((node as JsonNode).children, found);
  }
  return found;
};
const mountCard = (props: Partial<React.ComponentProps<typeof OrderItemCard>> = {}) =>
  render(<OrderItemCard item={item} onQuantityChange={jest.fn()} onRemove={jest.fn()} {...props} />);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  held.splice(0).forEach(release => release());
  jest.useRealTimers();
});

it('shows SAVED only after the server confirms the quantity', async () => {
  const save = deferred<boolean>(true);
  const onQuantityChange = jest.fn(() => save.promise);
  await mountCard({ onQuantityChange });
  await press('Increase Fictional Onions by 1');
  await advance(2000);
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
  expect(screen.getByText('Saving…')).toBeOnTheScreen();
  expect(screen.queryByText('Saved')).not.toBeOnTheScreen();
  await act(async () => { save.resolve(true); await save.promise; });
  expect(screen.getByText('Saved')).toBeOnTheScreen();
  expect(screen.getByText('4')).toBeOnTheScreen();
  await screen.unmount();
});

it('reverts to the stored quantity when the server refuses the change', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(false));
  await mountCard({ onQuantityChange });
  await press('Increase Fictional Onions by 1');
  expect(screen.getByText('4')).toBeOnTheScreen();
  await advance(2000);
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
  expect(screen.getByText('3')).toBeOnTheScreen();
  expect(screen.queryByText('4')).not.toBeOnTheScreen();
  expect(screen.queryByText('Saved')).not.toBeOnTheScreen();
  await screen.unmount();
});

it('names its own line when it removes it or saves a pending change on unmount', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(true));
  const onRemove = jest.fn();
  await mountCard({ onQuantityChange, onRemove });
  await press('Remove Fictional Onions from order');
  expect(onRemove).toHaveBeenCalledWith('line-1', expect.any(Function));
  await press('Increase Fictional Onions by 1');
  expect(onQuantityChange).not.toHaveBeenCalled();
  await screen.unmount();
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
});

// Review 2026-10-20, M1 and M6: the question "Remove …?" and the removal that follows.
describe('removing the line', () => {
  const REMOVE = 'Remove Fictional Onions from order';
  const DECREASE = 'Decrease Fictional Onions by 1';
  const INCREASE = 'Increase Fictional Onions by 1';

  it('Cancel after quick − taps: nothing is sent while the question is open, then the quantity shown is saved, never an endless "Saving…"', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const question = deferred<boolean>(false);
    const onRemove = jest.fn(() => question.promise);
    await mountCard({ onQuantityChange, onRemove });

    // 3 → 2 → 1, then the third tap asks whether to remove the line.
    await press(DECREASE);
    await press(DECREASE);
    expect(screen.getByText('1')).toBeOnTheScreen();
    await press(REMOVE);
    expect(onRemove).toHaveBeenCalledWith('line-1', expect.any(Function));
    expectOff(INCREASE, true);

    // The question stays open longer than the 2 s wait: the change waiting to be saved is held back.
    await advance(2500);
    expect(onQuantityChange).not.toHaveBeenCalled();
    expect(screen.getByText('Saving…')).toBeOnTheScreen();

    // Cancel: the line stays, the buttons are on again, and the quantity the person stepped to is saved.
    await act(async () => { question.resolve(false); await question.promise; });
    await flush();
    expect(onQuantityChange).toHaveBeenCalledTimes(1);
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 1, 'order-1');
    expectOff(INCREASE, false);
    expect(screen.getByText('Saved')).toBeOnTheScreen();
    expect(screen.queryByText('Saving…')).not.toBeOnTheScreen();
    await screen.unmount();
  });

  it('Cancel within the 2 s wait changes nothing: the waiting change goes out at its time', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve(false));
    await mountCard({ onQuantityChange, onRemove });
    await press(DECREASE);
    await press(DECREASE);
    await press(REMOVE);
    await flush();
    expect(onQuantityChange).not.toHaveBeenCalled();
    expectOff(INCREASE, false);
    await advance(2000);
    await flush();
    expect(onQuantityChange).toHaveBeenCalledTimes(1);
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 1, 'order-1');
    await screen.unmount();
  });

  it('after Cancel the removal flag is down: a change made then is saved when the screen is left within 2 s', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve(false));
    await mountCard({ onQuantityChange, onRemove });
    await press(DECREASE);
    await press(DECREASE);
    await press(REMOVE);
    await flush();
    await press(INCREASE);
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(onQuantityChange).not.toHaveBeenCalled();
    await screen.unmount();
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 2, 'order-1');
  });

  it('while the removal runs every button is off, a second tap asks nothing more, and no waiting change is sent', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const running = deferred<boolean>(false);
    const onRemove = jest.fn(() => running.promise);
    await mountCard({ onQuantityChange, onRemove });
    await press(INCREASE);
    await press(REMOVE);
    expectOff(REMOVE, true);
    expectOff(INCREASE, true);
    expectOff(DECREASE, true);

    // A tap that gets past the disabled buttons (the card's own guard).
    await pressPastDisabled(REMOVE);
    expect(onRemove).toHaveBeenCalledTimes(1);

    await advance(3000);
    await act(async () => { running.resolve(true); await running.promise; });
    await flush();
    // The line is gone: its card stays off until the next read takes it away, and the held change is never sent.
    expectOff(REMOVE, true);
    await screen.unmount();
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('a removal that got no answer turns the buttons on, sends no waiting change and shows the stored quantity', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve('unknown' as const));
    await mountCard({ onQuantityChange, onRemove });
    await press(DECREASE);
    expect(screen.getByText('2')).toBeOnTheScreen();
    await press(REMOVE);
    await flush();
    expectOff(REMOVE, false);
    expect(screen.getByText('3')).toBeOnTheScreen();
    await advance(3000);
    await flush();
    expect(onQuantityChange).not.toHaveBeenCalled();
    await screen.unmount();
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('a card whose removal answered "gone" gets its buttons back when its line comes back changed', async () => {
    const onRemove = jest.fn(() => Promise.resolve(true));
    const { rerender } = await mountCard({ onRemove });
    await press(REMOVE);
    await flush();
    expectOff(REMOVE, true);
    await rerender(<OrderItemCard item={{ ...item, requested_quantity: item.requested_quantity + 1 }} onQuantityChange={jest.fn()} onRemove={onRemove} />);
    expectOff(REMOVE, false);
    await screen.unmount();
  });

  it('a removal that fails turns the buttons on again', async () => {
    const onRemove = jest.fn(() => Promise.resolve(false));
    await mountCard({ onRemove });
    await press(REMOVE);
    await flush();
    expectOff(REMOVE, false);
    await press(REMOVE);
    expect(onRemove).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });
});

it.each([
  ['orange', 'light'],
  ['orange', 'dark'],
  [SAMPLE_BRAND, 'light'],
  [SAMPLE_BRAND, 'dark'],
] as const)('renders on themed surfaces in %s %s', async (brand, mode) => {
  mockTheme = { preference: mode, brand };
  const tokens = getTokens(brand, mode);
  await mountCard({ item: { ...item, grn_item: { ...item.grn_item!, weight: 1250.5, grn_date: '2026-10-09' } } });
  // The card's own surface is the root view.
  expect(screen.root).toHaveStyle({ backgroundColor: tokens.surface.card });
  expect(screen.getByText('1,250.5 kg each')).toBeOnTheScreen();
  expect(screen.queryByText('1,250.5 kg')).not.toBeOnTheScreen();
  expect(screen.getByText(formatDate('2026-10-09'))).toBeOnTheScreen();
  const remove = button('Remove Fictional Onions from order');
  expect(remove.queryAll(node => node.props.name === 'trash-can-outline')[0].props.color).toBe(tokens.status.negative.text);
  await screen.unmount();
  mockTheme = { preference: 'light', brand: 'orange' };
});

// The lot stores one weight: the weight of one bag, box or crate. It says "each", so it is
// never read as the line's total, and a lot without a weight shows no weight at all.
describe('the weight of the lot', () => {
  const withWeight = (weight: number | null | undefined): OrderItem =>
    ({ ...item, grn_item: { ...item.grn_item!, package_mark: 'PT', weight } }) as OrderItem;
  const weightIcons = () => screen.root!.queryAll(node => node.props.name === 'weight-kilogram');
  /** Text drawn outside a Text (a `0` left behind by `weight && …`), which a phone refuses to draw. */
  const bareTexts = () =>
    collect(screen.toJSON()).filter(node => node.type === 'View').flatMap(node => (node.children ?? []).filter(child => typeof child === 'string'));
  const mountWeight = (weight: number | null | undefined) => mountCard({ item: withWeight(weight) });
  afterEach(() => setLanguage('en'));

  it('reads "50 kg each" beside the mark, and "દરેક ૫૦ કિલો" in Gujarati', async () => {
    await mountWeight(50);
    expect(screen.getByText('PT')).toBeOnTheScreen();
    expect(screen.getByText('50 kg each')).toBeOnTheScreen();
    expect(screen.queryByText('50 kg')).not.toBeOnTheScreen();
    expect(weightIcons()).toHaveLength(1);
    await screen.unmount();

    setLanguage('gu');
    await mountWeight(50);
    expect(screen.getByText('દરેક ૫૦ કિલો')).toBeOnTheScreen();
    await screen.unmount();
  });

  it.each([[0], [null], [undefined], [-5]])('shows no weight, no weight icon and no stray text for a lot with weight %s', async weight => {
    await mountWeight(weight);
    expect(screen.getByText('PT')).toBeOnTheScreen();
    expect(screen.queryByText(/kg|each/)).not.toBeOnTheScreen();
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
    await screen.unmount();
  });
});

// Owner decision D17: a line that asks for more than the lot has says so, + and +10 are off, and − lowers it to the stock.
describe('a line above its stock', () => {
  const over: OrderItem = { ...item, requested_quantity: 12 };
  const noStock: OrderItem = { ...item, requested_quantity: 5, grn_item: { ...item.grn_item!, current_stock: 0 } };
  const mount = (line: OrderItem, onQuantityChange: jest.Mock, onRemove: jest.Mock = jest.fn()) =>
    mountCard({ item: line, onQuantityChange, onRemove });

  it('shows the warning with the stock, and turns + and +10 off', async () => {
    await mount(over, jest.fn(() => Promise.resolve(true)));
    expect(screen.getByTestId('order-line-over-stock')).toBeOnTheScreen();
    expect(screen.getByText('Only 10 in stock. Lower it to 10 or less, or remove it.')).toBeOnTheScreen();
    expectOff('Increase Fictional Onions by 1', true);
    expectOff('Add 10 to Fictional Onions', true);
    await screen.unmount();
  });

  it('with no stock left, the warning says to remove the line, not to lower it', async () => {
    await mount(noStock, jest.fn(() => Promise.resolve(true)));
    expect(screen.getByTestId('order-line-over-stock')).toBeOnTheScreen();
    expect(screen.getByText('Out of stock. Remove it from the order.')).toBeOnTheScreen();
    expect(screen.queryByText(/Lower it to/)).not.toBeOnTheScreen();
    await screen.unmount();
  });

  it('with negative stock, the warning also says to remove the line', async () => {
    const negative: OrderItem = { ...noStock, grn_item: { ...noStock.grn_item!, current_stock: -2 } };
    await mount(negative, jest.fn(() => Promise.resolve(true)));
    expect(screen.getByText('Out of stock. Remove it from the order.')).toBeOnTheScreen();
    await screen.unmount();
  });

  it('shows no warning, and leaves + on, for a line within its stock', async () => {
    await mount(item, jest.fn(() => Promise.resolve(true)));
    expect(screen.queryByTestId('order-line-over-stock')).not.toBeOnTheScreen();
    expect(screen.queryByText(/in stock\. Lower it/)).not.toBeOnTheScreen();
    expectOff('Increase Fictional Onions by 1', false);
    await screen.unmount();
  });

  it('names what − and −10 do in their spoken labels: lower to the stock', async () => {
    await mount(over, jest.fn(() => Promise.resolve(true)));
    expect(screen.getByRole('button', { name: 'Lower Fictional Onions to 10' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Decrease Fictional Onions by 1' })).not.toBeOnTheScreen();
    await screen.unmount();
  });

  it('− lowers 12 to the stock 10 (not to 11), and that is what is saved', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    await mount(over, onQuantityChange);
    await press('Lower Fictional Onions to 10');
    expect(screen.getByText('10')).toBeOnTheScreen();
    expect(screen.queryByTestId('order-line-over-stock')).not.toBeOnTheScreen();
    await advance(2000);
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 10, 'order-1');
    await screen.unmount();
  });

  it('with no stock left, − asks to remove the line instead of lowering it', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => new Promise<boolean>(() => undefined));
    await mount(noStock, onQuantityChange, onRemove);
    expect(screen.getAllByRole('button', { name: 'Remove Fictional Onions from order' }).length).toBeGreaterThan(0);
    await user.press(screen.getAllByRole('button', { name: 'Remove Fictional Onions from order' })[0]);
    expect(onRemove).toHaveBeenCalledWith('line-1', expect.any(Function));
    expect(onQuantityChange).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
