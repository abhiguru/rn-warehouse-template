/**
 * WH-180: an imported payment shows the Imported tag and no Edit or Delete; a payment with `imported: false`, or a row from
 * an older server that omits the field, keeps them. The real payments service runs with only the server's reply faked.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { PaymentsTab } from '@/features/payments/PaymentsTab';
import { setLanguage } from '@/i18n';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/features/payments/PaymentFormModal', () => ({ PaymentFormModal: () => null }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

const payment = (id: string, extra: Record<string, unknown> = {}) => ({
  id, payment_no: 7, invoice_id: 'i1', paid_on: '2026-11-02', amount: '250.00', mode: 'upi', note: 'part',
  entered_by_name: 'Asha', updated_at: '2026-11-02T10:00:00Z', recorded_in_app: true, ...extra,
});
let tree: ReactTestRenderer;
const open = async (payments: unknown[]) => {
  mockRpc.mockResolvedValue({ data: { success: true, invoice: { payments, paid_amount: 250, due_amount: 750, payment_status: 'part_paid' } }, error: null });
  await act(async () => { tree = create(<PaymentsTab invoiceId="i1" invoiceNumber="FXI0001" total={1000} cancelled={false} canManage />); });
  await act(async () => {});
};
const has = (testID: string) => tree.root.findAll(n => n.props.testID === testID).length > 0;
beforeEach(() => { mockRpc.mockReset(); setLanguage('en'); });
afterEach(() => act(() => tree.unmount()));

it('an imported payment has the Imported tag and no Edit or Delete', async () => {
  await open([payment('p1', { imported: true })]);
  expect(has('payment-imported-p1')).toBe(true);
  expect(tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''))).toContain('Imported');
  expect(has('payment-edit-p1')).toBe(false);
  expect(has('payment-delete-p1')).toBe(false);
});

it.each([['false', { imported: false }], ['absent (an older server)', {}]])('a payment with imported %s keeps Edit and Delete and has no tag', async (_name, extra) => {
  await open([payment('p2', extra)]);
  expect(has('payment-imported-p2')).toBe(false);
  expect(has('payment-edit-p2')).toBe(true);
  expect(has('payment-delete-p2')).toBe(true);
});

it('in one invoice, only the imported payment loses its actions', async () => {
  await open([payment('p1', { imported: true }), payment('p2', { imported: false })]);
  expect(has('payment-edit-p1')).toBe(false);
  expect(has('payment-edit-p2')).toBe(true);
});

it('a row of the old accounting link stays read-only whatever the flag', async () => {
  await open([payment('p3', { recorded_in_app: false, imported: false })]);
  expect(has('payment-edit-p3')).toBe(false);
});
