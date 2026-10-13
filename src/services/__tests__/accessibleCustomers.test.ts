/**
 * SR-08: the own-profile read turned a failed customer-access lookup into an empty
 * list, so the screen said "No customers assigned yet. Ask an administrator…" when
 * the read had only failed. getAccessibleCustomers keeps the two apart, and
 * getUserById passes the status on while the profile itself still loads.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { UserService } from '../user-service';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/utils/serviceErrorHandler', () => ({
  ...jest.requireActual('@/utils/serviceErrorHandler'),
  handleGlobalAuthError: jest.fn(),
}));

const PROFILE = { id: 'profile-1', auth_user_id: 'auth-1', name: 'Asha Example', role: 'staff', active: true };
const CUSTOMER = { id: 'customer-1', name: 'Fictional Traders', mobile: '9000000001', city: 'Rajkot', active: true };
const transportError = { message: 'TypeError: Network request failed', code: '' };

type Outcome = 'populated' | 'empty' | 'rpc' | 'details';

/** A client whose RPC and customers read answer as `outcome` says. */
function clientFor(outcome: Outcome) {
  const rpc = jest.fn(async (name: string) => {
    expect(name).toBe('user_accessible_customers');
    if (outcome === 'rpc') return { data: null, error: transportError };
    return { data: outcome === 'empty' ? [] : [CUSTOMER.id], error: null };
  });
  const customersIn = jest.fn(async () =>
    outcome === 'details' ? { data: null, error: transportError } : { data: [CUSTOMER], error: null }
  );
  const from = jest.fn((table: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: table === 'user_profiles' ? PROFILE : null, error: null }) }),
      in: customersIn,
    }),
  }));
  const client = { rpc, from };
  jest.mocked(getAuthenticatedClient).mockResolvedValue(client as never);
  return { client, rpc, customersIn };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('getAccessibleCustomers', () => {
  it('loaded with the customers when both reads answer', async () => {
    clientFor('populated');
    const result = await UserService.getAccessibleCustomers();
    expect(result).toEqual({ status: 'loaded', customers: [CUSTOMER] });
  });

  it('loaded and empty when the RPC answers with no customers, without a second read', async () => {
    const { customersIn } = clientFor('empty');
    expect(await UserService.getAccessibleCustomers()).toEqual({ status: 'loaded', customers: [] });
    expect(customersIn).not.toHaveBeenCalled();
  });

  it('failed when the RPC fails, and the error is offered to the sign-out check', async () => {
    clientFor('rpc');
    expect(await UserService.getAccessibleCustomers()).toEqual({ status: 'failed', customers: [] });
    expect(handleGlobalAuthError).toHaveBeenCalledWith(transportError);
  });

  it('failed when the customers read fails', async () => {
    clientFor('details');
    expect(await UserService.getAccessibleCustomers()).toEqual({ status: 'failed', customers: [] });
    expect(handleGlobalAuthError).toHaveBeenCalledWith(transportError);
  });

  it('failed when no client can be had', async () => {
    jest.mocked(getAuthenticatedClient).mockRejectedValue(new Error('Session changed'));
    expect(await UserService.getAccessibleCustomers()).toEqual({ status: 'failed', customers: [] });
  });

  it('uses the client it is given', async () => {
    const { client } = clientFor('populated');
    jest.mocked(getAuthenticatedClient).mockClear();
    await UserService.getAccessibleCustomers(client as never);
    expect(getAuthenticatedClient).not.toHaveBeenCalled();
  });
});

describe('getUserById', () => {
  it.each([
    ['populated', 'loaded', 1],
    ['empty', 'loaded', 0],
    ['rpc', 'failed', 0],
    ['details', 'failed', 0],
  ] as const)('%s: the profile loads and the customer access is %s', async (outcome, status, count) => {
    clientFor(outcome);
    const result = await UserService.getUserById(PROFILE.id);
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Asha Example');
    expect(result.data?.role).toBe('staff');
    expect(result.data?.assignedCustomers).toHaveLength(count);
    expect(result.data?.assignedCustomersStatus).toBe(status);
  });
});
