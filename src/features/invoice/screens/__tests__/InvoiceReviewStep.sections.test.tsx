/**
 * Invoice Review step: one folding card with INVOICE DETAILS, ITEMS and CHARGES (the review kit, like GRN Review).
 * The real hook, a real invoice-form slice and the real summary.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { fillNewInvoice, groupLines, invoiceLine, makeInvoiceStore, openForEdit, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateDiscount, updateHeader } from '@/store/slices/invoiceFormSlice';
import InvoiceFormStep3 from '../../../../../app/invoice-form/step3';
import InvoiceEditStep3 from '../../../../../app/invoice-edit/[id]/step3';

let mockStore: InvoiceStore;
let mockRole = 'staff';
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(), loadInvoiceFormData: jest.fn(), loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(), updateInvoice: jest.fn(), checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));

let tree: ReactTestRenderer;
const as = (name: string) => name as unknown as React.ElementType;
const byId = (id: string) => tree.root.find((node) => node.props.testID === id && typeof node.type === 'string' ? true : node.props.testID === id && node.props.onPress !== undefined);
const has = (id: string) => tree.root.findAll((node) => node.props.testID === id).length > 0;
const body = (id: string) => tree.root.find((node) => node.props.testID === `invoice-review-body-${id}` && typeof node.type === 'string');
const hidden = (id: string) => [body(id).props.style].flat(Infinity).some((style) => style && (style as { display?: string }).display === 'none');
const toggle = (id: string) => tree.root.find((node) => node.props.testID === `invoice-review-section-${id}` && typeof node.props.onPress === 'function');
const pencil = (id: string) => tree.root.find((node) => node.props.testID === `invoice-review-section-${id}-edit` && typeof node.props.onPress === 'function');
const closedLine = (id: string) => tree.root.findAll((node) => node.props.testID === `invoice-review-section-${id}-line`)[0]?.props.children;
const press = async (node: ReactTestRenderer['root']) => { await act(async () => { node.props.onPress(); }); };

const MODES = [
  ['create', InvoiceFormStep3, '/invoice-form'],
  ['edit', InvoiceEditStep3, '/invoice-edit/inv-42'],
] as const;

describe.each(MODES)('the %s Review step sections', (mode, Step, base) => {
  const open = async (items = [invoiceLine()], header: Record<string, unknown> = {}) => {
    mockStore = makeInvoiceStore();
    if (mode === 'edit') openForEdit(mockStore, items, header);
    else {
      fillNewInvoice(mockStore, items);
      mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true, ...header }));
    }
    await act(async () => { tree = create(<Step />); });
  };
  beforeEach(() => { jest.clearAllMocks(); mockRole = 'staff'; });
  afterEach(async () => { await act(async () => { tree.unmount(); }); });

  it('draws one card with three sections, and nothing but the kit as headings', async () => {
    await open();
    expect(has('invoice-review')).toBe(true);
    ['details', 'items', 'charges'].forEach((id) => expect(has(`invoice-review-section-${id}`)).toBe(true));
    expect(toggle('details').props.accessibilityLabel).toBe('Invoice details, Invoice 42 · 5 Oct 2026 · Example Traders');
    expect(toggle('items').props.accessibilityLabel).toMatch(/^Items, 1, /);
    expect(toggle('charges').props.accessibilityLabel).toMatch(/^Charges/);
    // No title of its own inside the card (P0-11): the summary has no header role.
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'header')).toHaveLength(0);
  });

  it('opens CHARGES first, with the others closed and one line under each closed heading', async () => {
    await open([invoiceLine({ qty: 120 })]);
    expect(hidden('charges')).toBe(false);
    expect(hidden('details')).toBe(true);
    expect(hidden('items')).toBe(true);
    expect(closedLine('details')).toBe('Invoice 42 · 5 Oct 2026 · Example Traders');
    // The bags only: the one money total is in CHARGES, so two different totals never show in one card.
    expect(closedLine('items')).toBe('120 bags');
    expect(closedLine('charges')).toBeUndefined();

    await press(toggle('items'));
    expect(hidden('items')).toBe(false);
    expect(hidden('charges')).toBe(true);
    expect(closedLine('charges')).toMatch(/^Total ₹/);
  });

  it('shows "—" for a value that is not set', async () => {
    await open([invoiceLine()], { customer_name: '' });
    await press(toggle('details'));
    const texts = tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => node.props.children);
    expect(texts).toContain('—');
  });

  it('sends the pencils to step 1 and step 2', async () => {
    await open();
    await press(pencil('details'));
    expect(router.dismissTo).toHaveBeenLastCalledWith(`${base}/step1`);
    await press(pencil('items'));
    expect(router.dismissTo).toHaveBeenLastCalledWith(`${base}/step2`);
  });

  it('opens CHARGES again, with the reason red, when a save is refused', async () => {
    mockRole = 'staff';
    await open(groupLines(2), { discount_reason: '' });
    await act(async () => { mockStore.dispatch(updateDiscount(100)); });
    await press(toggle('items'));
    expect(hidden('charges')).toBe(true);

    const save = tree.root.find((node) => node.props.accessibilityLabel === (mode === 'edit' ? 'Update invoice' : 'Save invoice') && typeof node.props.onPress === 'function');
    await act(async () => { save.props.onPress(); });

    expect(hidden('charges')).toBe(false);
    expect(tree.root.findAllByType(as('ConfirmDialog')).some((d) => d.props.visible && d.props.title === 'Enter a discount reason')).toBe(true);
  });
});
