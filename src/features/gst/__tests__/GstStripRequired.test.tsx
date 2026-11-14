/**
 * WH-205: the Home strip for administrators says bills can't be made until the GST details are added; it reads data.bills_allowed (contract section 3).
 * The real strip, hook and service run; only the server's reply to get_gst_details is faked. Fictional data only.
 */
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
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

const textsOf = (root: ReactTestInstance) =>
  root.findAll((n) => (n.type as unknown) === 'Text' || (typeof n.type === 'string' && n.type === 'Text')).map((n) => [n.props.children].flat().join(''));

async function show(role: string, saved: boolean, extra: Record<string, unknown> = {}) {
  mockStore = makeInvoiceStore({ role });
  mockRpc.mockResolvedValue({ data: { success: true, saved, ...extra }, error: null });
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<GstStrip />);
  });
  await act(async () => {});
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the Home strip (WH-205)', () => {
  it('tells an administrator that bills can\'t be made until the GST details are added, with Add', async () => {
    const tree = await show('admin', false, { bills_allowed: false });
    const strip = tree.root.findByProps({ testID: 'gst-strip' });
    expect(textsOf(strip)).toContain("Add your GST details. Bills can't be made until then.");
    expect(textsOf(strip)).toContain('Add');
    expect(textsOf(strip)).not.toContain('Add your GST details so bills print correctly.');
    await act(async () => {
      tree.root.findByProps({ testID: 'gst-strip-add' }).props.onPress();
    });
    expect(router.push).toHaveBeenCalledWith('/gst-details');
  });

  it('shows nothing once the details are saved', async () => {
    const tree = await show('admin', true, { registered: true, gstin: '24AAAAA0000A1Z5', bills_allowed: true });
    expect(tree.root.findAllByProps({ testID: 'gst-strip' })).toHaveLength(0);
  });

  it('shows for a store saved as not registered: that counts as no GST details (card point 7)', async () => {
    const tree = await show('admin', true, { registered: false, gstin: '', bills_allowed: false });
    const strip = tree.root.findByProps({ testID: 'gst-strip' });
    expect(textsOf(strip)).toContain("Add your GST details. Bills can't be made until then.");
  });

  it('does not show for a store saved as registered with a GSTIN', async () => {
    const tree = await show('admin', true, { registered: true, gstin: '24AAAAA0000A1Z5', bills_allowed: true });
    expect(tree.root.findAllByProps({ testID: 'gst-strip' })).toHaveLength(0);
  });
});
