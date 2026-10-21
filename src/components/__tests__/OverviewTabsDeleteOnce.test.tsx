/**
 * Deleting a GRN, a dispatch or an invoice from its page's Overview tab asks exactly once.
 *
 * - GRN and invoice: the page asks its own, fuller question (grn/invoice `handleDelete…`), so the Delete button of the
 *   tab (ActionsSection) hands straight over: it shows no question of its own.
 * - Dispatch: the page asks nothing, so the tab's question is the one.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GRNOverviewTab } from '@/components/grn-details/GRNOverviewTab';
import { DispatchOverviewTab } from '@/components/dispatch-details/DispatchOverviewTab';
import { InvoiceOverviewTab } from '@/components/invoice-details/InvoiceOverviewTab';
import { showAlert } from '@/utils/alert';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The rates card reads the server; this test is about the Delete button.
jest.mock('@/features/grn/rates/GrnItemRates', () => ({ GrnItemRates: () => null }));

let tree: ReactTestRenderer;
afterEach(() => {
  act(() => tree?.unmount());
  jest.clearAllMocks();
});
const render = (element: React.ReactElement) => {
  act(() => { tree = create(element); });
};
const press = (label: string) => {
  const button = tree.root.find((node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function');
  act(() => button.props.onPress());
};

describe('the Delete button of the Overview tab', () => {
  it('GRN: hands over to the page at once, with no question of its own', () => {
    const onDelete = jest.fn();
    render(<GRNOverviewTab grn_id="g1" gr_no="Z0010" can_edit can_delete onEdit={jest.fn()} onDelete={onDelete} />);

    press('Delete GRN');

    expect(showAlert).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('invoice: hands over to the page at once, with no question of its own', () => {
    const onDelete = jest.fn();
    render(
      <InvoiceOverviewTab
        invoice_id="i1"
        invoice_number="42"
        financial_summary={{ subtotal: 100, discount: 0, labour: 0, tax_amount: 0, total: 100 }}
        can_edit
        can_delete
        on_edit_invoice={jest.fn()}
        on_delete_invoice={onDelete}
      />
    );

    press('Delete Invoice');

    expect(showAlert).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('dispatch: the tab asks once, and deletes only when that question is answered Delete', () => {
    const onDelete = jest.fn();
    render(<DispatchOverviewTab dispatch_id="d1" disp_no="I0042" can_edit can_delete onEdit={jest.fn()} onDelete={onDelete} />);

    press('Delete Dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe('Delete Dispatch I0042?');
    expect(message).toBe("It will be removed for everyone. You can't undo this.");
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Delete Dispatch']);
    act(() => buttons?.[1].onPress?.());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
