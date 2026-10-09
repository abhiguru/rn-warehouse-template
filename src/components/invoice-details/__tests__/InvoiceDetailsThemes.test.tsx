import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InvoiceHeroHeader } from '../InvoiceHeroHeader';
import { InvoiceBreakdownTab } from '../InvoiceBreakdownTab';
import { getTokens } from '@/theme/tokens';

let mockTheme = { preference: 'light', brand: 'orange' };

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const THEMES = [
  ['orange', 'light'],
  ['orange', 'dark'],
  ['gcsa', 'light'],
  ['gcsa', 'dark'],
] as const;

const texts = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe.each(THEMES)('invoice details in %s %s', (brand, mode) => {
  beforeEach(() => {
    mockTheme = { preference: mode, brand };
  });

  it('renders the hero header with Indian-grouped money', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <InvoiceHeroHeader
          invoice_number={2555}
          date="2026-10-09"
          total_items={3}
          total_amount={123456.5}
          tax_amount={1250}
          customer_name="Fictional Traders"
        />
      );
    });
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Invoice', '2555', '₹1,23,456.50', '₹1,250.00']));
  });

  it('shows the discount as a positive deduction with a minus sign', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <InvoiceBreakdownTab
          breakdown={{ subtotal: 1000, discount: 250, labour: 0, tax_amount: 50, total: 800 }}
        />
      );
    });
    const discount = renderer.root.findAllByType(Text).find(node => node.props.children === '−₹250.00');
    expect(discount).toBeDefined();
    expect(flatten(discount!.props.style).color).toBe(getTokens(brand, mode).status.positive.text);
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Total amount', '₹800.00']));
  });
});
