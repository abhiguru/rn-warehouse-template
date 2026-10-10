/**
 * Typing in the GRN number field checks the number against the server. The
 * check must never throw away the form: a taken number is reported on the
 * field, and nothing else changes.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import grnFormReducer, { loadGRNData, addHeaderImage, updateHeader, type GRNHeaderData } from '@/store/slices/grnFormSlice';
import { checkGrnExists, loadGRNData as loadGRNDataService } from '@/features/grn/services/grnFormService';
import { useGRNForm, type UseGRNFormReturn, type GRNFormMode } from '../useGRNForm';

// react-redux is not transformed for jest here, so the store is bound by hand.
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/grn/services/grnFormService', () => ({
  checkGrnExists: jest.fn(),
  loadGRNData: jest.fn(),
  getNextGRNNumber: jest.fn(async () => 'A0099'),
  createGRN: jest.fn(),
  updateGRN: jest.fn(),
}));
jest.mock('@/features/grn/services/imageUploadService', () => ({ generateTempGRNId: () => 'temp_grn_fixture' }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const OWN_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ID = '99999999-2222-4333-8444-555555555555';
const CUSTOMER_ID = '33333333-2222-4333-8444-555555555555';
const SUPERVISOR_ID = '44444444-2222-4333-8444-555555555555';

const header: GRNHeaderData = {
  gr_no: 'A0010',
  registration: '',
  date: '2026-10-01',
  sender_id: '',
  sender_name: 'Fictional Sender',
  customer_id: CUSTOMER_ID,
  customer_name: 'Fictional Traders',
  supervisor_id: SUPERVISOR_ID,
  supervisor_name: 'Fictional Supervisor',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [
    { id: 'aaaaaaaa-2222-4333-8444-555555555555', fileName: 'one.webp', imageUrl: 'https://example.invalid/one', storagePath: 'headers/x/one.webp', uploadStatus: 'completed' },
  ],
};
const line = {
  grn_trl_id: '55555555-2222-4333-8444-555555555555',
  item_table_id: '66666666-2222-4333-8444-555555555555',
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: [],
};

function makeStore() {
  return configureStore({
    reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: null }) },
  });
}

async function mount(mode: GRNFormMode, store: ReturnType<typeof makeStore>, grnIdParam?: string) {
  const latest: { current: UseGRNFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useGRNForm({ mode, grnIdParam });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  mockStore = store;
  await act(async () => {
    tree = create(<Harness />);
  });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}

/** Type a number and let the 750 ms debounce and the check finish. */
async function typeNumber(form: () => UseGRNFormReturn, text: string) {
  await act(async () => {
    form().handleGrNoChange(text);
    await jest.advanceTimersByTimeAsync(800);
  });
}

describe('GRN number check', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('editing an existing GRN', () => {
    async function openEdit() {
      const store = makeStore();
      store.dispatch(loadGRNData({ header, items: [line], grnId: OWN_ID }));
      const mounted = await mount('edit', store, OWN_ID);
      return { store, ...mounted };
    }

    it('keeps the loaded GRN when the typed number is free', async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: false });
      const { store, form, unmount } = await openEdit();

      await typeNumber(form, 'A0077');

      expect(router.replace).not.toHaveBeenCalled();
      const state = store.getState().grnForm;
      expect(state.grnId).toBe(OWN_ID);
      expect(state.items).toHaveLength(1);
      expect(state.header.gr_images).toHaveLength(1);
      expect(state.header.gr_no).toBe('A0077');
      expect(form().validationErrors.gr_no).toBeUndefined();
      await unmount();
    });

    it("does not call the GRN's own number a duplicate", async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: true, grnId: OWN_ID, grNo: 'A0010' });
      const { store, form, unmount } = await openEdit();

      await typeNumber(form, 'A0010');

      expect(router.replace).not.toHaveBeenCalled();
      expect(form().validationErrors.gr_no).toBeUndefined();
      expect(store.getState().grnForm.grnId).toBe(OWN_ID);
      let validation!: { isValid: boolean };
      await act(async () => { validation = await form().validateCurrentStep(1); });
      expect(validation.isValid).toBe(true);
      await unmount();
    });

    it("reports another GRN's number and stays on this GRN", async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: true, grnId: OTHER_ID, grNo: 'A0020', customerName: 'Fictional Stores' });
      const { store, form, unmount } = await openEdit();

      await typeNumber(form, 'A0020');

      expect(router.replace).not.toHaveBeenCalled();
      expect(loadGRNDataService).not.toHaveBeenCalled();
      expect(form().validationErrors.gr_no).toMatch(/A0020/);
      const state = store.getState().grnForm;
      expect(state.grnId).toBe(OWN_ID);
      expect(state.items).toHaveLength(1);
      expect(state.header.gr_images).toHaveLength(1);
      await unmount();
    });
  });

  describe('creating a GRN', () => {
    async function openCreate() {
      const store = makeStore();
      store.dispatch(updateHeader({ ...header, gr_no: 'A0099', gr_images: [] }));
      store.dispatch(addHeaderImage({ id: 'temp_1', fileName: 'new.webp', imageUrl: 'file:///cache/new.webp', uploadStatus: 'completed' }));
      const mounted = await mount('create', store);
      return { store, ...mounted };
    }

    it('reports a taken number on the field and keeps everything typed so far', async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: true, grnId: OTHER_ID, grNo: 'A0020', customerName: 'Fictional Stores' });
      const { store, form, unmount } = await openCreate();

      await typeNumber(form, 'A0020');

      expect(router.replace).not.toHaveBeenCalled();
      expect(form().validationErrors.gr_no).toMatch(/A0020/);
      const state = store.getState().grnForm;
      expect(state.grnId).toBeNull();
      expect(state.header.customer_id).toBe(CUSTOMER_ID);
      expect(state.header.gr_images).toEqual([expect.objectContaining({ id: 'temp_1' })]);
      await unmount();
    });

    it('does not let the form move on while the number is taken, and clears the report when the number changes', async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: true, grnId: OTHER_ID, grNo: 'A0020' });
      const { form, unmount } = await openCreate();
      await typeNumber(form, 'A0020');

      let validation!: { isValid: boolean; errors: Record<string, string> };
      await act(async () => { validation = await form().validateCurrentStep(1); });
      expect(validation.isValid).toBe(false);
      expect(validation.errors.gr_no).toMatch(/A0020/);

      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: false });
      await typeNumber(form, 'A0021');
      expect(form().validationErrors.gr_no).toBeUndefined();
      await act(async () => { validation = await form().validateCurrentStep(1); });
      expect(validation.isValid).toBe(true);
      await unmount();
    });

    it('says nothing when the check itself failed', async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: false, error: true, message: 'Network request failed' });
      const { form, unmount } = await openCreate();

      await typeNumber(form, 'A0020');

      expect(form().validationErrors.gr_no).toBeUndefined();
      expect(router.replace).not.toHaveBeenCalled();
      await unmount();
    });

    it('drops spaces from the typed number', async () => {
      (checkGrnExists as jest.Mock).mockResolvedValue({ exists: false });
      const { store, form, unmount } = await openCreate();

      await typeNumber(form, ' A00 30 ');

      expect(store.getState().grnForm.header.gr_no).toBe('A0030');
      expect(checkGrnExists).toHaveBeenCalledWith('A0030');
      await unmount();
    });
  });
});
