/**
 * WH-205 (card point 6, acceptance 6): the GST details screen has no "Registered for GST" choice, and saving with an empty
 * GSTIN is refused with the existing required-field text. The real screen and service run; only the server's reply is faked.
 * Fictional data only.
 */
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { makeInvoiceStore, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { t } from '@/i18n';
import GstDetailsScreen from '../../../app/gst-details';

let mockStore: InvoiceStore;
const mockRpc = jest.fn();

jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

const texts = (root: ReactTestInstance) => root.findAll((n) => n.type === 'Text').map((n) => [n.props.children].flat().join(''));

async function open(details: Record<string, unknown>) {
  mockStore = makeInvoiceStore({ role: 'admin' });
  mockRpc.mockImplementation(async (name: string) =>
    name === 'get_gst_details' ? { data: { success: true, ...details }, error: null } : { data: { success: true, saved: true }, error: null }
  );
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GstDetailsScreen />); });
  await act(async () => {});
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe.each([
  ['nothing saved yet', { saved: false, registered: false, gstin: '', address: '', bills_allowed: false }],
  ['saved as not registered', { saved: true, registered: false, gstin: '', address: '1 Example Road', bills_allowed: false }],
])('the GST details screen, %s', (_name, details) => {
  it('has no Registered for GST choice, and always shows the GSTIN field', async () => {
    const tree = await open(details);
    expect(texts(tree.root)).not.toContain('Registered for GST');
    expect(tree.root.findAll((n) => n.props.accessibilityRole === 'switch')).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'gst-details-gstin' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'gst-details-not-saved' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'gst-details-sac-storage' }).length).toBeGreaterThan(0);
  });

  it('refuses a save with an empty GSTIN with the required-field text, and sends nothing', async () => {
    const tree = await open(details);
    const address = tree.root.findAllByProps({ testID: 'gst-details-address' }).find((n) => typeof n.props.onChangeText === 'function')!;
    await act(async () => { address.props.onChangeText('1 Example Road'); });
    const save = tree.root.findAllByProps({ testID: 'gst-details-save' }).find((n) => typeof n.props.onPress === 'function')!;
    await act(async () => { save.props.onPress(); });

    expect(texts(tree.root)).toContain('Enter the GSTIN.');
    expect(texts(tree.root)).toContain(t('gst.settings.gstinRequired'));
    expect(mockRpc.mock.calls.filter(([name]) => name === 'set_gst_details')).toHaveLength(0);
  });
});

describe('saving the GST details', () => {
  it('sends registered: true with the GSTIN (there is no choice to send anything else)', async () => {
    const tree = await open({ saved: false, registered: false, gstin: '', address: '', bills_allowed: false });
    const set = (id: string, value: string) =>
      act(async () => { tree.root.findAllByProps({ testID: id }).find((n) => typeof n.props.onChangeText === 'function')!.props.onChangeText(value); });
    await set('gst-details-gstin', '24AAAAA0000A1Z5');
    await set('gst-details-address', '1 Example Road');
    const save = tree.root.findAllByProps({ testID: 'gst-details-save' }).find((n) => typeof n.props.onPress === 'function')!;
    await act(async () => { save.props.onPress(); });
    const dialog = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.visible === true && typeof n.props.onConfirm === 'function')[0];
    await act(async () => { dialog.props.onConfirm(); });

    const sent = mockRpc.mock.calls.filter(([name]) => name === 'set_gst_details');
    expect(sent).toHaveLength(1);
    expect(sent[0][1].p_details).toMatchObject({ registered: true, gstin: '24AAAAA0000A1Z5' });
  });
});
