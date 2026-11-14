/**
 * WH-158 (contract section 7, criterion 11): Settings > Warehouse tools > Accountant export: the 13 ledger names, in the contract's order,
 * each at most 60 characters, an empty one refused before saving, Save sends all 13. The real screen runs with the real service; only the
 * server's reply (rpc) is faked. Written BEFORE the build: fails today because app/accountant-export.tsx does not exist.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AccountantExportScreen from '../../../app/accountant-export';
import { setLanguage, t } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, []); },
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

const KEYS = ['storage_taxable', 'storage_exempt', 'labour', 'cgst', 'sgst', 'igst', 'discount', 'round_off', 'receipt_cash', 'receipt_upi', 'receipt_bank_transfer', 'receipt_cheque', 'receipt_other'];
const LABELS = ['Storage rent (taxable)', 'Storage rent (exempt)', 'Labour', 'CGST', 'SGST', 'IGST', 'Discount', 'Round-off', 'Cash', 'UPI', 'Bank transfer', 'Cheque', 'Other receipts'];
const DEFAULTS: Record<string, string> = {
  storage_taxable: 'Cold Storage Rent', storage_exempt: 'Cold Storage Rent (Exempt)', labour: 'Labour Charges', cgst: 'CGST', sgst: 'SGST', igst: 'IGST',
  discount: 'Discount Allowed', round_off: 'Round Off', receipt_cash: 'Cash', receipt_upi: 'Bank', receipt_bank_transfer: 'Bank', receipt_cheque: 'Bank', receipt_other: 'Bank',
};

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  setLanguage('en');
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string, args?: { p_ledgers?: Record<string, string> }) => {
    if (name === 'get_accountant_ledgers') return { data: { success: true, data: { ledgers: DEFAULTS, defaults: DEFAULTS, saved: false } }, error: null };
    if (name === 'set_accountant_ledgers') return { data: { success: true, data: { ledgers: args!.p_ledgers, defaults: DEFAULTS, saved: true, changed: true } }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  ['log', 'info', 'warn', 'error', 'debug'].forEach(m => jest.spyOn(console, m as 'log').mockImplementation(() => {}));
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

async function render() { await act(async () => { tree = create(<AccountantExportScreen />); }); await act(async () => {}); }
const field = (key: string) => tree!.root.find(n => n.props.testID === `accountant-export-${key}` && typeof n.props.onChangeText === 'function');
const type = async (key: string, value: string) => { await act(async () => { field(key).props.onChangeText(value); }); };
const save = async () => { await act(async () => { tree!.root.find(n => n.props.testID === 'accountant-export-save' && typeof n.props.onPress === 'function').props.onPress(); }); await act(async () => {}); };
const texts = () => tree!.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat(Infinity).join(''));

it('[crit 11] loads the names with get_accountant_ledgers and shows the help line and 13 fields in the contract\'s order, each at most 60 characters', async () => {
  await render();
  expect(mockRpc.mock.calls[0][0]).toBe('get_accountant_ledgers');
  expect(texts()).toContain('The ledger names your accountant uses in Tally.');
  const fields = tree!.root.findAll(n => /^accountant-export-(?!save$|error$)/.test(String(n.props.testID ?? '')) && typeof n.props.onChangeText === 'function');
  expect(fields.map(n => n.props.testID)).toEqual(KEYS.map(k => `accountant-export-${k}`));
  KEYS.forEach((key, i) => {
    expect(field(key).props.value).toBe(DEFAULTS[key]);
    expect(field(key).props.maxLength).toBe(60);
    expect(texts()).toContain(LABELS[i]);
  });
  expect(tree!.root.findAll(n => n.props.testID === 'accountant-export-save').length).toBeGreaterThan(0);
});

it('[crit 11] Save sends all 13 names with the change (set_accountant_ledgers, p_ledgers)', async () => {
  await render();
  await type('labour', 'Labour X');
  await save();
  const call = mockRpc.mock.calls.find(([name]) => name === 'set_accountant_ledgers');
  expect(call).toBeDefined();
  expect(call![1]).toEqual({ p_ledgers: { ...DEFAULTS, labour: 'Labour X' } });
  expect(field('labour').props.value).toBe('Labour X');
});

it('an empty name is refused before saving, with the existing required-field text; nothing is sent', async () => {
  await render();
  await type('cgst', '   ');
  await save();
  expect(mockRpc.mock.calls.some(([name]) => name === 'set_accountant_ledgers')).toBe(false);
  expect(texts()).toContain(t('validation.required', { field: 'CGST' }));
});

it('a refusal from the server is shown at accountant-export-error and the typed names stay', async () => {
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_accountant_ledgers') return { data: { success: true, data: { ledgers: DEFAULTS, defaults: DEFAULTS, saved: false } }, error: null };
    return { data: { success: false, error_code: 'WH409', reason: 'LEDGER_NAME_TOO_LONG', error: 'A ledger name has at most 60 characters.', field: 'labour' }, error: null };
  });
  await render();
  await type('labour', 'Labour X');
  await save();
  expect(tree!.root.findAll(n => n.props.testID === 'accountant-export-error').length).toBeGreaterThan(0);
  expect(field('labour').props.value).toBe('Labour X');
});

it('[crit 12] in Gujarati the title, help line and labels are the spec\'s Gujarati drafts', async () => {
  setLanguage('gu');
  await render();
  expect(texts()).toContain('તમારા હિસાબનીશ ટેલીમાં જે ખાતાના નામ વાપરે છે તે.');
  expect(texts()).toContain(t('settings.accountantExport.fields.labour'));
  expect(t('settings.accountantExport.fields.labour')).toMatch(/[઀-૿]/);
});
