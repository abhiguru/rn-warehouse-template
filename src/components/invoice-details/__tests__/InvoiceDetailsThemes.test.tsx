import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { render, screen } from '@testing-library/react-native';
import { InvoiceHeroHeader } from '../InvoiceHeroHeader';
import { InvoiceBreakdownTab } from '../InvoiceBreakdownTab';
import { getTokens } from '@/theme/tokens';

let mockTheme = { preference: 'light', brand: 'orange' };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: 1 }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const THEMES = [
  ['orange', 'light'],
  ['orange', 'dark'],
  [SAMPLE_BRAND, 'light'],
  [SAMPLE_BRAND, 'dark'],
] as const;

const texts = () =>
  screen.queryAllByText(/[\s\S]*/, { includeHiddenElements: true }).map(node => [node.props.children].flat().join(''));

describe.each(THEMES)('invoice details in %s %s', (brand, mode) => {
  beforeEach(() => {
    mockTheme = { preference: mode, brand };
  });

  it('renders the hero header with Indian-grouped money', async () => {
    await render(
      <InvoiceHeroHeader
        invoice_number={2555}
        date="2026-10-09"
        total_items={3}
        total_amount={123456.5}
        tax_amount={1250}
        customer_name="Fictional Traders"
      />
    );
    expect(texts()).toEqual(expect.arrayContaining(['Invoice', '2555', '₹1,23,456.50', '₹1,250.00']));
  });

  it('shows the discount as a positive deduction with a minus sign', async () => {
    await render(
      <InvoiceBreakdownTab
        breakdown={{ subtotal: 1000, discount: 250, labour: 0, tax_amount: 50, total: 800 }}
      />
    );
    expect(screen.getByText('−₹250.00')).toHaveStyle({ color: getTokens(brand, mode).status.positive.text });
    expect(texts()).toEqual(expect.arrayContaining(['Total amount', '₹800.00']));
  });
});
