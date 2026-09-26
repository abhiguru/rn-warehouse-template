import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';

export type PendingEnrollment = {
  id: string;
  name: string;
  display_name: string | null;
  mobile: string;
  created_at: string;
};

export type EnrollmentCustomer = { id: string; name: string };

function unchanged(generation: number) {
  if (generation !== getSessionGeneration()) throw new Error('Session changed');
}

export async function listPendingEnrollments(): Promise<PendingEnrollment[]> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.from('user_profiles')
    .select('id,name,display_name,mobile,created_at')
    .eq('role', 'customer')
    .eq('enrollment_status', 'pending')
    .order('created_at', { ascending: true });
  unchanged(generation);
  if (error) throw new Error(error.message);
  return (data || []) as PendingEnrollment[];
}

export async function listEnrollmentCustomers(): Promise<EnrollmentCustomer[]> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const customers: EnrollmentCustomer[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await client.from('customers')
      .select('id,name')
      .eq('active', true)
      .order('name', { ascending: true })
      .range(offset, offset + 199);
    unchanged(generation);
    if (error) throw new Error(error.message);
    const page = (data || []) as EnrollmentCustomer[];
    customers.push(...page);
    if (page.length < 200) break;
  }
  return customers;
}

export async function reviewEnrollment(
  userId: string,
  decision: 'approved' | 'rejected',
  customerIds: string[] = []
): Promise<void> {
  if (decision === 'approved' && customerIds.length === 0)
    throw new Error('Select at least one existing customer.');
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('operator_review_enrollment', {
    p_user_id: userId,
    p_decision: decision,
    p_customer_ids: decision === 'approved' ? customerIds : [],
  });
  unchanged(generation);
  if (error) throw new Error(error.message);
  if (data?.success !== true || data?.data?.status !== decision)
    throw new Error('Enrollment review was not accepted.');
}
