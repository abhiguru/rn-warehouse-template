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
import { executeRPC } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
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
}

/** Raw customer assignment from RPC responses */
interface RpcCustomerAssignment {
  customer_id: string;
  customer_name?: string;
  customer_mobile?: string | null;
  customer_city?: string | null;
  assigned_at?: string;
  assigned_by_name?: string | null;
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
      : null;

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
  ): Promise<{ success: boolean; data?: UserListResponse; error?: string }> {
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
          },
        },
      };
    } catch (error) {
      log.error('Exception in getUsersList', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown')),
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
  ): Promise<{ success: boolean; data?: UserDetails; error?: string }> {
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
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.user) {
        return {
          success: false,
          error: t('errors.user.notFound'),
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
          assigned_customers: assignedCustomers,
        },
      };
    } catch (error) {
      log.error('Exception in getUserDetails', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown')),
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
  ): Promise<{ success: boolean; data?: UpdateUserRoleResponse; error?: string }> {
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
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          // The server names this refusal by a code, not a sentence (migration 44).
          error: responseData?.error === LAST_ADMIN
            ? t('errors.user.lastAdminRole')
            : refusalCode(responseData) === SERVICE_ACCOUNT_READ_ONLY
              ? t('users.edit.serviceAccountReadOnly')
              : enrollmentRefusal(responseData?.error) ?? serverText(responseData?.error, t('errors.user.updateRoleFailed'), { write: true }),
        };
      }

      return {
        success: true,
        data: {
          success: true,
          user_id: responseData.user_id,
          old_role: responseData.old_role as UserRole,
          new_role: responseData.new_role as UserRole,
        },
      };
    } catch (error) {
      log.error('Exception in updateUserRole', loggableError(error));
      return {
        success: false,
        error: serverText(error, t('errors.general.unknown'), { write: true }),
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
  ): Promise<{ success: boolean; data?: UpdateUserStatusResponse; error?: string }> {
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
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          error: responseData?.error === LAST_ADMIN
            ? t('errors.user.lastAdminDeactivate')
            : refusalCode(responseData) === SERVICE_ACCOUNT_READ_ONLY
              ? t('users.edit.serviceAccountReadOnly')
              : enrollmentRefusal(responseData?.error) ?? serverText(responseData?.error, t('errors.user.updateStatusFailed'), { write: true }),
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
  ): Promise<{ success: boolean; error?: string }> {

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

    return {
      success: result.success && !!result.data,
      error: result.error,
    };
  }

  /**
   * Remove a customer assignment from a user
   * Uses existing remove_customer_assignment RPC
   * M3 Fix: Using executeRPC wrapper
   */
  async removeCustomerAssignment(
    userMobile: string,
    customerId: string
  ): Promise<{ success: boolean; error?: string }> {

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

    return {
      success: result.success && !!result.data,
      error: result.error,
    };
  }
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const adminUserService = new AdminUserService();
