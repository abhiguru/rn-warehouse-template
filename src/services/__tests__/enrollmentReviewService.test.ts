import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  listPendingEnrollments,
  listEnrollmentCustomers,
  reviewEnrollment,
} from '../enrollmentReviewService';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const pending = [{ id: 'user-1', name: 'Pending Customer', display_name: null, mobile: '910000000002', created_at: '2026-09-26' }];
const customers = [{ id: 'customer-1', name: 'Existing Customer' }];
const rpc = jest.fn();
const from = jest.fn();

function query(data: unknown) {
  const result = { data, error: null };
  const chain: Record<string, jest.Mock> = {};
  for (const name of ['select', 'eq', 'order', 'range']) chain[name] = jest.fn(() => chain);
  chain.then = jest.fn(resolve => Promise.resolve(result).then(resolve));
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  from.mockImplementation(table => query(table === 'user_profiles' ? pending : customers));
  rpc.mockResolvedValue({ data: { success: true, data: { status: 'approved' } }, error: null });
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ from, rpc } as never);
});

it('loads only pending customer profiles and existing active customers', async () => {
  expect(await listPendingEnrollments()).toEqual(pending);
  expect(await listEnrollmentCustomers()).toEqual(customers);
  expect(from).toHaveBeenCalledWith('user_profiles');
  expect(from).toHaveBeenCalledWith('customers');
});

it('requires an assignment and passes the selected customer IDs to admin review', async () => {
  await expect(reviewEnrollment('user-1', 'approved')).rejects.toThrow('Select at least one');
  expect(rpc).not.toHaveBeenCalled();
  await reviewEnrollment('user-1', 'approved', ['customer-1']);
  expect(rpc).toHaveBeenCalledWith('operator_review_enrollment', {
    p_user_id: 'user-1', p_decision: 'approved', p_customer_ids: ['customer-1'],
  });
});

it('rejects an unsuccessful review response and sends no assignments with rejection', async () => {
  rpc.mockResolvedValueOnce({ data: { success: false }, error: null });
  await expect(reviewEnrollment('user-1', 'approved', ['customer-1'])).rejects.toThrow('not accepted');
  rpc.mockResolvedValueOnce({ data: { success: true, data: { status: 'rejected' } }, error: null });
  await reviewEnrollment('user-1', 'rejected', ['customer-1']);
  expect(rpc).toHaveBeenLastCalledWith('operator_review_enrollment', {
    p_user_id: 'user-1', p_decision: 'rejected', p_customer_ids: [],
  });
});
