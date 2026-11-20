import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GRNInvoicesTab } from '../grn-details/GRNInvoicesTab';
import { DispatchInvoicesTab } from '../dispatch-details/DispatchInvoicesTab';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

async function renderIn(element: React.ReactElement, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  return render(element);
}

describe.each(THEMES)('invoice summary tabs in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('GRN tab lists its invoices with two-decimal totals in primary text on the base background', async () => {
    await renderIn(
      <GRNInvoicesTab
        invoices={{
          detailed: true,
          count: 2,
          total: 123456.5,
          rows: [
            { key: 'a', invoice_id: 'a', invoice_no: 11, invoice_date: '2026-10-01', total: 100000 },
            { key: 'b', invoice_id: 'b', invoice_no: 12, invoice_date: '2026-10-02', total: 23456.5 },
          ],
        }}
      />,
      brand, mode
    );
    expect(screen.getAllByText('₹1,23,456.50')).toHaveLength(1);
    expect(screen.getByText('₹1,23,456.50')).toHaveStyle({ color: t.text.primary });
    expect(screen.getByText('11')).toBeOnTheScreen();
    expect(screen.getByText('Each amount is the invoice total, with tax and less any discount.')).toBeOnTheScreen();
    expect(screen.root).toHaveStyle({ backgroundColor: t.background.base });
  });

  it('GRN tab shows a spinner while its rows are read, and the empty line with none', async () => {
    const loading = await renderIn(
      <GRNInvoicesTab invoices={{ detailed: false, count: 1, total: 5, rows: [] }} loading />,
      brand, mode
    );
    expect(screen.getByText('Loading invoices…')).toBeOnTheScreen();
    await loading.unmount();
    await renderIn(<GRNInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />, brand, mode);
    expect(screen.getByText('No invoices for this GRN.')).toBeOnTheScreen();
  });

  it('dispatch tab shows the empty state', async () => {
    await renderIn(<DispatchInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />, brand, mode);
    expect(screen.getByRole('header', { name: 'No invoices linked to this dispatch.' })).toBeOnTheScreen();
  });

  it('dispatch tab lists invoices with two-decimal amounts and the total in primary text', async () => {
    await renderIn(
      <DispatchInvoicesTab
        invoices={{ detailed: true, count: 1, total: 1906, rows: [{ key: 'v1', invoice_id: 'v1', invoice_no: 42, invoice_date: '2026-10-09', total: 1906 }] }}
      />,
      brand, mode
    );
    const amounts = screen.getAllByText('₹1,906.00');
    expect(amounts).toHaveLength(2);
    expect(amounts[1]).toHaveStyle({ color: t.text.primary });
    expect(screen.getByText('42')).toBeOnTheScreen();
  });
});
