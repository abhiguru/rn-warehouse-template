import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderItemCard from '../OrderItemCard';
import type { OrderItem } from '@/types/order.types';
import { getTokens, type Brand, type Mode } from '@/theme/tokens';
import { formatDate } from '@/utils/formatters';
import { setLanguage } from '@/i18n';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const texts = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map(node => node.props.children).flat().map(String);
const byLabel = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (tree: ReturnType<typeof create>, label: string) =>
  byLabel(tree, label).props.onPress();

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows SAVED only after the server confirms the quantity', async () => {
  const save = deferred<boolean>();
  const onQuantityChange = jest.fn(() => save.promise);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, 'Increase Fictional Onions by 1'); });
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
  expect(texts(tree)).toContain('Saving…');
  expect(texts(tree)).not.toContain('Saved');
  await act(async () => { save.resolve(true); await save.promise; });
  expect(texts(tree)).toContain('Saved');
  expect(texts(tree)).toContain('4');
  await act(async () => { tree.unmount(); });
});

it('reverts to the stored quantity when the server refuses the change', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(false));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, 'Increase Fictional Onions by 1'); });
  expect(texts(tree)).toContain('4');
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
  expect(texts(tree)).toContain('3');
  expect(texts(tree)).not.toContain('4');
  expect(texts(tree)).not.toContain('Saved');
  await act(async () => { tree.unmount(); });
});

it('names its own line when it removes it or saves a pending change on unmount', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(true));
  const onRemove = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={onRemove} />); });
  await act(async () => { press(tree, 'Remove Fictional Onions from order'); });
  expect(onRemove).toHaveBeenCalledWith('line-1');
  await act(async () => { press(tree, 'Increase Fictional Onions by 1'); });
  expect(onQuantityChange).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
  expect(onQuantityChange).toHaveBeenCalledWith('line-1', 4, 'order-1');
});

// Review 2026-10-20, M1 and M6: the question "Remove …?" and the removal that follows.
describe('removing the line', () => {
  const REMOVE = 'Remove Fictional Onions from order';
  const DECREASE = 'Decrease Fictional Onions by 1';
  const INCREASE = 'Increase Fictional Onions by 1';
  const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  const mount = async (onQuantityChange: jest.Mock, onRemove: jest.Mock) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={onRemove} />); });
    return tree;
  };

  it('Cancel after quick − taps: nothing is sent while the question is open, then the quantity shown is saved, never an endless "Saving…"', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const question = deferred<boolean>();
    const onRemove = jest.fn(() => question.promise);
    const tree = await mount(onQuantityChange, onRemove);

    // 3 → 2 → 1, then the third tap asks whether to remove the line.
    await act(async () => { press(tree, DECREASE); });
    await act(async () => { press(tree, DECREASE); });
    expect(texts(tree)).toContain('1');
    await act(async () => { press(tree, REMOVE); });
    expect(onRemove).toHaveBeenCalledWith('line-1');
    expect(byLabel(tree, INCREASE).props.disabled).toBe(true);

    // The question stays open longer than the 2 s wait: the change waiting to be saved is held back.
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(onQuantityChange).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Saving…');

    // Cancel: the line stays, the buttons are on again, and the quantity the person stepped to is saved.
    await act(async () => { question.resolve(false); await question.promise; });
    await flush();
    expect(onQuantityChange).toHaveBeenCalledTimes(1);
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 1, 'order-1');
    expect(byLabel(tree, INCREASE).props.disabled).toBe(false);
    expect(texts(tree)).toContain('Saved');
    expect(texts(tree)).not.toContain('Saving…');
    await act(async () => { tree.unmount(); });
  });

  it('Cancel within the 2 s wait changes nothing: the waiting change goes out at its time', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve(false));
    const tree = await mount(onQuantityChange, onRemove);
    await act(async () => { press(tree, DECREASE); });
    await act(async () => { press(tree, DECREASE); });
    await act(async () => { press(tree, REMOVE); });
    await flush();
    expect(onQuantityChange).not.toHaveBeenCalled();
    expect(byLabel(tree, INCREASE).props.disabled).toBe(false);
    await act(async () => { jest.advanceTimersByTime(2000); });
    await flush();
    expect(onQuantityChange).toHaveBeenCalledTimes(1);
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 1, 'order-1');
    await act(async () => { tree.unmount(); });
  });

  it('after Cancel the removal flag is down: a change made then is saved when the screen is left within 2 s', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve(false));
    const tree = await mount(onQuantityChange, onRemove);
    await act(async () => { press(tree, DECREASE); });
    await act(async () => { press(tree, DECREASE); });
    await act(async () => { press(tree, REMOVE); });
    await flush();
    await act(async () => { press(tree, INCREASE); });
    expect(texts(tree)).toContain('2');
    expect(onQuantityChange).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 2, 'order-1');
  });

  it('while the removal runs every button is off, a second tap asks nothing more, and no waiting change is sent', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const running = deferred<boolean>();
    const onRemove = jest.fn(() => running.promise);
    const tree = await mount(onQuantityChange, onRemove);
    await act(async () => { press(tree, INCREASE); });
    await act(async () => { press(tree, REMOVE); });
    expect(byLabel(tree, REMOVE).props.disabled).toBe(true);
    expect(byLabel(tree, INCREASE).props.disabled).toBe(true);
    expect(byLabel(tree, DECREASE).props.disabled).toBe(true);

    await act(async () => { press(tree, REMOVE); });
    expect(onRemove).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(3000); });
    await act(async () => { running.resolve(true); await running.promise; });
    await flush();
    // The line is gone: its card stays off until the next read takes it away, and the held change is never sent.
    expect(byLabel(tree, REMOVE).props.disabled).toBe(true);
    await act(async () => { tree.unmount(); });
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('a removal that got no answer turns the buttons on, sends no waiting change and shows the stored quantity', async () => {
    const onQuantityChange = jest.fn(() => Promise.resolve(true));
    const onRemove = jest.fn(() => Promise.resolve('unknown' as const));
    const tree = await mount(onQuantityChange, onRemove);
    await act(async () => { press(tree, DECREASE); });
    expect(texts(tree)).toContain('2');
    await act(async () => { press(tree, REMOVE); });
    await flush();
    expect(byLabel(tree, REMOVE).props.disabled).toBe(false);
    expect(texts(tree)).toContain('3');
    await act(async () => { jest.advanceTimersByTime(3000); });
    await flush();
    expect(onQuantityChange).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('a card whose removal answered "gone" gets its buttons back when its line comes back changed', async () => {
    const onRemove = jest.fn(() => Promise.resolve(true));
    const tree = await mount(jest.fn(), onRemove);
    await act(async () => { press(tree, REMOVE); });
    await flush();
    expect(byLabel(tree, REMOVE).props.disabled).toBe(true);
    await act(async () => {
      tree.update(<OrderItemCard item={{ ...item, requested_quantity: item.requested_quantity + 1 }} onQuantityChange={jest.fn()} onRemove={onRemove} />);
    });
    expect(byLabel(tree, REMOVE).props.disabled).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it('a removal that fails turns the buttons on again', async () => {
    const onRemove = jest.fn(() => Promise.resolve(false));
    const tree = await mount(jest.fn(), onRemove);
    await act(async () => { press(tree, REMOVE); });
    await flush();
    expect(byLabel(tree, REMOVE).props.disabled).toBe(false);
    await act(async () => { press(tree, REMOVE); });
    expect(onRemove).toHaveBeenCalledTimes(2);
    await act(async () => { tree.unmount(); });
  });
});

it.each([
  ['orange', 'light'],
  ['orange', 'dark'],
  ['gcsa', 'light'],
  ['gcsa', 'dark'],
] as const)('renders on themed surfaces in %s %s', async (brand, mode) => {
  mockTheme = { preference: mode, brand };
  const tokens = getTokens(brand, mode);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={{ ...item, grn_item: { ...item.grn_item!, weight: 1250.5, grn_date: '2026-10-09' } }} onQuantityChange={jest.fn()} onRemove={jest.fn()} />); });
  const container = tree.root.findAll(node => node.props.style?.backgroundColor === tokens.surface.card);
  expect(container.length).toBeGreaterThan(0);
  expect(texts(tree)).toContain('1,250.5 kg each');
  expect(texts(tree)).not.toContain('1,250.5 kg');
  expect(texts(tree)).toContain(formatDate('2026-10-09', 'short'));
  const remove = byLabel(tree, 'Remove Fictional Onions from order');
  expect(remove.findByProps({ name: 'trash-can-outline' }).props.color).toBe(tokens.status.negative.text);
  await act(async () => { tree.unmount(); });
  mockTheme = { preference: 'light', brand: 'orange' };
});

// The lot stores one weight: the weight of one bag, box or crate. It says "each", so it is
// never read as the line's total, and a lot without a weight shows no weight at all.
describe('the weight of the lot', () => {
  const withWeight = (weight: number | null | undefined): OrderItem =>
    ({ ...item, grn_item: { ...item.grn_item!, package_mark: 'PT', weight } }) as OrderItem;
  const weightIcons = (tree: ReturnType<typeof create>) => tree.root.findAll(node => node.props.name === 'weight-kilogram');
  /** Text drawn outside a Text (a `0` left behind by `weight && …`), which a phone refuses to draw. */
  const bareTexts = (tree: ReturnType<typeof create>) =>
    tree.root.findAll(node => (node.type as unknown) === 'View').flatMap(node => node.children.filter(child => typeof child === 'string'));
  const render = async (weight: number | null | undefined) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<OrderItemCard item={withWeight(weight)} onQuantityChange={jest.fn()} onRemove={jest.fn()} />); });
    return tree;
  };
  afterEach(() => setLanguage('en'));

  it('reads "50 kg each" beside the mark, and "દરેક ૫૦ કિલો" in Gujarati', async () => {
    const tree = await render(50);
    expect(texts(tree)).toEqual(expect.arrayContaining(['PT', '50 kg each']));
    expect(texts(tree)).not.toContain('50 kg');
    expect(weightIcons(tree)).toHaveLength(1);
    await act(async () => { tree.unmount(); });

    setLanguage('gu');
    const gujarati = await render(50);
    expect(texts(gujarati)).toContain('દરેક ૫૦ કિલો');
    await act(async () => { gujarati.unmount(); });
  });

  it.each([[0], [null], [undefined], [-5]])('shows no weight, no weight icon and no stray text for a lot with weight %s', async weight => {
    const tree = await render(weight);
    expect(texts(tree)).toContain('PT');
    expect(texts(tree).filter(text => /kg|each/.test(text))).toEqual([]);
    expect(weightIcons(tree)).toEqual([]);
    expect(bareTexts(tree)).toEqual([]);
    await act(async () => { tree.unmount(); });
  });
});
