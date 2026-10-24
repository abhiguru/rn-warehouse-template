/**
 * The edit invoice layout: it loads the invoice before it draws any step.
 *
 * - It starts on a spinner, so the form is never drawn empty first.
 * - A loaded invoice puts the steps on the screen; a failed load shows a full
 *   screen error with "Try again" and "Close", and does not leave by itself.
 * - Someone who may not edit is sent to the Invoices tab, and sees nothing.
 * - The form is reset when the layout goes.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { loadInvoiceData } from '@/features/invoice/services/invoiceFormService';
import { editPayload, makeInvoiceStore, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { registerInvoiceForm } from '@/features/invoice/utils/openInvoiceForms';
import { showAlert } from '@/utils/alert';
import InvoiceEditLayout from '../../../app/invoice-edit/[id]/_layout';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
let mockCanUpdate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: mockCanUpdate }) }));
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = Object.assign(
    (props: { screenOptions?: unknown }) => React.createElement('Stack', { screenOptions: props.screenOptions }),
    { Screen: () => null }
  );
  return {
    Stack,
    router: { replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => ({ id: 'inv-42' }),
    useNavigation: () => ({ getParent: () => ({ setOptions: jest.fn() }) }),
  };
});
jest.mock('@/features/invoice/services/invoiceFormService', () => ({ loadInvoiceData: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

const load = jest.mocked(loadInvoiceData);
const loaded = () => {
  const { header, items } = editPayload([invoiceLine()]);
  return { success: true, data: { header, items } } as never;
};

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let tree: ReactTestRenderer;
const render = async () => {
  await act(async () => { tree = create(<InvoiceEditLayout />); });
};
const text = () => JSON.stringify(tree.toJSON());
const hasSteps = () => tree.root.findAllByType('Stack' as unknown as React.ElementType).length > 0;
const press = async (label: string) => {
  const control = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { control.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeInvoiceStore();
  mockCanUpdate = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('while the invoice loads', () => {
  it('shows a spinner and none of the steps', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);

    await render();

    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(text()).toContain('Loading invoice');
    expect(hasSteps()).toBe(false);
    expect(mockStore.getState().invoiceForm.invoice_id).toBe('inv-42');
    await act(async () => { answer.resolve(loaded()); });
  });

  it('is on the spinner already in the first render, not after the first effect', () => {
    load.mockReturnValue(new Promise(() => {}) as never);

    act(() => { tree = create(<InvoiceEditLayout />); });

    expect(hasSteps()).toBe(false);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });
});

describe('when the invoice is loaded', () => {
  it('draws the steps, with the swipe back turned off, and the form holds the invoice', async () => {
    load.mockResolvedValue(loaded());

    await render();

    expect(hasSteps()).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    const stack = tree.root.findByType('Stack' as unknown as React.ElementType);
    expect(stack.props.screenOptions).toMatchObject({ headerShown: false, gestureEnabled: false });
    const form = mockStore.getState().invoiceForm;
    expect(form.invoice_id).toBe('inv-42');
    expect(form.header.inv_no).toBe(42);
    expect(form.baseline).not.toBeNull();
  });

  it('does not load again when the invoice is already in the form', async () => {
    load.mockResolvedValue(loaded());
    await render();
    await act(async () => { tree.unmount(); });
    // Opened again on the same invoice with the form still holding it.
    const { header, items } = editPayload([invoiceLine()]);
    mockStore.dispatch({ type: 'invoiceForm/loadInvoiceEditData', payload: { invoiceId: 'inv-42', header, items, grId: header.gr_id } });
    load.mockClear();

    await render();

    expect(load).not.toHaveBeenCalled();
    expect(hasSteps()).toBe(true);
  });
});

describe('when the invoice cannot be loaded', () => {
  it('shows a full screen error with Try again and Close, and does not leave by itself', async () => {
    load.mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await render();

    expect(hasSteps()).toBe(false);
    expect(text()).toContain("Couldn't open the invoice");
    expect(text()).toContain('Try again');
    expect(text()).toContain('Close');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('Try again loads once more, and the steps come when it works', async () => {
    load.mockResolvedValueOnce({ success: false, message: 'Server said no' } as never);
    load.mockResolvedValueOnce(loaded());
    await render();

    await press('Try again');

    expect(load).toHaveBeenCalledTimes(2);
    expect(hasSteps()).toBe(true);
    expect(text()).not.toContain("Couldn't open the invoice");
  });

  it('Close goes to the invoice\'s page', async () => {
    load.mockRejectedValue(new Error('Network request failed'));
    await render();
    expect(text()).toContain("Couldn't open the invoice");

    await press('Close');

    expect(router.dismissTo).toHaveBeenCalledWith('/invoice-details/inv-42');
  });
});

describe('someone who may not edit', () => {
  it('is sent to the Invoices tab and sees nothing of the form', async () => {
    mockCanUpdate = false;
    load.mockResolvedValue(loaded());

    await render();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/invoices');
    expect(hasSteps()).toBe(false);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

describe('when the layout goes', () => {
  it('resets the form', async () => {
    load.mockResolvedValue(loaded());
    await render();
    expect(mockStore.getState().invoiceForm.invoice_id).toBe('inv-42');
    const session = mockStore.getState().invoiceForm.formSession;

    await act(async () => { tree.unmount(); });

    const form = mockStore.getState().invoiceForm;
    expect(form.invoice_id).toBeNull();
    expect(form.items).toEqual([]);
    expect(form.baseline).toBeNull();
    expect(form.formSession).toBeGreaterThan(session);
    // The unmount in afterEach finds nothing to do.
    await act(async () => { tree = create(<React.Fragment />); });
  });

  it('drops a load that answers after it went', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);
    await render();

    await act(async () => { tree.unmount(); });
    await act(async () => { answer.resolve(loaded()); });

    expect(mockStore.getState().invoiceForm.invoice_id).toBeNull();
    await act(async () => { tree = create(<React.Fragment />); });
  });
});

describe('a second edit of the same invoice (R2-10)', () => {
  it('does not empty the first edit\'s form when it closes; the last layout to close does', async () => {
    load.mockResolvedValue(loaded());
    await render();
    const first = tree;
    expect(mockStore.getState().invoiceForm.baseline).not.toBeNull();

    // Opened on top of the first, with the form still holding the invoice.
    let second!: ReactTestRenderer;
    await act(async () => { second = create(<InvoiceEditLayout />); });
    expect(second.root.findAllByType('Stack' as unknown as React.ElementType)).toHaveLength(1);
    await act(async () => { second.unmount(); });

    expect(mockStore.getState().invoiceForm.baseline).not.toBeNull();
    expect(mockStore.getState().invoiceForm.header.inv_no).toBe(42);

    tree = first;
    await act(async () => { first.unmount(); });
    expect(mockStore.getState().invoiceForm.baseline).toBeNull();
    // afterEach unmounts again
    await act(async () => { tree = create(<InvoiceEditLayout />); });
  });
});

describe('another invoice\'s form is open (J1)', () => {
  it('turns the visit away: nothing is loaded, the form that is open is not touched, the screen goes back', async () => {
    const release = registerInvoiceForm({ kind: 'edit', id: 'inv-7' });
    try {
      await render();

      expect(load).not.toHaveBeenCalled();
      expect(hasSteps()).toBe(false);
      expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
      expect(mockStore.getState().invoiceForm.invoice_id).toBeNull();
      expect(router.back).toHaveBeenCalledTimes(1);
      // The message, and the buttons: Close and "Open it" (which takes the person back to the form that is open).
      expect(showAlert).toHaveBeenCalledWith('Another invoice is open', expect.stringContaining('Finish or cancel'), expect.any(Array));
    } finally {
      release();
    }
  });

  it('says which invoice is open when its number is known, and a new invoice that is open', async () => {
    load.mockResolvedValue(loaded());
    mockStore.dispatch({ type: 'invoiceForm/updateHeader', payload: { inv_no: 7 } });
    const releaseEdit = registerInvoiceForm({ kind: 'edit', id: 'inv-7' });
    try {
      await render();
      expect(showAlert).toHaveBeenCalledWith('Another invoice is open', 'Finish or cancel the edit of invoice 7 first.', expect.any(Array));
    } finally {
      releaseEdit();
    }
    await act(async () => { tree.unmount(); });
    jest.mocked(showAlert).mockClear();

    const releaseNew = registerInvoiceForm({ kind: 'create' });
    try {
      await render();
      expect(showAlert).toHaveBeenCalledWith('Another invoice is open', 'Finish or cancel the new invoice first.', expect.any(Array));
    } finally {
      releaseNew();
    }
  });

  it('does not reset the open form when the turned-away layout goes', async () => {
    const release = registerInvoiceForm({ kind: 'edit', id: 'inv-7' });
    try {
      mockStore.dispatch({ type: 'invoiceForm/updateHeader', payload: { inv_no: 7 } });
      await render();

      await act(async () => { tree.unmount(); });

      expect(mockStore.getState().invoiceForm.header.inv_no).toBe(7);
    } finally {
      release();
    }
    await act(async () => { tree = create(<React.Fragment />); });
  });
});
