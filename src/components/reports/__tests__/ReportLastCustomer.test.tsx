/**
 * The "Last opened" row above a report's customers list, in all four themes.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, touchTarget, type Mode } from '@/theme/tokens';
import { ReportLastCustomer } from '../ReportLastCustomer';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

function render(element: React.ReactElement, brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  act(() => {
    tree = create(element);
  });
  const row = tree!.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button')[0];
  const texts = tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  return { row, texts };
}
const flat = (style: unknown, pressed = false) =>
  (StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style) ?? {}) as Record<string, unknown>;

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('last opened customer in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('is one labelled button on theme tokens that opens the customer', () => {
    const onPress = jest.fn();
    const customer = { id: 'c1', name: 'Green Valley Traders' };
    const { row, texts } = render(
      <ReportLastCustomer customer={customer} onPress={onPress} accessibilityHint="Shows this customer's GRNs" />,
      brand,
      mode
    );
    expect(texts).toEqual(['Last opened', 'Green Valley Traders']);
    expect(row.props.accessibilityLabel).toBe('Last opened: Green Valley Traders');
    expect(row.props.accessibilityHint).toBe("Shows this customer's GRNs");
    expect(flat(row.props.style).backgroundColor).toBe(t.surface.card);
    expect(flat(row.props.style, true).backgroundColor).toBe(t.surface.cardPressed);
    expect(flat(row.props.style).minHeight).toBe(touchTarget);
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalledWith(customer);
  });
});

it('names a customer that has no name "Customer"', () => {
  const { row, texts } = render(<ReportLastCustomer customer={{ id: 'c9', name: '' }} onPress={jest.fn()} />);
  expect(texts).toEqual(['Last opened', 'Customer']);
  expect(row.props.accessibilityLabel).toBe('Last opened: Customer');
});
