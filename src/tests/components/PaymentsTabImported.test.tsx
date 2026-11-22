/**
 * WH-180: an imported payment shows the Imported tag and no Edit or Delete; a payment with `imported: false`, or a row from
 * an older server that omits the field, keeps them. The real payments service runs with only the server's reply faked.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
const open = async (payments: unknown[]) => {
  mockRpc.mockResolvedValue({ data: { success: true, invoice: { payments, paid_amount: 250, due_amount: 750, payment_status: 'part_paid' } }, error: null });
  await render(<PaymentsTab invoiceId="i1" invoiceNumber="FXI0001" total={1000} cancelled={false} canManage />);
  // The rows are drawn once the invoice has been read: the checks below must not run before that.
  await screen.findAllByText(/250/);
};
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const shown = (testID: string) => expect(screen.getByTestId(testID)).toBeOnTheScreen();
const absent = (testID: string) => expect(screen.queryByTestId(testID, hidden)).not.toBeOnTheScreen();
beforeEach(() => { mockRpc.mockReset(); setLanguage('en'); });

it('an imported payment has the Imported tag and no Edit or Delete', async () => {
  await open([payment('p1', { imported: true })]);
  shown('payment-imported-p1');
  expect(screen.getByText('Imported')).toBeOnTheScreen();
  absent('payment-edit-p1');
  absent('payment-delete-p1');
});

it.each([['false', { imported: false }], ['absent (an older server)', {}]])('a payment with imported %s keeps Edit and Delete and has no tag', async (_name, extra) => {
  await open([payment('p2', extra)]);
  absent('payment-imported-p2');
  shown('payment-edit-p2');
  shown('payment-delete-p2');
});

it('in one invoice, only the imported payment loses its actions', async () => {
  await open([payment('p1', { imported: true }), payment('p2', { imported: false })]);
  absent('payment-edit-p1');
  shown('payment-edit-p2');
});

it('a row of the old accounting link stays read-only whatever the flag', async () => {
  await open([payment('p3', { recorded_in_app: false, imported: false })]);
  absent('payment-edit-p3');
});
