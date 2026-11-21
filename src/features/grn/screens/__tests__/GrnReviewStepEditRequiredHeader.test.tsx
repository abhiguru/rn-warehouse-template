/**
 * WH-248 (was WH-230's exemption): the Review step's Save for an old GRN with no Sender name or Supervisor is refused. Real useGRNForm, real
 * store, real grnFormService (loadGRNData, updateGRN) and the real GrnReviewStep; only supabase is faked (plus native
 * modules, navigation and the rate list). Step 1 and step 2 Next are the hook's validateCurrentStep, then Review's Save.
 * Step 1 Next and Save agree: both refuse an empty one; filled, the GRN saves.
 */
import React from 'react';
import { act, render, renderHook, screen, userEvent } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { loadGRNData as loadIntoForm, updateHeader } from '@/store/slices/grnFormSlice';
import { loadGRNData } from '@/features/grn/services/grnFormService';
import { useGRNForm, type UseGRNFormReturn } from '@/hooks/useGRNForm';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { showAlert } from '@/utils/alert';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const CUST = '77777777-2222-4333-8444-555555555555';
const ITEM = '66666666-2222-4333-8444-555555555555';
const PHOTO = { id: 'p1', fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' };

const makeStore = () => configureStore({
  reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: { role: 'supervisor' } }), theme: () => ({ preference: 'light', brand: 'orange' }) },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
});
let mockStore: ReturnType<typeof makeStore>;
const mockRpc = jest.fn();
let mockHeaderRow: Record<string, unknown>;
const mockLineRow = { id: '55555555-2222-4333-8444-555555555555', gr_id: GRN_ID, item_id: ITEM, item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '' };

jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
// react-redux ships ESM that Jest here cannot load; the hooks that import it only need the store.
jest.mock('react-redux', () => ({ useStore: () => mockStore, useDispatch: () => mockStore.dispatch, useSelector: (s: (st: unknown) => unknown) => s(mockStore.getState()) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
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
let mockRates: ItemStoragePrice[] = [];
jest.mock('@/features/grn/rates/useGrnRates', () => ({
  useGrnRates: () => ({ rates: mockRates, status: 'ready', offline: false, refresh: jest.fn(async () => {}) }),
}));
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
// The dialog draws its title and Confirm button while it is open, and the bar draws its Next button; both call the real props.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(View, null,
        createElement(Text, null, props.title),
        createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Confirm', onPress: props.onConfirm }))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard next', onPress: props.onNext }),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/services/orderEffects', () => ({ ...jest.requireActual('@/services/orderEffects'), previewUpdateGrn: jest.fn(async () => []) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({ abandonLocalPhotoUpload: jest.fn(), releaseLocalPhotos: jest.fn(async () => 0) }));

const oldRow = (over: Record<string, unknown> = {}) => ({
  id: GRN_ID, gr_no: 'A0010', date: '2026-10-01', customer_id: CUST, customer_name: 'Fictional Traders',
  sender_id: null, sender_name: null, supervisor_id: null, supervisor_name: null, ...over,
});
const rate = (): ItemStoragePrice => ({
  id: 'r1', item_id: ITEM, item_name: 'Example Potatoes', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: 2, weight_min: 0, weight_max: 100, labour_rate: 1.5, tax_percent: 5, effective_from: '2026-01-01', effective_to: null, created_at: '', created_by: '',
});

let form: { current: UseGRNFormReturn };

/** Opens the GRN as the edit screen does (real load into the form), then mounts the hook the wizard's steps share. */
async function openForEdit(row: Record<string, unknown>) {
  mockHeaderRow = row;
  mockStore = makeStore();
  const loaded = await loadGRNData(GRN_ID);
  expect(loaded.success).toBe(true);
  await act(async () => { mockStore.dispatch(loadIntoForm({ ...(loaded.data as any), grnId: GRN_ID })); });
  // The photo the review step needs, as a worker would have it on an app-made GRN.
  await act(async () => { mockStore.dispatch(updateHeader({ gr_images: [PHOTO] as any })); });
  const hook = await renderHook(() => useGRNForm({ mode: 'edit', grnIdParam: GRN_ID }));
  form = hook.result;
}

/** Step 1 Next and step 2 Next, as the wizard does them. */
async function next() {
  const step1 = await form.current.validateCurrentStep(1);
  const step2 = await form.current.validateCurrentStep(2);
  return { step1, step2 };
}

/** Review step: tap Save, confirm the dialog, and report the update_grn call. */
async function saveOnReview() {
  await render(<GrnReviewStep mode="edit" />);
  mockRpc.mockClear();
  const user = userEvent.setup({ delay: 0 });
  await user.press(screen.getByRole('button', { name: 'Wizard next' }));
  const asked = screen.queryByText(/^Save changes to GRN/) !== null; // read before confirming, which closes it
  if (asked) await user.press(screen.getByRole('button', { name: 'Confirm' }));
  const call = mockRpc.mock.calls.find(([name]) => name === 'update_grn');
  return { asked, body: call?.[1] };
}
const checkDetailsAlerts = () => (showAlert as jest.Mock).mock.calls.filter(([title]) => title === 'Check the GRN details');

beforeEach(() => {
  mockRates = [rate()];
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'update_grn') return { data: { success: true, gr_id: GRN_ID, grn: { images: [] } }, error: null };
    if (name === 'get_grn_edit_state') return { data: null, error: { message: 'not found', code: 'PGRST202' } };
    return { data: { success: true, data: { grn: { rates: [] } } }, error: null };
  });
  (showAlert as jest.Mock).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Review step Save on an old GRN with no Sender name and no Supervisor', () => {
  it('is refused at step 1 Next and at Save ("Check the GRN details"), and nothing is sent', async () => {
    await openForEdit(oldRow());
    const { step1 } = await next();
    expect(step1.isValid).toBe(false);
    expect(step1.errors.sender_name).toBe('Sender name is required');
    const { asked, body } = await saveOnReview();
    expect(checkDetailsAlerts()).toHaveLength(1);
    expect(checkDetailsAlerts()[0][1]).toMatch(/Sender name is required/);
    expect(checkDetailsAlerts()[0][1]).toMatch(/Supervisor is required/);
    expect(asked).toBe(false);
    expect(body).toBeUndefined();
  });

  it('with both filled, Next passes and Save sends update_grn with them', async () => {
    await openForEdit(oldRow());
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: 'Typed Sender', supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' })); });
    const { step1, step2 } = await next();
    expect(step1.isValid).toBe(true);
    expect(step2.isValid).toBe(true);
    const { asked, body } = await saveOnReview();
    expect(checkDetailsAlerts()).toHaveLength(0);
    expect(asked).toBe(true);
    expect(body.p_sender_name).toBe('Typed Sender');
    expect(body.p_supervisor_name).toBe('Ravi Example');
  });

  it('a sender typed and then cleared is refused at Save, and nothing is sent', async () => {
    await openForEdit(oldRow());
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: 'Typed Sender' })); });
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: '' })); });
    const { asked, body } = await saveOnReview();
    expect(checkDetailsAlerts()).toHaveLength(1);
    expect(checkDetailsAlerts()[0][1]).toMatch(/Sender name is required/);
    expect(asked).toBe(false);
    expect(body).toBeUndefined();
  });

  it('a supervisor chosen and then cleared is refused at Save too', async () => {
    await openForEdit(oldRow());
    await act(async () => { mockStore.dispatch(updateHeader({ supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' })); });
    await act(async () => { mockStore.dispatch(updateHeader({ supervisor_id: '', supervisor_name: '' })); });
    const { body } = await saveOnReview();
    expect(checkDetailsAlerts()).toHaveLength(1);
    expect(checkDetailsAlerts()[0][1]).toMatch(/Supervisor is required/);
    expect(body).toBeUndefined();
  });

  it('a field that had a value when the edit opened and was cleared is refused at Save', async () => {
    await openForEdit(oldRow({ sender_id: '88888888-2222-4333-8444-555555555555', sender_name: 'Fictional Sender', supervisor_id: '99999999-2222-4333-8444-555555555555', supervisor_name: 'Ravi Example' }));
    await act(async () => { mockStore.dispatch(updateHeader({ sender_name: '' })); });
    const { body } = await saveOnReview();
    expect(checkDetailsAlerts()).toHaveLength(1);
    expect(body).toBeUndefined();
  });
});

describe('Review step Save on a new GRN without a Sender name and Supervisor', () => {
  it('is refused with the details alert and save_grn is not called', async () => {
    mockStore = makeStore();
    await act(async () => {
      mockStore.dispatch(updateHeader({ gr_no: 'A0011', date: '2026-10-01', customer_id: CUST, customer_name: 'Fictional Traders', gr_images: [PHOTO] as any }));
    });
    await render(<GrnReviewStep mode="create" />);
    await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Wizard next' }));
    expect(checkDetailsAlerts()).toHaveLength(1);
    expect(checkDetailsAlerts()[0][1]).toMatch(/Sender name is required/);
    expect(mockRpc.mock.calls.find(([name]) => name === 'save_grn')).toBeUndefined();
  });
});
