/**
 * Admin User Service
 *
 * Handles all admin user management operations including:
 * - List users with filters/pagination
 * - Get user details with customer assignments
 * - Update user roles
 * - Update user active status
 *
 * Uses Supabase RPCs with proper authorization checks.
 * Only accessible to admin and supervisor roles.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  UserRole,
  UserListItem,
  UserDetails,
  UserFilters,
  UserListResponse,
  UserDetailsResponse,
  UpdateUserRoleResponse,
  UpdateUserStatusResponse,
  UserDetailsCustomer,
} from '@/types/user.types';
import { executeRPC, type RPCResult } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { isNetworkError, isStatementTimeout, isTimeoutError, requestMayHaveBeenSent, serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

// User ids and error codes only: names and mobile numbers stay out of the device log.
const log = createLogger('users');

// =============================================================================
// RAW RPC RESPONSE TYPES
// =============================================================================

/** Raw user data from RPC responses */
interface RpcUserRow {
  id: string;
  auth_user_id?: string;
  name?: string;
  display_name?: string | null;
  mobile?: string;
  role: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  assigned_customers_count?: number;
  is_service_account?: boolean;
  enrollment_status?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

/** Raw customer assignment from RPC responses */
interface RpcCustomerAssignment {
  customer_id: string;
  customer_name?: string;
  customer_mobile?: string | null;
  customer_city?: string | null;
  assigned_at?: string;
  assigned_by_name?: string | null;
  customer_active?: boolean;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

/** The server refuses to remove the warehouse's last administrator (backend migration 44). */
const LAST_ADMIN = 'LAST_ADMIN';

/** The server refuses role, status and delete changes on a service account such as the FAS sync (backend migration 78). */
const SERVICE_ACCOUNT_READ_ONLY = 'SERVICE_ACCOUNT_READ_ONLY';

/** Code of a refused answer: `error_code` first, then `error` which older answers use as the code. */
const refusalCode = (responseData: { error_code?: unknown; error?: unknown } | null | undefined): unknown =>
  responseData?.error_code ?? responseData?.error;

/**
 * Refusals about the target's access request (backend migration 47), by the code the
 * server names them with: a supervisor on a user whose access is not approved, and a
 * role change on a request nobody has reviewed yet.
 */
const enrollmentRefusal = (code: unknown): string | null =>
  code === 'ENROLLMENT_NOT_APPROVED'
    ? t('errors.user.enrollmentNotApproved')
    : code === 'ENROLLMENT_PENDING'
      ? t('errors.user.enrollmentPending')
      : code === 'ENROLLMENT_REJECTED'
        ? t('errors.user.enrollmentRejected')
        : null;

/**
 * Why a call failed, as the screens read it: 'NETWORK' or 'TIMEOUT' when no answer arrived,
 * otherwise the server's `error_code` (PERMISSION_DENIED, NOT_FOUND, SELF_EDIT_FORBIDDEN ...).
 * 'TIMEOUT' is no answer after the request went out (it timed out, the connection dropped, a gateway gave up):
 * a change may have been applied. 'NETWORK' is no answer because the request never left (offline, no session).
 * 'TIMEOUT_NOT_SAVED' is a statement the server cancelled (57014): it rolled back, nothing was saved.
 * 'NO_ACCESS' is the caller losing the right to manage users: the server words that as
 * "Staff access required", "Active account required" or "Administrator required".
 */
export type UserFailureCode = string;

const NO_ACCESS_TEXT = /\b(staff access|active account|administrator) required\b/i;

const failureCode = (source: unknown, code?: unknown, message?: unknown): UserFailureCode | undefined => {
  // 57014: the server cancelled the statement and rolled it back, so nothing was saved.
  if (isStatementTimeout(source)) return 'TIMEOUT_NOT_SAVED';
  if (isTimeoutError(source)) return 'TIMEOUT';
  if (isNetworkError(source)) return requestMayHaveBeenSent(source) ? 'TIMEOUT' : 'NETWORK';
  const text = typeof message === 'string' ? message : typeof source === 'string' ? source : '';
  if ((typeof code !== 'string' || code === 'INTERNAL_ERROR' || code === 'PERMISSION_DENIED') && NO_ACCESS_TEXT.test(text)) {
    return 'NO_ACCESS';
  }
  return typeof code === 'string' && code !== '' ? code : undefined;
};

/** The failure of an assign or remove: the server raises `CODE: text`, so the code is the prefix. */
const assignmentFailure = (result: RPCResult<boolean>): { success: false; error?: string; code?: UserFailureCode } => {
  const raw = result.error ?? '';
  const prefix = /^([A-Z][A-Z0-9_]{2,}):/.exec(raw)?.[1];
  const transport = failureCode({ errorCode: result.errorCode, message: raw });
  return {
    success: false,
    error: result.error,
    code: transport === 'NETWORK' || transport === 'TIMEOUT' || transport === 'TIMEOUT_NOT_SAVED' ? transport : (!prefix || prefix === 'PERMISSION_DENIED') && NO_ACCESS_TEXT.test(raw) ? 'NO_ACCESS' : prefix ?? (result.errorCode === '42501' ? 'PERMISSION_DENIED' : undefined),
  };
};

class AdminUserService {
  // ===========================================================================
  // LIST USERS
  // ===========================================================================

  /**
   * Get paginated list of users with optional filters
   * Supervisors cannot see admin users (filtered server-side)
   */
  async getUsersList(
    filters: UserFilters = {},
    limit: number = 20,
    offset: number = 0
  ): Promise<{ success: boolean; data?: UserListResponse; error?: string; code?: UserFailureCode }> {
    try {

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_users_list', {
        p_search_query: filters.search_query || '',
        p_role_filter: filters.roles || null,
        p_active_filter: filters.active ?? null,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        log.error('getUsersList error', loggableError(error));
        return {
          success: false,
          error: serverText(error, t('errors.user.fetchListFailed')),
          code: failureCode(error, (error as { code?: unknown }).code, (error as { message?: unknown }).message),
        };
      }

      // Handle response - could be object or array with single element
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData) {
        return {
          success: true,
          data: {
            users: [],
            pagination: {
              total_count: 0,
              limit,
              offset,
              has_more: false,
              total_with_deleted: 0,
            },
          },
        };
      }

      // Check if RPC returned an error response
      if (responseData.success === false || responseData.error) {
        log.error('get_users_list returned an error');
        return {
          success: false,
          error: serverText(responseData.message || responseData.error, t('errors.user.fetchListFailed')),
          code: failureCode(null, refusalCode(responseData), responseData.message),
        };
      }

      // Map response to typed structure
      const users: UserListItem[] = (responseData.users || []).map((user: RpcUserRow) => ({
        id: user.id,
        auth_user_id: user.auth_user_id,
        name: user.name || '',
        display_name: user.display_name || null,
        mobile: user.mobile || '',
        role: user.role as UserRole,
        active: user.active ?? true,
        created_at: user.created_at,
        updated_at: user.updated_at,
        assigned_customers_count: user.assigned_customers_count || 0,
        is_service_account: user.is_service_account ?? false,
        enrollment_status: user.enrollment_status === 'pending' || user.enrollment_status === 'rejected' ? user.enrollment_status : null,
        is_deleted: user.is_deleted ?? false,
        deleted_at: user.deleted_at ?? null,
      }));

      return {
        success: true,
        data: {
          users,
          pagination: responseData.pagination || {
            total_count: users.length,
            limit,
            offset,
            has_more: false,
            total_with_deleted: users.length,
          },
        },
      };
    } catch (error) {
      log.error('Exception in getUsersList', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown')),
        code: failureCode(error),
      };
    }
  }

  // ===========================================================================
  // GET USER DETAILS
  // ===========================================================================

  /**
   * Get single user details with customer assignments
   */
  async getUserDetails(
    userId: string
  ): Promise<{ success: boolean; data?: UserDetails; error?: string; code?: UserFailureCode }> {
    try {

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_user_details', {
        p_user_id: userId,
      });

      if (error) {
        log.error('getUserDetails error', loggableError(error));
        return {
          success: false,
          error: serverText(error, t('errors.user.fetchDetailsFailed')),
          code: failureCode(error, (error as { code?: unknown }).code, (error as { message?: unknown }).message),
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (responseData && responseData.success === false) {
        return {
          success: false,
          error: serverText(responseData.message || responseData.error, t('errors.user.fetchDetailsFailed')),
          code: failureCode(null, refusalCode(responseData), responseData.message),
        };
      }

      if (!responseData || !responseData.user) {
        return {
          success: false,
          error: t('errors.user.notFound'),
          code: 'NOT_FOUND',
        };
      }

      const user = responseData.user;
      const assignedCustomers: UserDetailsCustomer[] = (
        responseData.assigned_customers || []
      ).map((c: RpcCustomerAssignment) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name || '',
        customer_mobile: c.customer_mobile || null,
        customer_city: c.customer_city || null,
        assigned_at: c.assigned_at,
        assigned_by_name: c.assigned_by_name || null,
        customer_active: c.customer_active ?? true,
      }));

      return {
        success: true,
        data: {
          id: user.id,
          auth_user_id: user.auth_user_id,
          name: user.name || '',
          display_name: user.display_name || null,
          mobile: user.mobile || '',
          role: user.role as UserRole,
          active: user.active ?? true,
          created_at: user.created_at,
          updated_at: user.updated_at,
          assigned_customers_count: assignedCustomers.length,
          is_service_account: user.is_service_account ?? false,
          enrollment_status: user.enrollment_status === 'pending' || user.enrollment_status === 'rejected' ? user.enrollment_status : null,
          is_deleted: user.is_deleted ?? false,
          deleted_at: user.deleted_at ?? null,
          assigned_customers: assignedCustomers,
        },
      };
    } catch (error) {
      log.error('Exception in getUserDetails', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown')),
        code: failureCode(error),
      };
    }
  }

  // ===========================================================================
  // UPDATE USER ROLE
  // ===========================================================================

  /**
   * Update user role
   * Supervisors cannot promote to admin or modify admin users
   */
  async updateUserRole(
    userId: string,
    newRole: UserRole
  ): Promise<{ success: boolean; data?: UpdateUserRoleResponse; error?: string; code?: UserFailureCode }> {
    try {

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('update_user_role', {
        p_user_id: userId,
        p_new_role: newRole,
      });

      if (error) {
        log.error('updateUserRole error', loggableError(error));
        return {
          success: false,
          error: serverText(error, t('errors.user.updateUserRoleFailed'), { write: true }),
          code: failureCode(error, (error as { code?: unknown }).code, (error as { message?: unknown }).message),
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          // The server names this refusal by a code, not a sentence (migration 44).
          error: refusalCode(responseData) === LAST_ADMIN
            ? t('errors.user.lastAdminRole')
            : refusalCode(responseData) === SERVICE_ACCOUNT_READ_ONLY
              ? t('users.edit.serviceAccountReadOnly')
              : enrollmentRefusal(refusalCode(responseData)) ?? serverText(responseData?.message || responseData?.error, t('errors.user.updateRoleFailed'), { write: true }),
          code: failureCode(null, refusalCode(responseData), responseData?.message),
        };
      }

      return {
        success: true,
        data: {
          success: true,
          user_id: responseData.user_id,
          old_role: responseData.old_role as UserRole,
          new_role: responseData.new_role as UserRole,
          removed_customer_count: Number(responseData.removed_customer_count) || 0,
        },
      };
    } catch (error) {
      log.error('Exception in updateUserRole', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown'), { write: true }),
        code: failureCode(error),
      };
    }
  }

  // ===========================================================================
  // UPDATE USER STATUS
  // ===========================================================================

  /**
   * Toggle user active status
   * Supervisors cannot deactivate admin users
   * Users cannot deactivate themselves
   */
  async updateUserStatus(
    userId: string,
    active: boolean
  ): Promise<{ success: boolean; data?: UpdateUserStatusResponse; error?: string; code?: UserFailureCode }> {
    try {

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('update_user_status', {
        p_user_id: userId,
        p_active: active,
      });

      if (error) {
        log.error('updateUserStatus error', loggableError(error));
        return {
          success: false,
          error: serverText(error, t('errors.user.updateUserStatusFailed'), { write: true }),
          code: failureCode(error, (error as { code?: unknown }).code, (error as { message?: unknown }).message),
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          error: refusalCode(responseData) === LAST_ADMIN
            ? t('errors.user.lastAdminDeactivate')
            : refusalCode(responseData) === SERVICE_ACCOUNT_READ_ONLY
              ? t('users.edit.serviceAccountReadOnly')
              : enrollmentRefusal(refusalCode(responseData)) ?? serverText(responseData?.message || responseData?.error, t('errors.user.updateStatusFailed'), { write: true }),
          code: failureCode(null, refusalCode(responseData), responseData?.message),
        };
      }

      return {
        success: true,
        data: {
          success: true,
          user_id: responseData.user_id,
          active: responseData.active,
        },
      };
    } catch (error) {
      log.error('Exception in updateUserStatus', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown'), { write: true }),
        code: failureCode(error),
      };
    }
  }

  // ===========================================================================
  // REVIEW A REJECTED REQUEST AGAIN
  // ===========================================================================

  /**
   * Put a rejected access request back in Access requests as a Customer request (admin only).
   * Refusals: PERMISSION_DENIED, INVALID_INPUT, NOT_FOUND, ACCOUNT_DELETED,
   * SERVICE_ACCOUNT_READ_ONLY, NOT_REJECTED (someone already reviewed it).
   */
  async reviewEnrollmentAgain(
    userId: string
  ): Promise<{ success: boolean; error?: string; code?: UserFailureCode }> {
    try {
      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('review_enrollment_again', { p_user_id: userId });

      if (error) {
        log.error('reviewEnrollmentAgain error', loggableError(error));
        const rpcCode = (error as { code?: unknown }).code;
        return {
          success: false,
          error: serverText(error, t('errors.user.updateStatusFailed'), { write: true }),
          // 42501: the server raises it for a caller who is not an administrator.
          code: failureCode(error, rpcCode === '42501' ? 'PERMISSION_DENIED' : rpcCode, (error as { message?: unknown }).message),
        };
      }

      const responseData = Array.isArray(data) ? data[0] : data;
      if (!responseData || !responseData.success) {
        return {
          success: false,
          error: serverText(responseData?.message || responseData?.error, t('errors.user.updateStatusFailed'), { write: true }),
          code: failureCode(null, refusalCode(responseData), responseData?.message),
        };
      }
      return { success: true };
    } catch (error) {
      log.error('Exception in reviewEnrollmentAgain', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown'), { write: true }),
        code: failureCode(error),
      };
    }
  }

  // ===========================================================================
  // CUSTOMER ASSIGNMENT (using existing RPCs)
  // ===========================================================================

  /**
   * Assign a customer to a user
   * Uses existing assign_customer_to_user RPC
   * M3 Fix: Using executeRPC wrapper
   */
  async assignCustomerToUser(
    userMobile: string,
    customerId: string,
    comment?: string
  ): Promise<{ success: boolean; error?: string; code?: UserFailureCode }> {

    const result = await executeRPC<boolean>(
      getAuthenticatedClient,
      'assign_customer_to_user',
      {
        target_user_mobile: userMobile,
        target_customer_id: customerId,
        assigner_comment: comment || null,
      },
      {
        context: 'AdminUserService.assignCustomerToUser',
        write: true,
        errorMessage: t('errors.user.assignCustomerFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    return result.success && !!result.data ? { success: true } : assignmentFailure(result);
  }

  /**
   * Remove a customer assignment from a user
   * Uses existing remove_customer_assignment RPC
   * M3 Fix: Using executeRPC wrapper
   */
  async removeCustomerAssignment(
    userMobile: string,
    customerId: string
  ): Promise<{ success: boolean; error?: string; code?: UserFailureCode }> {

    const result = await executeRPC<boolean>(
      getAuthenticatedClient,
      'remove_customer_assignment',
      {
        target_user_mobile: userMobile,
        target_customer_id: customerId,
      },
      {
        context: 'AdminUserService.removeCustomerAssignment',
        write: true,
        errorMessage: t('errors.user.removeAssignmentFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    return result.success && !!result.data ? { success: true } : assignmentFailure(result);
  }
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const adminUserService = new AdminUserService();
