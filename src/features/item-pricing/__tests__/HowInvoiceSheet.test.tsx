import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { HowInvoiceSheet } from '@/features/item-pricing/components/HowInvoiceSheet';
import { setLanguage } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/features/filters/components/SheetFrame', () => ({
  SheetFrame: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => setLanguage('en'));

describe('How an invoice picks a rate', () => {
  it('starts with the saved invoice keeping its figures and the GRN-only rate coming first', async () => {
    await render(<HowInvoiceSheet visible onClose={() => {}} />);
    const saved = screen.getByText('A saved invoice keeps its own figures.');
    const grnOnly = screen.getByText("A rate set for that GRN only comes before the customer's rate.");
    const customer = screen.getByText("The customer's own rate, if there is one for that bag weight.");
    // getAllByText answers in the order the lines are on the screen.
    const order = screen.getAllByText(/\S/);
    expect(order.indexOf(saved)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(saved)).toBeLessThan(order.indexOf(customer));
    expect(order.indexOf(grnOnly)).toBeLessThan(order.indexOf(customer));
  });

  it('numbers the lines 1 to 7 in Gujarati digits', async () => {
    setLanguage('gu');
    await render(<HowInvoiceSheet visible onClose={() => {}} />);
    expect(screen.getByText('૧.')).toBeOnTheScreen();
    expect(screen.getByText('૭.')).toBeOnTheScreen();
    expect(screen.getByText('સાચવેલો ઇન્વૉઇસ પોતાના આંકડા જ રાખે છે.')).toBeOnTheScreen();
  });
});
