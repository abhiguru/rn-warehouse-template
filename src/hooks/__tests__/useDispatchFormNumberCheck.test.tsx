/**
 * Typing in the dispatch number field checks the number against the server.
 * The check must never throw away the form: a taken number is reported on the
 * field, and nothing else changes.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import dispatchFormReducer, { loadDispatchData, updateHeader } from '@/store/slices/dispatchFormSlice';
import { EMPTY_DISPATCH_HEADER, type DispatchItemData } from '@/types/dispatch.types';
import { checkDispatchExists, loadDispatchData as loadDispatchDataService } from '@/features/dispatch/services/dispatchFormService';
import { useDispatchForm, type UseDispatchFormReturn, type DispatchFormMode } from '../useDispatchForm';

// react-redux is not transformed for jest here, so the store is bound by hand.
let mockStore: ReturnType<typeof makeStore>;
jest.mock('react-redux', () => ({ useStore: () => mockStore }));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/dispatch/services/dispatchFormService', () => ({
  checkDispatchExists: jest.fn(),
  loadDispatchData: jest.fn(),
  getNextDispatchNumber: jest.fn(async () => 'DD0099'),
  createDispatch: jest.fn(),
  updateDispatch: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const OWN_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ID = '99999999-2222-4333-8444-555555555555';

const header = {
  ...EMPTY_DISPATCH_HEADER,
  disp_no: 'DD0003',
  disp_date: '2026-10-02T00:00:00.000Z',
  registration: 'GJ01AB1234',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Fictional Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Fictional Supervisor',
};
const item = {
  unique_id: 'line-1',
  grns_id: '55555555-2222-4333-8444-555555555555',
  grns_gr_no: 'A0010',
  grns_date: '2026-10-01T00:00:00.000Z',
  grns_customer_name: 'Fictional Traders',
  grnItems_id: '66666666-2222-4333-8444-555555555555',
  grnItems_item_id: '77777777-2222-4333-8444-555555555555',
  grnItems_item_name: 'Example Potatoes',
  grnItems_quantity: 100,
  grnItems_stock: 90,
  grnItems_package_mark: '',
  grnItems_rack: '',
  grnItems_weight: 50,
  disp_quantity: 10,
} as DispatchItemData;

function makeStore() {
  return configureStore({
    reducer: { dispatchForm: dispatchFormReducer, auth: () => ({ userProfile: null }) },
  });
}

async function mount(mode: DispatchFormMode, store: ReturnType<typeof makeStore>, dispatchIdParam?: string) {
  const latest: { current: UseDispatchFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useDispatchForm({ mode, dispatchIdParam });
    return null;
  };
  mockStore = store;
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Harness />);
  });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}

/** Type a number and let the 750 ms debounce and the check finish. */
async function typeNumber(form: () => UseDispatchFormReturn, text: string) {
  await act(async () => {
    form().handleDispNoChange(text);
    await jest.advanceTimersByTimeAsync(800);
  });
}

describe('dispatch number check', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function openEdit() {
    const store = makeStore();
    store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header, items: [item] }));
    const mounted = await mount('edit', store, OWN_ID);
    return { store, ...mounted };
  }

  it('keeps the loaded dispatch when the typed number is free', async () => {
    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: false });
    const { store, form, unmount } = await openEdit();

    await typeNumber(form, 'DD0077');

    expect(router.replace).not.toHaveBeenCalled();
    const state = store.getState().dispatchForm;
    expect(state.dispatch_id).toBe(OWN_ID);
    expect(state.items).toHaveLength(1);
    expect(state.header.disp_no).toBe('DD0077');
    expect(form().validationErrors.disp_no).toBeUndefined();
    await unmount();
  });

  it("does not call the dispatch's own number a duplicate", async () => {
    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: true, dispatchId: OWN_ID, dispNo: 'DD0003' });
    const { store, form, unmount } = await openEdit();

    await typeNumber(form, 'DD0003');

    expect(router.replace).not.toHaveBeenCalled();
    expect(form().validationErrors.disp_no).toBeUndefined();
    expect(store.getState().dispatchForm.dispatch_id).toBe(OWN_ID);
    await unmount();
  });

  it("reports another dispatch's number and stays on this dispatch", async () => {
    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: true, dispatchId: OTHER_ID, dispNo: 'DD0005', customerName: 'Fictional Stores' });
    const { store, form, unmount } = await openEdit();

    await typeNumber(form, 'DD0005');

    expect(router.replace).not.toHaveBeenCalled();
    expect(loadDispatchDataService).not.toHaveBeenCalled();
    expect(form().validationErrors.disp_no).toMatch(/DD0005/);
    const state = store.getState().dispatchForm;
    expect(state.dispatch_id).toBe(OWN_ID);
    expect(state.items).toHaveLength(1);

    let validation!: { isValid: boolean; errors: Record<string, string> };
    await act(async () => { validation = await form().validateCurrentStep(1); });
    expect(validation.isValid).toBe(false);
    expect(validation.errors.disp_no).toMatch(/DD0005/);
    await unmount();
  });

  it('reports a taken number while creating and keeps the items typed so far', async () => {
    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: true, dispatchId: OTHER_ID, dispNo: 'DD0005' });
    const store = makeStore();
    store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header, items: [item] }));
    store.dispatch(updateHeader({ disp_no: 'DD0099' }));
    const { form, unmount } = await mount('create', store);

    await typeNumber(form, 'DD0005');

    expect(router.replace).not.toHaveBeenCalled();
    expect(form().validationErrors.disp_no).toMatch(/DD0005/);
    expect(store.getState().dispatchForm.items).toHaveLength(1);
    expect(store.getState().dispatchForm.header.customer_name).toBe('Fictional Traders');
    await unmount();
  });
  // RF-14: the block used to live in a ref of one screen instance.
  it('a taken number still keeps step 1 from passing after the step was left and reopened', async () => {
    const logged = jest.spyOn(console, 'log');
    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: true, dispatchId: OTHER_ID, dispNo: 'DD0005' });
    const store = makeStore();
    store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header, items: [item] }));
    const first = await mount('edit', store, OWN_ID);
    await typeNumber(first.form, 'DD0005');
    await first.unmount();

    const second = await mount('edit', store, OWN_ID);
    expect(second.form().validationErrors.disp_no).toMatch(/DD0005/);
    let validation!: { isValid: boolean; errors: Record<string, string> };
    await act(async () => { validation = await second.form().validateCurrentStep(1); });
    expect(validation.isValid).toBe(false);
    expect(validation.errors.disp_no).toMatch(/DD0005/);
    expect(JSON.stringify(logged.mock.calls.filter(([text]) => String(text).includes('handleDispNoChange') || String(text).includes('Checking')))).not.toContain('DD0005');

    (checkDispatchExists as jest.Mock).mockResolvedValue({ exists: false });
    await typeNumber(second.form, 'DD0006');
    expect(store.getState().dispatchForm.takenNumberError).toBeNull();
    expect(second.form().validationErrors.disp_no).toBeUndefined();
    await second.unmount();
  });
});
