/**
 * Deleting a GRN, a dispatch or an invoice from its page's Overview tab asks exactly once.
 *
 * - GRN and invoice: the page asks its own, fuller question (grn/invoice `handleDelete…`), so the Delete button of the
 *   tab (ActionsSection) hands straight over: it shows no question of its own.
 * - Dispatch: the page asks nothing, so the tab's question is the one.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import { DispatchOverviewTab } from '@/components/dispatch-details/DispatchOverviewTab';
import { InvoiceOverviewTab } from '@/components/invoice-details/InvoiceOverviewTab';
import { showAlert } from '@/utils/alert';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The rates card reads the server; this test is about the Delete button.
jest.mock('@/features/grn/rates/GrnItemRates', () => ({ GrnItemRates: () => null }));

afterEach(() => {
  jest.clearAllMocks();
});

describe('the Delete button of the Overview tab', () => {
  it('GRN: hands over to the page at once, with no question of its own', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onDelete = jest.fn();
    await render(<GRNOverviewTab grn_id="g1" gr_no="Z0010" can_edit can_delete onDelete={onDelete} />);

    await user.press(screen.getByRole('button', { name: 'Delete GRN' }));

    expect(showAlert).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('GRN: while the orders it would change are read, the button says "Checking orders…" and waits; while deleting it says Deleting', async () => {
    const { rerender } = await render(<GRNOverviewTab grn_id="g1" gr_no="Z0010" can_edit can_delete is_checking_orders onDelete={jest.fn()} />);
    expect(screen.getByText('Checking orders…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete GRN' })).toBeDisabled();
    await rerender(<GRNOverviewTab grn_id="g1" gr_no="Z0010" can_edit can_delete is_deleting is_checking_orders onDelete={jest.fn()} />);
    expect(screen.queryByText('Checking orders…')).not.toBeOnTheScreen();
    expect(screen.getByText('Deleting…')).toBeOnTheScreen();
  });

  it('invoice: the button says Cancel invoice and hands over to the page at once (the page asks for the reason)', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onCancel = jest.fn();
    await render(
      <InvoiceOverviewTab
        invoice_id="i1"
        invoice_number="42"
        financial_summary={{ subtotal: 100, discount: 0, labour: 0, tax_amount: 0, total: 100 }}
        can_edit
        can_cancel
        on_cancel_invoice={onCancel}
      />
    );

    await user.press(screen.getByRole('button', { name: 'Cancel invoice' }));

    expect(showAlert).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('dispatch: the tab asks once, and deletes only when that question is answered Delete', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onDelete = jest.fn();
    await render(<DispatchOverviewTab dispatch_id="d1" disp_no="I0042" can_edit can_delete onDelete={onDelete} />);

    await user.press(screen.getByRole('button', { name: 'Delete Dispatch' }));

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe('Delete Dispatch I0042?');
    expect(message).toBe("It will be removed for everyone. You can't undo this.");
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Delete Dispatch']);
    buttons?.[1].onPress?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
