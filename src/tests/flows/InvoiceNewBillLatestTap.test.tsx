/**
 * WH-205 rework 2 (startNewBill.ts): only the latest tap's `can_make_bills` request may go on. The real Invoices tab, the real
 * gate and the real invoice-form slice run; only the facility's `rpc` is a stand-in, and every `can_make_bills` answer is held
 * until the test releases it. Fictional data only.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import InvoicesTab from '../../../app/(tabs)/invoices';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { showAlert } from '@/utils/alert';
import { newFlowStore, flowStore } from '@/tests/helpers/invoiceFlowStore';
import { resetScreenFocus, setScreenFocused } from '../components/focusHarness';

jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks());
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('../components/focusHarness').useFocusEffect,
}));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/lists', () => ({ InvoiceFlashList: () => null }));
jest.mock('@/components/list/ListErrorBoundary', () => ({ ListErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'admin' }) }));

/** Each can_make_bills call waits here until released with an answer. */
type Held = { release: (allowed: boolean) => void };
let held: Held[] = [];
const rpc = jest.fn((name: string) => {
  if (name !== 'can_make_bills') return Promise.resolve({ data: null, error: { message: `Unexpected rpc ${name}` } });
  return new Promise((resolve) => {
    held.push({ release: (allowed) => resolve({ data: { success: true, data: { allowed } }, error: null }) });
  });
});

let tree: ReturnType<typeof create> | undefined;
const fab = () => tree!.root.find((n) => n.props.accessibilityLabel === 'Create invoice' && typeof n.props.onPress === 'function');
const resets = () => jest.mocked(flowStore().dispatch).mock.calls.filter(([action]) => (action as { type: string }).type === 'invoiceForm/resetForm').length;
const tap = () => act(async () => { fab().props.onPress(); });
const release = (index: number, allowed = true) => act(async () => { held[index].release(allowed); });

beforeEach(async () => {
  jest.clearAllMocks();
  held = [];
  resetScreenFocus();
  const store = newFlowStore('admin');
  jest.spyOn(store, 'dispatch');
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => { tree = create(<InvoicesTab />); });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('Invoices, new bill: only the latest tap goes on', () => {
  it.each([
    ['older answer first', [0, 1]],
    ['newer answer first', [1, 0]],
  ])('tap, focus lost and regained, tap again: step 1 is reset and pushed once (%s)', async (_name, order) => {
    await tap();
    expect(held).toHaveLength(1);
    await act(async () => { setScreenFocused(false); });
    await act(async () => { setScreenFocused(true); });
    await tap();
    expect(held).toHaveLength(2);

    for (const index of order) await release(index);

    expect(resets()).toBe(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/invoice-form/step1');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('an older request released while the screen is away does not go; the next tap does', async () => {
    await tap();
    await act(async () => { setScreenFocused(false); });
    await release(0);

    expect(resets()).toBe(0);
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();

    await act(async () => { setScreenFocused(true); });
    await tap();
    await release(1);
    expect(resets()).toBe(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('an older "refused" answer after a newer tap shows no alert', async () => {
    await tap();
    await act(async () => { setScreenFocused(false); });
    await act(async () => { setScreenFocused(true); });
    await tap();
    await release(0, false);
    expect(showAlert).not.toHaveBeenCalled();
    await release(1, true);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
