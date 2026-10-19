/**
 * New invoice, review step: a line with a charge of 0 needs a reason from
 * staff before the invoice is saved; administrators and supervisors may leave
 * it empty (owner decision 3 of 2026-10-11).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';

let mockRole = 'staff';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));

const mockSubmitForm = jest.fn();
const mockUpdateHeaderField = jest.fn();
const line = (id: string, charge: number) => ({
  temp_id: id, disp_trl_id: id, item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 100, grn_original_qty: 100,
  charge, labour_rate: 2, tax: 5, duration: 1, amount: charge * 100, labour_amount: 200, tax_amount: 10, item_total: charge * 100 + 210,
});
let mockItems = [line('free', 0), line('paid', 5)];
let mockReason: Record<string, unknown> = {};
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders',
      gr_id: 'g1', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 400, tax_amount: 45, total: 945,
      ...mockReason,
    },
    items: mockItems,
    isSaving: false,
    updateDiscountAmount: jest.fn(),
    updateHeaderField: mockUpdateHeaderField,
    navigateToStep: jest.fn(),
    submitForm: mockSubmitForm,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const summary = (tree: ReactTestRenderer) => tree.root.findByType('InvoiceCalculationSummary' as unknown as React.ElementType);
const shown = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);
async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceFormStep3 />); });
  return tree;
}
const pressSave = async (tree: ReactTestRenderer) => {
  const save = tree.root.findAll((node) => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Save invoice' && typeof node.props.onPress === 'function')[0];
  await act(async () => { await save.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'staff';
  mockItems = [line('free', 0), line('paid', 5)];
  mockReason = {};
  mockSubmitForm.mockResolvedValue({ success: false });
});

describe('staff saving a new invoice with a zero-charge line', () => {
  it('are stopped without a reason, and told what to enter', async () => {
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(true);

    await pressSave(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.title).toBe('Enter a reason for the zero charge');
    expect(shown(tree)[0].props.message).toBe('An item has a charge of 0. Enter the reason before submitting the invoice.');
    // The dialog only informs: closing it does not save.
    expect(shown(tree)[0].props.confirmText).toBe('Close');
    await act(async () => { shown(tree)[0].props.onConfirm(); });
    expect(mockSubmitForm).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('are stopped when the reason is only spaces', async () => {
    mockReason = { zero_charge_reason: '   ' };
    const tree = await render();

    await pressSave(tree);

    expect(shown(tree)[0].props.title).toBe('Enter a reason for the zero charge');
    expect(mockSubmitForm).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('go on to the save question once a reason is written', async () => {
    mockReason = { zero_charge_reason: 'Sample lot' };
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    await pressSave(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.confirmText).toBe('Save invoice');
    await act(async () => { await shown(tree)[0].props.onConfirm(); });
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it('write the reason into the form through the summary field', async () => {
    const tree = await render();

    await act(async () => { summary(tree).props.onZeroChargeReasonChange('Sample lot'); });

    expect(mockUpdateHeaderField).toHaveBeenCalledWith('zero_charge_reason', 'Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('are asked for the discount reason first when both are missing', async () => {
    mockReason = { discount: 50 };
    const tree = await render();

    await pressSave(tree);

    expect(shown(tree)[0].props.title).toBe('Enter a discount reason');
    expect(mockSubmitForm).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe.each(['admin', 'supervisor'])('%s saving a new invoice with a zero-charge line', (role) => {
  it('may leave the reason empty', async () => {
    mockRole = role;
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);
    // The field is still offered.
    expect(typeof summary(tree).props.onZeroChargeReasonChange).toBe('function');

    await pressSave(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.confirmText).toBe('Save invoice');
    await act(async () => { await shown(tree)[0].props.onConfirm(); });
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});

// Every role is told before saving that something on the invoice is free. An
// item without a price in the price list arrives with a charge of 0 as well,
// and administrators and supervisors, who need no reason, would otherwise save
// it without a word about it.
describe.each(['staff', 'admin', 'supervisor'])('the question before a new invoice is saved, for %s', (role) => {
  const confirm = async () => {
    mockRole = role;
    mockReason = { zero_charge_reason: role === 'staff' ? 'Sample lot' : '' };
    const tree = await render();
    await pressSave(tree);
    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.confirmText).toBe('Save invoice');
    return { tree, message: shown(tree)[0].props.message as string };
  };

  it('says that 1 item has a charge of 0, after the customer and the total', async () => {
    const { tree, message } = await confirm();

    expect(message).toBe(
      'Example Traders\nEstimated total ₹945.00\nThe server works out the final total when the invoice is saved.\n\n1 item has a charge of 0.'
    );
    await act(async () => { tree.unmount(); });
  });

  it('counts the lines: "3 items have a charge of 0."', async () => {
    mockItems = [line('a', 0), line('b', 0), line('c', 5), line('d', 0)];
    const { tree, message } = await confirm();

    expect(message.split('\n').at(-1)).toBe('3 items have a charge of 0.');
    await act(async () => { tree.unmount(); });
  });

  it('says nothing of it when every line has a charge', async () => {
    mockItems = [line('a', 4), line('b', 5)];
    const { tree, message } = await confirm();

    expect(message).toBe('Example Traders\nEstimated total ₹945.00\nThe server works out the final total when the invoice is saved.');
    await act(async () => { tree.unmount(); });
  });

  it('still offers the reason field, required for staff only', async () => {
    const { tree } = await confirm();

    expect(typeof summary(tree).props.onZeroChargeReasonChange).toBe('function');
    await act(async () => { tree.unmount(); });
  });
});

describe('an invoice without a zero-charge line', () => {
  it('asks staff for no reason', async () => {
    mockItems = [line('a', 4), line('b', 5)];
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    await pressSave(tree);

    expect(shown(tree)[0].props.confirmText).toBe('Save invoice');
    await act(async () => { tree.unmount(); });
  });
});
