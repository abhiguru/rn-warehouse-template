/** WH-180: the Imported tag on the lists and the headers of an imported GRN, dispatch and invoice; the Set rates entry. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { setLanguage } from '@/i18n';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { MemoizedInvoiceItem, invoiceItemPropsAreEqual } from '@/components/list-items/MemoizedInvoiceItem';
import { GRNHeroHeader } from '@/components/grn-details/GRNHeroHeader';
import { DispatchHeroHeader } from '@/components/dispatch-details/DispatchHeroHeader';
import { InvoiceHeroHeader } from '@/components/invoice-details/InvoiceHeroHeader';
import { ImportedTag } from '@/components/ui/ImportedTag';
import { GrnItemRates } from '@/features/grn/rates/GrnItemRates';
import { getGrnItemRates } from '@/services/item-pricing-service';
import type { Dispatch } from '@/services/dispatch-service';
import type { Invoice } from '@/services/invoice-service';

jest.mock('@/services/item-pricing-service', () => ({ getGrnItemRates: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The phone's connection flag is the stand-in (WH-348): the hook's own sources need the whole phone copy.
let mockNeedsConnection = false;
jest.mock('@/features/phone-copy/useNeedsConnection', () => ({
  ...jest.requireActual('@/features/phone-copy/useNeedsConnection'),
  useNeedsConnectionV3: () => mockNeedsConnection,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 392, height: 780, scale: 3, fontScale: 1 }),
}));

afterEach(() => { setLanguage('en'); mockRole = 'admin'; mockNeedsConnection = false; jest.clearAllMocks(); });

const dispatch = { dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', customer_name: 'Fictional Customer', total_qty: 12, total_items: 1, items: [] } as unknown as Dispatch;
const invoice = {
  invoice_id: 'i1', invoice_number: 'FXI0001', invoice_date: '2026-10-01', total: 1000, tax_amount: 50, labour: 0, discount: 0,
  financial_year: 2026, is_auto_generated: false, customer: { name: 'Fictional Customer' }, grn: { gr_no: 'FXG001' },
} as unknown as Invoice;

describe('the Imported tag', () => {
  it('reads Imported, and in Gujarati ઇમ્પોર્ટ કરેલ', async () => {
    const first = await render(<ImportedTag />);
    expect(screen.getByText('Imported')).toBeOnTheScreen();
    await first.unmount();
    setLanguage('gu');
    await render(<ImportedTag />);
    expect(screen.getByText('ઇમ્પોર્ટ કરેલ')).toBeOnTheScreen();
  });

  it('is on an imported dispatch row and not on another', async () => {
    const first = await render(<MemoizedDispatchItem dispatch={{ ...dispatch, imported: true }} onPress={jest.fn()} />);
    expect(screen.getAllByText('Imported')).toHaveLength(1);
    await first.unmount();
    await render(<MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    expect(screen.queryByText('Imported')).not.toBeOnTheScreen();
  });

  it('is on an imported invoice row and not on another, and a row that becomes imported is drawn again', async () => {
    const first = await render(<MemoizedInvoiceItem invoice={{ ...invoice, imported: true }} onPress={jest.fn()} />);
    expect(screen.getAllByText('Imported')).toHaveLength(1);
    await first.unmount();
    await render(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    expect(screen.queryByText('Imported')).not.toBeOnTheScreen();
    // The same onPress on both sides, so the imported flag alone decides.
    const onPress = jest.fn();
    expect(invoiceItemPropsAreEqual({ invoice, onPress } as any, { invoice, onPress } as any)).toBe(true);
    expect(invoiceItemPropsAreEqual({ invoice, onPress } as any, { invoice: { ...invoice, imported: true }, onPress } as any)).toBe(false);
  });

  it.each([
    ['GRN', (imported: boolean) => <GRNHeroHeader gr_no="FXG001" date="2026-10-01" total_qty={10} total_stock={5} total_dispatched={5} customer_name="Fictional" imported={imported} />, 'grn-imported-tag'],
    ['dispatch', (imported: boolean) => <DispatchHeroHeader disp_no="D42" date="2026-10-09" total_items={2} total_quantity={7} customer_name="Fictional" imported={imported} />, 'dispatch-imported-tag'],
    ['invoice', (imported: boolean) => <InvoiceHeroHeader invoice_number="FXI0001" date="2026-10-01" total_items={1} total_amount={1000} tax_amount={50} customer_name="Fictional" imported={imported} />, 'invoice-imported-tag'],
  ])('is in the %s header of an imported document only', async (_name, header, testID) => {
    const first = await render(header(true));
    expect(screen.getAllByTestId(testID).length).toBeGreaterThan(0);
    expect(screen.getByText('Imported')).toBeOnTheScreen();
    await first.unmount();
    await render(header(false));
    expect(screen.queryByText('Imported')).not.toBeOnTheScreen();
    expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
  });
});

describe('Set rates on an imported GRN', () => {
  const rate = { grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'item', unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false };
  beforeEach(() => (getGrnItemRates as jest.Mock).mockResolvedValue({ gr_id: 'g1', grn_date: '2026-10-01', price_type: 'monthly', invoiced: false, rates: [rate] }));

  it('opens the Rates step of that GRN', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(<GrnItemRates grnId="g1" canEdit imported />);
    const button = await screen.findByRole('button', { name: 'Set rates' });
    expect(button).toBeOnTheScreen();
    await user.press(button);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/grn-edit/[id]/step3', params: { id: 'g1', focus: 'rates' } });
  });

  it('offline: Set rates is disabled and the line under it is centred, icon and text together (WH-348)', async () => {
    mockNeedsConnection = true;
    await render(<GrnItemRates grnId="g1" canEdit imported />);
    const line = await screen.findByTestId('grn-imported-set-rates-needs-connection');
    expect(line).toHaveTextContent('Needs a connection');
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ justifyContent: 'center' });
    expect(StyleSheet.flatten(screen.getByText('Needs a connection').props.style)).toMatchObject({ textAlign: 'center' });
    expect(screen.getByRole('button', { name: 'Set rates, needs a connection' })).toBeDisabled();
  });

  it('online: no line under Set rates', async () => {
    await render(<GrnItemRates grnId="g1" canEdit imported />);
    expect(await screen.findByTestId('grn-imported-set-rates')).toBeOnTheScreen();
    expect(screen.queryByTestId('grn-imported-set-rates-needs-connection')).not.toBeOnTheScreen();
  });

  it('is in Gujarati in Gujarati', async () => {
    setLanguage('gu');
    await render(<GrnItemRates grnId="g1" canEdit imported />);
    expect(await screen.findByText('દર નક્કી કરો')).toBeOnTheScreen();
  });

  it.each([
    ['a GRN that was not imported', 'admin', true, false],
    ['a person who may not edit', 'admin', false, true],
    ['a customer', 'customer', true, true],
  ])('is absent for %s', async (_name, role, canEdit, imported) => {
    mockRole = role;
    await render(<GrnItemRates grnId="g1" canEdit={canEdit} imported={imported} />);
    // The rates table is drawn before the entry would be.
    expect(await screen.findByTestId('grn-item-rates-note')).toBeOnTheScreen();
    expect(screen.queryByTestId('grn-imported-set-rates')).not.toBeOnTheScreen();
    expect(screen.queryByText('Set rates')).not.toBeOnTheScreen();
  });
});
