/**
 * check_dispatch_exists answers
 * `{ success, data: { exists, dispatch_id, disp_no, customer_name, date } }`.
 */
import { checkDispatchExists } from '../dispatchFormService';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getAuthenticatedClient: async () => ({ rpc: mockRpc }),
}));
jest.mock('../dispatchImageService', () => ({ uploadDeferredDispatchImages: jest.fn() }));

const DISPATCH_ID = '22222222-3333-4444-8555-666666666666';

describe('checkDispatchExists', () => {
  beforeEach(() => mockRpc.mockReset());

  it('reports an existing number from the response envelope', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        data: { exists: true, dispatch_id: DISPATCH_ID, disp_no: 'DD0003', customer_name: 'Fictional Traders', date: '2026-10-02T00:00:00+00:00' },
      },
      error: null,
    });

    const result = await checkDispatchExists('dd0003');

    expect(mockRpc).toHaveBeenCalledWith('check_dispatch_exists', { p_disp_no: 'DD0003' });
    expect(result).toEqual({
      exists: true,
      dispatchId: DISPATCH_ID,
      dispNo: 'DD0003',
      customerName: 'Fictional Traders',
      date: '2026-10-02T00:00:00+00:00',
    });
    expect(result).not.toHaveProperty('dispatchData');
  });

  it('reports a free number', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true, data: { exists: false } }, error: null });

    expect(await checkDispatchExists('DD0004')).toEqual({ exists: false });
  });

  it('tells a refused or failed check apart from a free number', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, message: 'Staff access required' }, error: null });
    expect(await checkDispatchExists('DD0005')).toEqual({ exists: false, error: true });

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed', code: '08006' } });
    expect(await checkDispatchExists('DD0005')).toEqual({ exists: false, error: true });
  });
});
