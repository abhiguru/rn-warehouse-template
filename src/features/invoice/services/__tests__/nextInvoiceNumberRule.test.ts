/**
 * The next invoice number under the facility's numbering rule (WS-8, backend migration 127): the rule answers for the
 * financial year of the form; an older backend keeps `get_next_invoice_number` (nextInvoiceNumber.test.ts).
 */
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { getNextInvoiceNumber } from '../invoiceFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
const mockServer = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));

beforeEach(() => {
  mockRpc.mockReset();
  resetFacilityRelease();
  setFacilityRelease(mockServer, { schemaHead: '00000000000127_document_numbering' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('asks suggest_document_number for 1 April of the financial year and reads the whole number', async () => {
  mockRpc.mockResolvedValue({ data: { success: true, number: '1214', hint: '#', scheme: 'sequence', reason: null }, error: null });
  const result = await getNextInvoiceNumber('2027-28');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('suggest_document_number', { p_document_type: 'invoice', p_date: '2027-04-01' });
  expect(result).toEqual({ success: true, data: { next_invoice_number: 1214, financial_year: '2027-28' } });
});

it('is a failure (the form asks for the number to be typed) when the rule has no number left', async () => {
  mockRpc.mockResolvedValue({ data: { success: true, number: null, hint: '#', scheme: 'year', reason: 'SERIES_FULL' }, error: null });
  const result = await getNextInvoiceNumber('2026-27');
  expect(result.success).toBe(false);
});

it('keeps the earlier function on a backend older than migration 127', async () => {
  resetFacilityRelease();
  setFacilityRelease(mockServer, { schemaHead: '00000000000126_sessions_and_source_limits' });
  mockRpc.mockResolvedValue({ data: '55', error: null });
  const result = await getNextInvoiceNumber('2026-27');
  expect(mockRpc).toHaveBeenCalledWith('get_next_invoice_number', { p_fin_year: 2026 });
  expect(result.data.next_invoice_number).toBe(55);
});
