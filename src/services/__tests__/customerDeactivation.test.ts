import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { customerService } from '../customer-service';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getSupabaseClient: jest.fn(),
  getSessionIdentity: jest.fn(async () => null),
}));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

const CUSTOMER = '11111111-2222-4333-8444-555555555555';

/** A client whose RPC fails with `error` and whose table writes would succeed. */
function clientFailingWith(error: { code?: string; message: string }) {
  const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }));
  const from = jest.fn(() => ({ update }));
  const rpc = jest.fn(async () => ({ data: null, error }));
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc, from });
  return { rpc, from, update };
}

const RPC_ERRORS = [
  { code: 'PGRST202', message: 'Could not find the function public.safe_delete_customer(p_customer_id, p_permanent) in the schema cache' },
  { code: '42501', message: 'permission denied for function safe_delete_customer' },
  { code: '42883', message: 'function public.safe_delete_customer(uuid, boolean) does not exist' },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('deactivating a customer', () => {
  it.each(RPC_ERRORS)('reports the failure and never writes the customers table ($code)', async (error) => {
    const { from } = clientFailingWith(error);

    const result = await customerService.inactivateCustomer(CUSTOMER);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('passes on the server refusal for a customer that still holds stock', async () => {
    const rpc = jest.fn(async () => ({
      data: { success: false, message: 'Customer has 3 item(s) with active stock' },
      error: null,
    }));
    const from = jest.fn();
    (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc, from });

    const result = await customerService.inactivateCustomer(CUSTOMER);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('safe_delete_customer', { p_customer_id: CUSTOMER, p_permanent: false });
  });
});

describe('restoring a customer', () => {
  it.each(RPC_ERRORS)('reports the failure and never writes the customers table ($code)', async (error) => {
    const { from } = clientFailingWith(error);

    const result = await customerService.restoreCustomer(CUSTOMER);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
