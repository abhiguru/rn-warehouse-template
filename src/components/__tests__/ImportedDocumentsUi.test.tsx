/** WH-180: the Imported tag on the lists and the headers of an imported GRN, dispatch and invoice; the Set rates entry. */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 392, height: 780, scale: 3, fontScale: 1 }),
}));

let tree: ReactTestRenderer;
const mount = async (el: React.ReactElement) => { await act(async () => { tree = create(el); }); };
const tags = () => tree.root.findAllByType(ImportedTag);
const words = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
afterEach(() => { act(() => tree.unmount()); setLanguage('en'); mockRole = 'admin'; jest.clearAllMocks(); });

const dispatch = { dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', customer_name: 'Fictional Customer', total_qty: 12, total_items: 1, items: [] } as unknown as Dispatch;
const invoice = {
  invoice_id: 'i1', invoice_number: 'FXI0001', invoice_date: '2026-10-01', total: 1000, tax_amount: 50, labour: 0, discount: 0,
  financial_year: 2026, is_auto_generated: false, customer: { name: 'Fictional Customer' }, grn: { gr_no: 'FXG001' },
} as unknown as Invoice;

describe('the Imported tag', () => {
  it('reads Imported, and in Gujarati ઇમ્પોર્ટ કરેલ', async () => {
    await mount(<ImportedTag />);
    expect(words()).toContain('Imported');
    act(() => tree.unmount());
    setLanguage('gu');
    await mount(<ImportedTag />);
    expect(words()).toContain('ઇમ્પોર્ટ કરેલ');
  });

  it('is on an imported dispatch row and not on another', async () => {
    await mount(<MemoizedDispatchItem dispatch={{ ...dispatch, imported: true }} onPress={jest.fn()} />);
    expect(tags()).toHaveLength(1);
    act(() => tree.unmount());
    await mount(<MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    expect(tags()).toHaveLength(0);
  });

  it('is on an imported invoice row and not on another, and a row that becomes imported is drawn again', async () => {
    await mount(<MemoizedInvoiceItem invoice={{ ...invoice, imported: true }} onPress={jest.fn()} />);
    expect(tags()).toHaveLength(1);
    act(() => tree.unmount());
    await mount(<MemoizedInvoiceItem invoice={invoice} onPress={jest.fn()} />);
    expect(tags()).toHaveLength(0);
    expect(invoiceItemPropsAreEqual({ invoice, onPress: jest.fn() } as any, { invoice: { ...invoice, imported: true }, onPress: jest.fn() } as any)).toBe(false);
  });

  it.each([
    ['GRN', (imported: boolean) => <GRNHeroHeader gr_no="FXG001" date="2026-10-01" total_qty={10} total_stock={5} total_dispatched={5} customer_name="Fictional" imported={imported} />, 'grn-imported-tag'],
    ['dispatch', (imported: boolean) => <DispatchHeroHeader disp_no="D42" date="2026-10-09" total_items={2} total_quantity={7} customer_name="Fictional" imported={imported} />, 'dispatch-imported-tag'],
    ['invoice', (imported: boolean) => <InvoiceHeroHeader invoice_number="FXI0001" date="2026-10-01" total_items={1} total_amount={1000} tax_amount={50} customer_name="Fictional" imported={imported} />, 'invoice-imported-tag'],
  ])('is in the %s header of an imported document only', async (_name, header, testID) => {
    await mount(header(true));
    expect(tree.root.findAll(n => n.props.testID === testID && (n.type as unknown) !== ImportedTag).length).toBeGreaterThan(0);
    expect(words()).toContain('Imported');
    act(() => tree.unmount());
    await mount(header(false));
    expect(tags()).toHaveLength(0);
  });
});

describe('Set rates on an imported GRN', () => {
  const rate = { grn_item_id: 'l1', item_id: 'gur', item_name: 'Fictional Gur', weight: 25, source: 'item', unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, weight_min: 0, weight_max: 50, varies: false };
  beforeEach(() => (getGrnItemRates as jest.Mock).mockResolvedValue({ gr_id: 'g1', grn_date: '2026-10-01', price_type: 'monthly', invoiced: false, rates: [rate] }));
  const button = () => tree.root.findAll(n => n.props.testID === 'grn-imported-set-rates' && typeof n.props.onPress === 'function');

  it('opens the Rates step of that GRN', async () => {
    await mount(<GrnItemRates grnId="g1" canEdit imported />);
    expect(button().length).toBeGreaterThan(0);
    expect(words()).toContain('Set rates');
    act(() => button()[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/grn-edit/[id]/step3', params: { id: 'g1', focus: 'rates' } });
  });

  it('is in Gujarati in Gujarati', async () => {
    setLanguage('gu');
    await mount(<GrnItemRates grnId="g1" canEdit imported />);
    expect(words()).toContain('દર નક્કી કરો');
  });

  it.each([
    ['a GRN that was not imported', 'admin', true, false],
    ['a person who may not edit', 'admin', false, true],
    ['a customer', 'customer', true, true],
  ])('is absent for %s', async (_name, role, canEdit, imported) => {
    mockRole = role;
    await mount(<GrnItemRates grnId="g1" canEdit={canEdit} imported={imported} />);
    expect(button()).toHaveLength(0);
  });
});
