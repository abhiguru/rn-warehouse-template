/**
 * WH-230: editing an old GRN saved without a Sender name or Supervisor. Real hook, real store, real load and save
 * (loadGRNData, updateGRN); only the network is faked. A field empty when the edit opened and still empty is not
 * required and is saved empty; a field that had a value and was cleared, a typed-then-cleared one, and a new GRN
 * are required as before.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { loadGRNData as loadIntoForm, updateHeader } from '@/store/slices/grnFormSlice';
import { loadGRNData, updateGRN } from '@/features/grn/services/grnFormService';
import { useGRNForm, type UseGRNFormReturn, type GRNFormMode } from '../useGRNForm';

let mockStore: ReturnType<typeof makeStore>;
const mockRpc = jest.fn();
let mockHeaderRow: Record<string, unknown>;
const mockLineRow = { id: '55555555-2222-4333-8444-555555555555', gr_id: '11111111-2222-4333-8444-555555555555', item_id: '66666666-2222-4333-8444-555555555555', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '' };

jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/lib/queryClient', () => ({ ...jest.requireActual('@/lib/queryClient'), invalidateReportQueries: jest.fn(async () => {}) }));
jest.mock('@/config/supabaseConfig', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain, order: () => chain, range: () => chain, eq: () => chain, in: () => chain, single: () => chain,
      then: (resolve: (a: unknown) => unknown, reject: (r: unknown) => unknown) => {
        let answer: { data: unknown; error: unknown; count?: number };
        if (table === 'goodsreceived') answer = { data: mockHeaderRow, error: null };
        else if (table === 'goodsreceived_trl') answer = { data: [mockLineRow], error: null };
        else answer = { data: [], error: null };
        return Promise.resolve(answer).then(resolve, reject);
      },
    };
    return chain;
  };
  return {
    beginOperatorMutation: () => jest.fn(),
    getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
    getAuthenticatedClient: async () => ({
      from: builder,
      rpc: (...args: unknown[]) => mockRpc(...args),
      storage: { from: () => ({ remove: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: null, error: null }) }) },
    }),
  };
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp', JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex'),
    randomUUID: () => randomUUID(),
  };
});

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const oldRow = (over: Record<string, unknown> = {}) => ({
  id: GRN_ID, gr_no: 'A0010', date: '2026-10-01', customer_id: '77777777-2222-4333-8444-555555555555', customer_name: 'Fictional Traders',
  sender_id: null, sender_name: null, supervisor_id: null, supervisor_name: null, ...over,
});

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: null }) } });

async function mount(mode: GRNFormMode) {
  const latest: { current: UseGRNFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useGRNForm({ mode, grnIdParam: mode === 'edit' ? GRN_ID : undefined });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}

/** Opens the GRN the way the edit screen does: real load, then into the form. */
async function openForEdit(row: Record<string, unknown>) {
  mockHeaderRow = row;
  mockStore = makeStore();
  const loaded = await loadGRNData(GRN_ID);
  expect(loaded.success).toBe(true);
  await act(async () => { mockStore.dispatch(loadIntoForm({ ...(loaded.data as any), grnId: GRN_ID })); });
  return mount('edit');
}

const wholeForm = async (form: () => UseGRNFormReturn) => ({
  step1: await form().validateCurrentStep(1),
  step3: await form().validateCurrentStep(3),
});

/** Save as the review step does: the form's header and lines through the real updateGRN. */
async function save() {
  const { header, items } = mockStore.getState().grnForm;
  mockRpc.mockClear();
  await updateGRN(GRN_ID, { header, items, rates: [] }, {});
  const call = mockRpc.mock.calls.find(([name]) => name === 'update_grn');
  return call?.[1];
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'update_grn') return { data: { success: true, gr_id: GRN_ID, grn: { images: [] } }, error: null };
    if (name === 'get_grn_edit_state') return { data: null, error: { message: 'not found', code: 'PGRST202' } };
    return { data: { success: true, data: { grn: { rates: [] } } }, error: null };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('editing an old GRN with no sender and no supervisor', () => {
  it('goes through Next and the whole-form check, and saves with both still empty', async () => {
    const { form, unmount } = await openForEdit(oldRow());
    const { step1, step3 } = await wholeForm(form);
    expect(step1.errors).toEqual({});
    expect(step1.isValid).toBe(true);
    expect(step3.errors).toEqual({});
    expect(step3.isValid).toBe(true);
    const body = await save();
    expect(body).toBeDefined();
    expect(body.p_sender_name).toBeNull();
    expect(body.p_sender_id).toBeNull();
    expect(body.p_supervisor_name).toBeNull();
    expect(body.p_supervisor_id).toBeNull();
    await unmount();
  });

  it('with only the sender empty: the sender is not required, the supervisor it has is kept', async () => {
    const { form, unmount } = await openForEdit(oldRow({ supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' }));
    const { step1, step3 } = await wholeForm(form);
    expect(step1.isValid).toBe(true);
    expect(step3.isValid).toBe(true);
    const body = await save();
    expect(body.p_sender_name).toBeNull();
    expect(body.p_supervisor_name).toBe('Ravi Example');
    await unmount();
  });

  it('with only the supervisor empty: the supervisor is not required, the sender it has is kept', async () => {
    const { form, unmount } = await openForEdit(oldRow({ sender_id: '88888888-2222-4333-8444-555555555555', sender_name: 'Fictional Sender' }));
    const { step1, step3 } = await wholeForm(form);
    expect(step1.isValid).toBe(true);
    expect(step3.isValid).toBe(true);
    const body = await save();
    expect(body.p_sender_name).toBe('Fictional Sender');
    expect(body.p_supervisor_name).toBeNull();
    await unmount();
  });

  // WH-230 card: typing a sender and clearing it again is refused. The kept-empty check sees only the header as it is now, so a
  // cleared sender looks like one that was never there (found by this test; reported to Development).
  it.failing('a sender typed and then cleared is required again, and so is a supervisor chosen and cleared', async () => {
    const { form, unmount } = await openForEdit(oldRow());
    await act(async () => { form().updateHeaderField('sender_name', 'Typed Sender'); });
    expect((await form().validateCurrentStep(1)).isValid).toBe(true);
    await act(async () => { form().updateHeaderField('sender_name', ''); });
    const cleared = await wholeForm(form);
    expect(cleared.step1.isValid).toBe(false);
    expect(Object.keys(cleared.step1.errors).join()).toMatch(/sender/);
    expect(cleared.step3.isValid).toBe(false);

    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: 'Typed Sender', supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' })); });
    expect((await form().validateCurrentStep(1)).isValid).toBe(true);
    await act(async () => { mockStore.dispatch(updateHeader({ supervisor_id: '', supervisor_name: '' })); });
    const supervisor = await form().validateCurrentStep(1);
    expect(supervisor.isValid).toBe(false);
    expect(Object.keys(supervisor.errors).join()).toMatch(/supervisor/);
    await unmount();
  });
});

describe('a field that had a value when the edit opened', () => {
  it('is still required when cleared', async () => {
    const { form, unmount } = await openForEdit(oldRow({ sender_id: '88888888-2222-4333-8444-555555555555', sender_name: 'Fictional Sender', supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' }));
    expect((await wholeForm(form)).step1.isValid).toBe(true);
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: '' })); });
    const noSender = await wholeForm(form);
    expect(noSender.step1.isValid).toBe(false);
    expect(Object.keys(noSender.step1.errors).join()).toMatch(/sender/);
    expect(noSender.step3.isValid).toBe(false);
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: 'Fictional Sender', supervisor_id: '', supervisor_name: '' })); });
    const noSupervisor = await wholeForm(form);
    expect(noSupervisor.step1.isValid).toBe(false);
    expect(Object.keys(noSupervisor.step1.errors).join()).toMatch(/supervisor/);
    expect(noSupervisor.step3.isValid).toBe(false);
    await unmount();
  });
});

describe('a new GRN', () => {
  it('still requires both the sender and the supervisor', async () => {
    mockStore = makeStore();
    mockStore.dispatch(updateHeader({ gr_no: 'A0099', date: '2026-10-01', customer_id: '77777777-2222-4333-8444-555555555555', customer_name: 'Fictional Traders' }));
    const { form, unmount } = await mount('create');
    const { step1 } = await wholeForm(form);
    expect(step1.isValid).toBe(false);
    expect(Object.keys(step1.errors).join()).toMatch(/sender/);
    expect(Object.keys(step1.errors).join()).toMatch(/supervisor/);
    await unmount();
  });
});
