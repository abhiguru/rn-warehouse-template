import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { serverText } from '@/utils/serverText';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { UserService } from '@/services/user-service';

export type PendingEnrollment = {
  id: string;
  name: string;
  display_name: string | null;
  mobile: string;
  created_at: string;
};

export type EnrollmentCustomer = { id: string; name: string };

function unchanged(generation: number) {
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
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

/** How many requests wait: a head count of the pending rows (no rows are sent), for the Settings row. */
export async function countPendingEnrollments(): Promise<number> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { count, error } = await client.from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'customer')
    .eq('enrollment_status', 'pending');
  unchanged(generation);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Whether the facility has at least one active customer: a one-row read, not a scan of every customer. */
export async function hasEnrollmentCustomers(): Promise<boolean> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.from('customers')
    .select('id')
    .eq('active', true)
    .limit(1);
  unchanged(generation);
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

/**
 * The newest active customer this administrator created (audit column created_by is the
 * administrator's profile id), or null when there is none. Read before and after Add customer,
 * so the screen can tell that one was made.
 */
export async function newestOwnCustomer(profileId: string): Promise<EnrollmentCustomer | null> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.from('customers')
    .select('id,name,created_at')
    .eq('created_by', profileId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  unchanged(generation);
  if (error) throw new Error(error.message);
  const row = (data || [])[0] as { id: string; name: string } | undefined;
  return row ? { id: row.id, name: row.name } : null;
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

/** Who an approved person becomes: a customer of the chosen customers, or warehouse staff or a supervisor. */
export type EnrollmentRole = 'customer' | 'staff' | 'supervisor';

/**
 * Approve or reject a request. A customer needs at least one customer to see;
 * staff and supervisors see every customer and are sent none (server contract:
 * operator_review_enrollment(p_user_id, p_decision, p_customer_ids, p_role)).
 */
export async function reviewEnrollment(
  userId: string,
  decision: 'approved' | 'rejected',
  customerIds: string[] = [],
  role: EnrollmentRole = 'customer'
): Promise<void> {
  if (decision === 'approved' && role === 'customer' && customerIds.length === 0)
    throw new Error(t('errors.user.selectExistingCustomer'));
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('operator_review_enrollment', {
    p_user_id: userId,
    p_decision: decision,
    p_customer_ids: decision === 'approved' && role === 'customer' ? customerIds : [],
    // p_role is new (migration 77) and defaults to 'customer': a customer approval and a rejection
    // leave it out, so they keep working on a facility that has not upgraded.
    ...(decision === 'approved' && role !== 'customer' ? { p_role: role } : {}),
  });
  unchanged(generation);
  if (error) {
    handleGlobalAuthError(error);
    // A staff or supervisor approval needs the new argument: an older facility has no such function.
    if (error.code === 'PGRST202') throw new AppError('REFUSED', t('errors.user.enrollmentServerNeedsUpdate'));
    // Only an answer from the database is the server saying no (INVALID_ROLE ...). A timeout, a gateway
    // page or a changed session leaves open whether the decision was saved.
    if (UserService.isDatabaseAnswer(error)) throw new AppError('REFUSED', serverText(error.message, t('errors.user.enrollmentReviewNotAccepted'), { write: true }));
    throw new Error(error.message);
  }
  // The request was decided meanwhile (by another administrator): say so, the screen reloads.
  if (data?.success === false && data?.code === 'unknown_user')
    throw new AppError('REFUSED', t('errors.user.enrollmentAlreadyHandled'));
  if (data?.success !== true || data?.data?.status !== decision)
    throw new AppError('REFUSED', serverText(data?.message, t('errors.user.enrollmentReviewNotAccepted'), { write: true }));
}
