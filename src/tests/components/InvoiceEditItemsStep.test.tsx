/**
 * Invoice edit, items step: a line with a charge of 0 goes on to the review
 * (owner decision 3 of 2026-10-11); a line with a duration of 0 does not, and
 * the message speaks of the duration only. The step is the shared items step
 * in edit mode, on the real hook and a real invoice-form slice.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n/language';
import type { InvoiceItemData } from '@/types/invoice.types';
import { makeInvoiceStore, openForEdit, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';

const mockStore = makeInvoiceStore({ role: 'staff' });
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  // The items table (a stand-in here) is a keyboard-aware FlashList.
  listenToKeyboardEvents: () => (component: unknown) => component,
}));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: 'InvoiceItemsEditor' }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const line = (id: number, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => invoiceLine(overrides, id);

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceEditStep2 />); });
  return tree;
}
const pressNext = async (tree: ReactTestRenderer) => {
  const next = tree.root.find(
    (node) => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Next: review' && typeof node.props.onPress === 'function'
  );
  await act(async () => { await next.props.onPress(); });
};
const shown = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('invoice edit, items step', () => {
  const load = (items: InvoiceItemData[]) => openForEdit(mockStore, items, { labour: 400, tax_amount: 45, total: 945 });

  it('goes on to the review with a line whose charge is 0', async () => {
    load([line(0, { charge: 0 }), line(1)]);
    const tree = await render();

    await pressNext(tree);

    expect(showAlert).not.toHaveBeenCalled();
    expect(shown(tree)).toHaveLength(0);
    expect(router.navigate).toHaveBeenCalledWith('/invoice-edit/inv-42/step3');
    await act(async () => { tree.unmount(); });
  });

  it('stops for a line with a duration of 0 and speaks of the duration only', async () => {
    load([line(0, { duration: 0 }), line(1, { charge: 0 })]);
    const tree = await render();

    await pressNext(tree);

    expect(shown(tree)).toHaveLength(1);
    // The same sentence as in a new invoice, with the number of lines.
    expect(shown(tree)[0].props.title).toBe('Check the item prices');
    expect(shown(tree)[0].props.message).toBe('1 item has a duration of 0. The duration must be greater than 0.');
    expect(router.navigate).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  // Every other failure of the items check used to be answered with "Every
  // item needs a duration greater than 0.", a rule the line already met.
  it.each([
    ['a duration under half a month', { duration: 0.3 }, 'Duration must be at least 0.5 months'],
    ['days below 0', { no_of_days: -1 }, 'Days cannot be negative'],
    ['a tax above 100%', { tax: 150 }, 'Tax cannot exceed 100%'],
    ['a charge out of range', { charge: 1000000 }, 'Charge is too large'],
  ])('stops for %s and says what is wrong with it', async (_what, overrides, message) => {
    load([line(0, overrides), line(1)]);
    const tree = await render();

    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item prices', message);
    expect(router.navigate).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('names each kind of failure once when several lines fail', async () => {
    load([line(0, { duration: 0.3 }), line(1, { duration: 0.2, tax: 150 }), line(2)]);
    const tree = await render();

    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledWith('Check the item prices', 'Duration must be at least 0.5 months\nTax cannot exceed 100%');
    await act(async () => { tree.unmount(); });
  });

  it('says it in Gujarati', async () => {
    load([line(0, { duration: 0.3 })]);
    const tree = await render();

    // The message is worded when Next is pressed, in the language of that moment.
    setLanguage('gu');
    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledWith('આઇટમના દર તપાસો', 'મુદત ઓછામાં ઓછી ૦.૫ મહિના હોવી જોઈએ');
    await act(async () => { tree.unmount(); });
    setLanguage('en');
  });
});
