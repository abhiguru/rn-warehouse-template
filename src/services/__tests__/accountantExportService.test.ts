/**
 * WH-158 (contract sections 3 and 7): src/services/accountantExportService.ts: getAccountantLedgers and setAccountantLedgers call
 * get_accountant_ledgers and set_accountant_ledgers (migration 203). The real service runs, with only the server's reply faked.
 * Written BEFORE the build: fails today because the module does not exist.
 */
import { getAccountantLedgers, setAccountantLedgers } from '../accountantExportService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ origin: 'https://one.example.test', instanceId: 'instance-0001' }) }));

const DEFAULTS = {
  storage_taxable: 'Cold Storage Rent', storage_exempt: 'Cold Storage Rent (Exempt)', labour: 'Labour Charges', cgst: 'CGST', sgst: 'SGST', igst: 'IGST',
  discount: 'Discount Allowed', round_off: 'Round Off', receipt_cash: 'Cash', receipt_upi: 'Bank', receipt_bank_transfer: 'Bank', receipt_cheque: 'Bank', receipt_other: 'Bank',
};
beforeEach(() => {
  mockRpc.mockReset();
  ['log', 'warn', 'error'].forEach(method => jest.spyOn(console, method as 'log').mockImplementation(() => {}));
});
afterEach(() => jest.restoreAllMocks());

it('get_accountant_ledgers is called with no arguments and its names come back', async () => {
  mockRpc.mockResolvedValue({ data: { success: true, data: { ledgers: DEFAULTS, defaults: DEFAULTS, saved: false } }, error: null });
  const result = await getAccountantLedgers();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls[0][0]).toBe('get_accountant_ledgers');
  expect(JSON.stringify(result)).toContain('Cold Storage Rent (Exempt)');
});

it('set_accountant_ledgers is called with the 13 names as p_ledgers, as given', async () => {
  const names = { ...DEFAULTS, labour: 'Labour X' };
  mockRpc.mockResolvedValue({ data: { success: true, data: { ledgers: names, defaults: DEFAULTS, saved: true, changed: true } }, error: null });
  await setAccountantLedgers(names as never);
  expect(mockRpc).toHaveBeenCalledWith('set_accountant_ledgers', { p_ledgers: names });
});
