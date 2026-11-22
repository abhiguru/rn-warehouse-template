/**
 * WH-205 (card point 6, acceptance 6): the GST details screen has no "Registered for GST" choice, and saving with an empty
 * GSTIN is refused with the existing required-field text. The real screen and service run; only the server's reply is faked.
 * Fictional data only.
 */
import React from 'react';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
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
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

// A negative check must also see a Text that is mounted but hidden.
const texts = (hidden = false) => screen.queryAllByText(/^/, { includeHiddenElements: hidden }).map((n) => [n.props.children].flat().join(''));

async function open(details: Record<string, unknown>) {
  mockStore = makeInvoiceStore({ role: 'admin' });
  mockRpc.mockImplementation(async (name: string) =>
    name === 'get_gst_details' ? { data: { success: true, ...details }, error: null } : { data: { success: true, saved: true }, error: null }
  );
  await render(<GstDetailsScreen />);
  // The saved details are in once the GSTIN box is drawn (the screen shows a loading state first).
  await screen.findByTestId('gst-details-gstin');
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
    await open(details);
    expect(texts(true)).not.toContain('Registered for GST');
    expect(screen.queryAllByRole('switch', { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.getByTestId('gst-details-gstin')).toBeOnTheScreen();
    expect(screen.getByTestId('gst-details-not-saved')).toBeOnTheScreen();
    expect(screen.getByTestId('gst-details-sac-storage')).toBeOnTheScreen();
  });

  it('refuses a save with an empty GSTIN with the required-field text, and sends nothing', async () => {
    await open(details);
    const user = userEvent.setup({ delay: 0 });
    await user.type(screen.getByTestId('gst-details-address'), '1 Example Road');
    await user.press(screen.getByTestId('gst-details-save'));

    expect(texts()).toContain('Enter the GSTIN.');
    expect(texts()).toContain(t('gst.settings.gstinRequired'));
    expect(mockRpc.mock.calls.filter(([name]) => name === 'set_gst_details')).toHaveLength(0);
  });
});

describe('saving the GST details', () => {
  it('sends registered: true with the GSTIN (there is no choice to send anything else)', async () => {
    await open({ saved: false, registered: false, gstin: '', address: '', bills_allowed: false });
    const user = userEvent.setup({ delay: 0 });
    await user.type(screen.getByTestId('gst-details-gstin'), '24AAAAA0000A1Z5');
    await user.type(screen.getByTestId('gst-details-address'), '1 Example Road');
    await user.press(screen.getByTestId('gst-details-save'));
    await user.press(await screen.findByRole('button', { name: t('gst.settings.confirm') }));
    await waitFor(() => expect(mockRpc.mock.calls.filter(([name]) => name === 'set_gst_details')).toHaveLength(1));

    const sent = mockRpc.mock.calls.filter(([name]) => name === 'set_gst_details');
    expect(sent).toHaveLength(1);
    expect(sent[0][1].p_details).toMatchObject({ registered: true, gstin: '24AAAAA0000A1Z5' });
  });
});
