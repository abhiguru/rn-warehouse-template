/**
 * check_grn_exists answers `{ success, data: { exists, grn_id, gr_no, customer_name, date } }`.
 * The fixtures below are that envelope, as the backend builds it.
 */
import { checkGrnExists } from '../grnFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('../imageUploadService', () => ({}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';

describe('checkGrnExists', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('reports an existing number from the response envelope', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        data: { exists: true, grn_id: GRN_ID, gr_no: 'A0010', customer_name: 'Fictional Traders', date: '2026-10-01T00:00:00+00:00' },
      },
      error: null,
    });

    const result = await checkGrnExists('a0010');

    expect(mockRpc).toHaveBeenCalledWith('check_grn_exists', { p_gr_no: 'A0010' });
    expect(result).toEqual({
      exists: true,
      grnId: GRN_ID,
      grNo: 'A0010',
      customerName: 'Fictional Traders',
      date: '2026-10-01T00:00:00+00:00',
    });
  });

  it('never returns form data: the check carries no items or photos', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { success: true, data: { exists: true, grn_id: GRN_ID, gr_no: 'A0010', customer_name: 'Fictional Traders', date: '2026-10-01' } },
      error: null,
    });

    expect(await checkGrnExists('A0010')).not.toHaveProperty('grnData');
  });

  it('reports a free number', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true, data: { exists: false } }, error: null });

    expect(await checkGrnExists('A0011')).toEqual({ exists: false });
  });

  it('tells a refused or failed check apart from a free number', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'Staff access required' }, error: null });
    expect(await checkGrnExists('A0012')).toEqual(expect.objectContaining({ exists: false, error: true }));

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    expect(await checkGrnExists('A0012')).toEqual(expect.objectContaining({ exists: false, error: true }));
  });

  it('does not ask the server about a number shorter than five characters', async () => {
    expect(await checkGrnExists('A001')).toEqual({ exists: false });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
