import React from 'react';
import fs from 'fs';
import path from 'path';
import { Dimensions, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ItemRateRow, rowA11y, summaryLine } from '@/features/item-pricing/components/ItemRateRow';
import { groupByItem, itemSummary } from '@/features/item-pricing/rateModel';
import { setLanguage } from '@/i18n';
import { F1, ITEMS, TODAY } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const summary = (id: string) => itemSummary(groupByItem(F1, ITEMS).find(g => g.item.id === id)!, TODAY);
let tree: ReactTestRenderer;
const original = Dimensions.get('window');
const setScale = (fontScale: number) => Dimensions.set({ window: { ...original, fontScale } });
const render = (id: string, onPress = jest.fn()) => {
  act(() => { tree = create(<ItemRateRow summary={summary(id)} onPress={onPress} />); });
  return onPress;
};
const pressable = (id: string) => tree.root.find(n => n.props.testID === `item-rate-row-${id}` && typeof n.props.onPress === 'function');
afterEach(() => {
  act(() => tree.unmount());
  Dimensions.set({ window: original });
  setLanguage('en');
});

describe('ItemRateRow', () => {
  it('keeps the rent in the right column at normal text size and stacks it at fontScale 2 (P-42)', () => {
    setScale(1);
    render('garlic');
    expect(tree.root.findAll(n => n.props.testID === 'rent-right' && n.type === Text)).toHaveLength(1);
    expect(tree.root.findAll(n => n.props.testID === 'rent-stacked')).toHaveLength(0);
    act(() => tree.unmount());
    setScale(2);
    render('garlic');
    const stacked = tree.root.findAll(n => n.props.testID === 'rent-stacked' && n.type === Text);
    expect(stacked).toHaveLength(1);
    expect(stacked[0].props.numberOfLines).toBe(1);
    expect(stacked[0].props.children).toBe('₹6.00–₹9.50');
  });

  it('reads as one sentence to a screen reader (P-25)', () => {
    setScale(1);
    render('ajwain-bold');
    const press = pressable('ajwain-bold');
    expect(press.props.accessibilityLabel).toBe('Ajwain Bold, ₹10.00 per bag, per month, 0–100 kg, labour ₹2.50 per bag, tax 5%');
    expect(rowA11y(summary('onion-small'))).toBe('Review Onion Red Small, no rate today');
  });

  it('is at least 72 high and one press target', () => {
    setScale(1);
    render('cumin');
    const style = [pressable('cumin').props.style({ pressed: false })].flat(Infinity);
    expect(Math.max(...style.map((s: { minHeight?: number }) => s?.minHeight ?? 0))).toBeGreaterThanOrEqual(72);
    expect(tree.root.findAll(n => typeof n.props.onPress === 'function' && typeof n.props.testID === 'string')).toHaveLength(1);
  });

  it('writes the summary line for bands, labour and tax', () => {
    expect(summaryLine(summary('garlic'))).toBe('2 weight bands · Labour ₹2.50 · Tax 5%');
    expect(summaryLine(summary('potato'))).toBe('0–100 kg · Labour ₹2.00 · Tax 0%');
    expect(summaryLine(summary('onion-small'))).toBe('—');
  });

  it('writes a one-time rate without labour', () => {
    const rows = [{ ...F1[0], price_type: 'one_time' as const, effective_to: null, item_id: 'cumin', unit_price: 20 }];
    const s = itemSummary(groupByItem(rows, ITEMS).find(g => g.item.id === 'cumin')!, TODAY);
    expect(summaryLine(s)).toBe('One-time · 0–100 kg · Tax 5%');
  });

  it('shows Gujarati digits and Gujarati tags in Gujarati', () => {
    setScale(1);
    setLanguage('gu');
    render('cumin');
    const text = tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join('')).join(' | ');
    expect(text).toContain('₹૧૧.૦૦');
    expect(text).toContain('નવો દર');
    expect(text).not.toMatch(/[0-9]/);
  });

  it('has no swipe and no animation in its source (P-25, P-36)', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../features/item-pricing/components/ItemRateRow.tsx'), 'utf8');
    expect(source).not.toMatch(/Swipeable|LayoutAnimation|FadeIn|entering=|layout=/);
  });

  // CR-17
  it('the spoken label ends with the tags the row shows', () => {
    expect(rowA11y(summary('cumin'))).toBe('Review Cumin Bold, ₹11.00 per bag, per month, 0–100 kg, labour ₹3.00 per bag, tax 5%, New rate from 1 Jan 2027');
    expect(rowA11y(summary('onion'))).toBe('Review Onion Red, ₹3.50 per bag, per month, 0–100 kg, labour ₹1.50 per bag, tax 5%, 1 customer rate');
    expect(rowA11y(summary('onion-small'))).toBe('Review Onion Red Small, no rate today');
  });
});
