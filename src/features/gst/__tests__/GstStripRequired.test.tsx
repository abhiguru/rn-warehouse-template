/**
 * WH-205: the Home strip for administrators says bills can't be made until the GST details are added; it reads data.bills_allowed (contract section 3).
 * The real strip, hook and service run; only the server's reply to get_gst_details is faked. Fictional data only.
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { makeInvoiceStore, storeHooks, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { GstStrip } from '../GstStrip';

let mockStore: InvoiceStore;
const mockRpc = jest.fn();

jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@/config/backendFeatures', () => ({ ...jest.requireActual('@/config/backendFeatures'), backendHasFeature: () => true }));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

void storeHooks;

const REQUIRED = "Add your GST details. Bills can't be made until then.";

async function show(role: string, saved: boolean, extra: Record<string, unknown> = {}) {
  mockStore = makeInvoiceStore({ role });
  mockRpc.mockResolvedValue({ data: { success: true, saved, ...extra }, error: null });
  await render(<GstStrip />);
  // The strip is drawn once the answer of get_gst_details has been read.
  await waitFor(() => expect(mockRpc).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the Home strip (WH-205)', () => {
  it('tells an administrator that bills can\'t be made until the GST details are added, with Add', async () => {
    await show('admin', false, { bills_allowed: false });
    expect(screen.getByText(REQUIRED)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add' })).toBeOnTheScreen();
    expect(screen.queryByText('Add your GST details so bills print correctly.')).not.toBeOnTheScreen();
    await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Add' }));
    expect(router.push).toHaveBeenCalledWith('/gst-details');
  });

  it('shows nothing once the details are saved', async () => {
    await show('admin', true, { registered: true, gstin: '24AAAAA0000A1Z5', bills_allowed: true });
    expect(screen.queryByText(REQUIRED)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeOnTheScreen();
  });

  it('shows for a store saved as not registered: that counts as no GST details (card point 7)', async () => {
    await show('admin', true, { registered: false, gstin: '', bills_allowed: false });
    expect(screen.getByText(REQUIRED)).toBeOnTheScreen();
  });

  it('does not show for a store saved as registered with a GSTIN', async () => {
    await show('admin', true, { registered: true, gstin: '24AAAAA0000A1Z5', bills_allowed: true });
    expect(screen.queryByText(REQUIRED)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeOnTheScreen();
  });
});
