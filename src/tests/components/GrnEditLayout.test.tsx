/**
 * The edit GRN layout (review 2026-10-20, G4): it reads the GRN from the server every time the edit flow is
 * entered, draws no step until the GRN is in the form, and empties the form when it goes.
 *
 * - It starts on a spinner, so the form is never drawn empty or with an earlier visit's form first.
 * - Every entry reads the GRN again, whatever the form still holds (an earlier visit, photos removed in it).
 * - A read that failed shows a full screen error with "Try again" and "Close" and leaves no form to save.
 * - The form is emptied when the layout goes, and a read that answers after that is dropped.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import { loadGRNData as loadGRN } from '@/features/grn/services/grnFormService';
import { currentGrnFormSession } from '@/features/grn/utils/grnFormSession';
import grnFormReducer, { loadGRNData, removeHeaderImage, setTakenNumberError, type GRNHeaderData } from '@/store/slices/grnFormSlice';
import GRNEditLayout from '../../../app/grn-edit/[id]/_layout';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const PHOTO_ID = 'aaaaaaaa-2222-4333-8444-555555555555';

const makeStore = () =>
  configureStore({
    reducer: {
      grnForm: grnFormReducer,
      auth: () => ({ userProfile: { role: 'admin' } }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
type Store = ReturnType<typeof makeStore>;

let mockStore: Store;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = Object.assign(
    (props: { screenOptions?: unknown }) => React.createElement('Stack', { screenOptions: props.screenOptions }),
    { Screen: () => null }
  );
  return {
    Stack,
    router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: '11111111-2222-4333-8444-555555555555' }),
    useNavigation: () => ({ getParent: () => ({ setOptions: jest.fn() }) }),
  };
});
jest.mock('@/features/grn/services/grnFormService', () => ({ loadGRNData: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { grnForm: 'grn-form' },
  releaseLocalPhotosOwnedBy: jest.fn(async () => 0),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

const load = jest.mocked(loadGRN);
const header = (gr_no: string): GRNHeaderData => ({
  gr_no, registration: '', date: '2026-10-01', sender_id: '', sender_name: 'Fictional Sender',
  customer_id: 'c', customer_name: 'Fictional Traders', supervisor_id: 's', supervisor_name: 'Fictional Supervisor',
  note: '', leon: false, pricing_mode: 'MONTHLY',
  gr_images: [{ id: PHOTO_ID, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' }],
});
const line = {
  grn_trl_id: '55555555-2222-4333-8444-555555555555', item_table_id: 'm', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10,
  weight: 50, rack: '', package_mark: '', trl_images: [],
};
const loaded = () => ({ success: true, data: { header: header('A0010'), items: [line], grnRates: [], grnInvoiced: false } }) as never;

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let tree: ReactTestRenderer;
const render = async () => {
  await act(async () => { tree = create(<GRNEditLayout />); });
};
const text = () => JSON.stringify(tree.toJSON());
const hasSteps = () => tree.root.findAllByType('Stack' as unknown as React.ElementType).length > 0;
const press = async (label: string) => {
  const control = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { control.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(router.canGoBack).mockReturnValue(true);
  mockStore = makeStore();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('while the GRN is read', () => {
  it('shows a spinner and none of the steps, with the form empty', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);

    await render();

    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    // Read out as a busy progress bar, as the spinner this replaced was.
    const bars = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar');
    expect(bars).toHaveLength(1);
    expect(bars[0].props.accessibilityState).toEqual({ busy: true });
    expect(text()).toContain('Loading GRN details');
    expect(hasSteps()).toBe(false);
    expect(mockStore.getState().grnForm.grnId).toBeNull();
    await act(async () => { answer.resolve(loaded()); });
  });
});

describe('when the GRN is read', () => {
  it('draws the steps, with the swipe back turned off, and the form holds the GRN of the route', async () => {
    load.mockResolvedValue(loaded());

    await render();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(GRN_ID);
    expect(hasSteps()).toBe(true);
    const stack = tree.root.findByType('Stack' as unknown as React.ElementType);
    expect(stack.props.screenOptions).toMatchObject({ headerShown: false, gestureEnabled: false });
    const form = mockStore.getState().grnForm;
    expect(form.grnId).toBe(GRN_ID);
    expect(form.header.gr_no).toBe('A0010');
    expect(form.items).toHaveLength(1);
  });

  it('reads it again on every entry, and what an earlier visit left in the form (lines, removed photos, a taken-number message) is gone', async () => {
    // The form of an earlier visit to the same GRN: another number, a photo removed, a message about the number.
    mockStore.dispatch(loadGRNData({ grnId: GRN_ID, header: header('STALE'), items: [] }));
    mockStore.dispatch(removeHeaderImage(PHOTO_ID));
    mockStore.dispatch(setTakenNumberError('taken'));
    expect(mockStore.getState().grnForm.removedImages).toHaveLength(1);
    load.mockResolvedValue(loaded());

    await render();

    expect(load).toHaveBeenCalledTimes(1);
    const form = mockStore.getState().grnForm;
    expect(form.header.gr_no).toBe('A0010');
    expect(form.removedImages).toEqual([]);
    expect(form.takenNumberError).toBeNull();
  });
});

describe('when the GRN cannot be read', () => {
  it('shows a full screen error with Try again and Close, draws no step, and leaves no form', async () => {
    mockStore.dispatch(loadGRNData({ grnId: GRN_ID, header: header('STALE'), items: [] }));
    load.mockResolvedValue({ success: false, error: 'Server said no' } as never);

    await render();

    expect(hasSteps()).toBe(false);
    expect(text()).toContain("Couldn't load the GRN");
    expect(text()).toContain('Try again');
    expect(text()).toContain('Close');
    expect(mockStore.getState().grnForm.grnId).toBeNull();
    expect(mockStore.getState().grnForm.header.gr_no).toBe('');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Try again reads once more, and the steps come when it works', async () => {
    load.mockResolvedValueOnce({ success: false, error: 'Server said no' } as never);
    load.mockResolvedValueOnce(loaded());
    await render();

    await press('Try again');

    expect(load).toHaveBeenCalledTimes(2);
    expect(hasSteps()).toBe(true);
    expect(mockStore.getState().grnForm.grnId).toBe(GRN_ID);
  });

  it('Close goes back', async () => {
    load.mockRejectedValue(new Error('Network request failed'));
    await render();
    expect(text()).toContain("Couldn't load the GRN");

    await press('Close');

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('when the layout goes', () => {
  it('empties the form and leaves the form session, so a save still running is stale', async () => {
    load.mockResolvedValue(loaded());
    await render();
    expect(mockStore.getState().grnForm.grnId).toBe(GRN_ID);
    const session = currentGrnFormSession();

    await act(async () => { tree.unmount(); });

    const form = mockStore.getState().grnForm;
    expect(form.grnId).toBeNull();
    expect(form.items).toEqual([]);
    expect(currentGrnFormSession()).toBeGreaterThan(session);
    // The unmount in afterEach finds nothing to do.
    await act(async () => { tree = create(<React.Fragment />); });
  });

  it('drops a read that answers after it went', async () => {
    const answer = deferred<unknown>();
    load.mockReturnValue(answer.promise as never);
    await render();

    await act(async () => { tree.unmount(); });
    await act(async () => { answer.resolve(loaded()); });

    expect(mockStore.getState().grnForm.grnId).toBeNull();
    await act(async () => { tree = create(<React.Fragment />); });
  });
});
