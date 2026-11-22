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
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { loadInvoiceData } from '@/features/invoice/services/invoiceFormService';
import { editPayload, makeInvoiceStore, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { registerInvoiceForm } from '@/features/invoice/utils/openInvoiceForms';
import { showAlert } from '@/utils/alert';
import InvoiceEditLayout from '../../../app/invoice-edit/[id]/_layout';

let mockStore: InvoiceStore;
// How many times the steps' Stack was drawn: it must stay 0 while the invoice loads, even for the first render.
const mockStepsDrawn = { count: 0 };
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
let mockCanUpdate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canUpdate: mockCanUpdate }) }));
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = Object.assign(
    (props: { screenOptions?: unknown }) => {
      mockStepsDrawn.count += 1;
      return React.createElement('Stack', { screenOptions: props.screenOptions, testID: 'invoice-edit-steps' });
    },
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

type Host = ReturnType<typeof screen.getByText>;
/** Every host element below one, in order (the stand-in "Stack" and the spinner have no role, label or text to query by). */
const below = (node: Host): Host[] => node.children.flatMap((child) => (!child || typeof child === 'string' ? [] : [child as Host, ...below(child as Host)]));
const hostsOfType = (type: string) => {
  const root = screen.root as Host | null;
  return root ? [root, ...below(root)].filter((node) => (node.type as unknown) === type) : [];
};
const spinners = () => hostsOfType('ActivityIndicator');
const user = () => userEvent.setup({ delay: 0 });
const open = async () => render(<InvoiceEditLayout />);
// A check that something is NOT on the screen must also see a mounted-but-hidden one.
const hidden = { includeHiddenElements: true } as const;
const hasSteps = () => screen.queryByTestId('invoice-edit-steps', hidden) !== null;
const words = (isHidden = false) => screen.queryAllByText(/^/, { includeHiddenElements: isHidden }).map((node) => [node.props.children].flat(Infinity).join('')).join('\n');
const press = async (label: string) => {
  await user().press(screen.getAllByLabelText(label)[0]);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeInvoiceStore();
  mockCanUpdate = true;
  mockStepsDrawn.count = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('while the invoice loads', () => {
  it('shows a spinner and none of the steps', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);

    await open();

    expect(spinners()).toHaveLength(1);
    expect(words()).toContain('Loading invoice');
    expect(hasSteps()).toBe(false);
    expect(mockStore.getState().invoiceForm.invoice_id).toBe('inv-42');
    await act(async () => { answer.resolve(loaded()); });
  });

  it('is on the spinner already in the first render, not after the first effect', async () => {
    load.mockReturnValue(new Promise(() => {}) as never);

    await open();

    // The steps were never drawn, not even for a first render that an effect then replaced.
    expect(mockStepsDrawn.count).toBe(0);
    expect(hasSteps()).toBe(false);
    expect(spinners()).toHaveLength(1);
  });
});

describe('when the invoice is loaded', () => {
  it('draws the steps, with the swipe back turned off, and the form holds the invoice', async () => {
    load.mockResolvedValue(loaded());

    await open();

    expect(hasSteps()).toBe(true);
    expect(spinners()).toHaveLength(0);
    // The stack's options are only a prop of the router's Stack (no query reaches them): read from its stand-in.
    const stack = screen.getByTestId('invoice-edit-steps');
    expect(stack.props.screenOptions).toMatchObject({ headerShown: false, gestureEnabled: false });
    const form = mockStore.getState().invoiceForm;
    expect(form.invoice_id).toBe('inv-42');
    expect(form.header.inv_no).toBe(42);
    expect(form.baseline).not.toBeNull();
  });

  it('does not load again when the invoice is already in the form', async () => {
    load.mockResolvedValue(loaded());
    await open();
    await screen.unmount();
    // Opened again on the same invoice with the form still holding it.
    const { header, items } = editPayload([invoiceLine()]);
    mockStore.dispatch({ type: 'invoiceForm/loadInvoiceEditData', payload: { invoiceId: 'inv-42', header, items, grId: header.gr_id } });
    load.mockClear();

    await open();

    expect(load).not.toHaveBeenCalled();
    expect(hasSteps()).toBe(true);
  });
});

describe('when the invoice cannot be loaded', () => {
  it('shows a full screen error with Try again and Close, and does not leave by itself', async () => {
    load.mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await open();

    expect(hasSteps()).toBe(false);
    expect(words()).toContain("Couldn't open the invoice");
    expect(words()).toContain('Try again');
    expect(words()).toContain('Close');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('Try again loads once more, and the steps come when it works', async () => {
    load.mockResolvedValueOnce({ success: false, message: 'Server said no' } as never);
    load.mockResolvedValueOnce(loaded());
    await open();

    await press('Try again');

    await waitFor(() => expect(hasSteps()).toBe(true));
    expect(load).toHaveBeenCalledTimes(2);
    expect(words(true)).not.toContain("Couldn't open the invoice");
  });

  it('a cancelled invoice offers Close only: Try again could never work', async () => {
    load.mockResolvedValue({ success: false, code: 'cancelled', message: 'A cancelled invoice cannot be changed.' } as never);
    await open();

    expect(words()).toContain("Couldn't open the invoice");
    expect(words()).toContain('Close');
    expect(words(true)).not.toContain('Try again');
  });

  it('Close goes to the invoice\'s page', async () => {
    load.mockRejectedValue(new Error('Network request failed'));
    await open();
    expect(words()).toContain("Couldn't open the invoice");

    await press('Close');

    expect(router.dismissTo).toHaveBeenCalledWith('/invoice-details/inv-42');
  });
});

describe('someone who may not edit', () => {
  it('is sent to the Invoices tab and sees nothing of the form', async () => {
    mockCanUpdate = false;
    load.mockResolvedValue(loaded());

    await open();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/invoices');
    expect(hasSteps()).toBe(false);
    expect(spinners()).toHaveLength(0);
  });
});

describe('when the layout goes', () => {
  it('resets the form', async () => {
    load.mockResolvedValue(loaded());
    await open();
    expect(mockStore.getState().invoiceForm.invoice_id).toBe('inv-42');
    const session = mockStore.getState().invoiceForm.formSession;

    await screen.unmount();

    const form = mockStore.getState().invoiceForm;
    expect(form.invoice_id).toBeNull();
    expect(form.items).toEqual([]);
    expect(form.baseline).toBeNull();
    expect(form.formSession).toBeGreaterThan(session);
  });

  it('drops a load that answers after it went', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);
    await open();

    await screen.unmount();
    await act(async () => { answer.resolve(loaded()); });

    expect(mockStore.getState().invoiceForm.invoice_id).toBeNull();
  });
});

describe('a second edit of the same invoice (R2-10)', () => {
  it('does not empty the first edit\'s form when it closes; the last layout to close does', async () => {
    load.mockResolvedValue(loaded());
    const first = await open();
    expect(mockStore.getState().invoiceForm.baseline).not.toBeNull();

    // Opened on top of the first, with the form still holding the invoice.
    const second = await open();
    expect(hostsOfType('Stack')).toHaveLength(1);
    await second.unmount();

    expect(mockStore.getState().invoiceForm.baseline).not.toBeNull();
    expect(mockStore.getState().invoiceForm.header.inv_no).toBe(42);

    await first.unmount();
    expect(mockStore.getState().invoiceForm.baseline).toBeNull();
  });
});

describe('another invoice\'s form is open (J1)', () => {
  it('turns the visit away: nothing is loaded, the form that is open is not touched, the screen goes back', async () => {
    const release = registerInvoiceForm({ kind: 'edit', id: 'inv-7' });
    try {
      await open();

      expect(load).not.toHaveBeenCalled();
      expect(hasSteps()).toBe(false);
      expect(spinners()).toHaveLength(0);
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
      await open();
      expect(showAlert).toHaveBeenCalledWith('Another invoice is open', 'Finish or cancel the edit of invoice 7 first.', expect.any(Array));
    } finally {
      releaseEdit();
    }
    await screen.unmount();
    jest.mocked(showAlert).mockClear();

    const releaseNew = registerInvoiceForm({ kind: 'create' });
    try {
      await open();
      expect(showAlert).toHaveBeenCalledWith('Another invoice is open', 'Finish or cancel the new invoice first.', expect.any(Array));
    } finally {
      releaseNew();
    }
  });

  it('does not reset the open form when the turned-away layout goes', async () => {
    const release = registerInvoiceForm({ kind: 'edit', id: 'inv-7' });
    try {
      mockStore.dispatch({ type: 'invoiceForm/updateHeader', payload: { inv_no: 7 } });
      await open();

      await screen.unmount();

      expect(mockStore.getState().invoiceForm.header.inv_no).toBe(7);
    } finally {
      release();
    }
  });
});
