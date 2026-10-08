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
      console.log('[AdminUserService] getUsersList:', { filters, limit, offset });

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_users_list', {
        p_search_query: filters.search_query || '',
        p_role_filter: filters.roles || null,
        p_active_filter: filters.active ?? null,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('[AdminUserService] getUsersList error:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch users',
        };
      }

      // Debug: Log raw response from RPC
      console.log('[AdminUserService] getUsersList raw response:', JSON.stringify(data, null, 2));

      // Handle response - could be object or array with single element
      const responseData = Array.isArray(data) ? data[0] : data;
      console.log('[AdminUserService] getUsersList responseData:', JSON.stringify(responseData, null, 2));

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
        console.error('[AdminUserService] RPC returned error:', responseData.error, responseData.message);
        return {
          success: false,
          error: responseData.message || responseData.error || 'Failed to fetch users',
        };
      }

      // Map response to typed structure
      console.log('[AdminUserService] responseData.users:', responseData.users);
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
      }));
      console.log('[AdminUserService] mapped users count:', users.length);

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
      console.error('[AdminUserService] Exception in getUsersList:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      console.log('[AdminUserService] getUserDetails:', { userId });

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('get_user_details', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[AdminUserService] getUserDetails error:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch user details',
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.user) {
        return {
          success: false,
          error: 'User not found',
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
          assigned_customers: assignedCustomers,
        },
      };
    } catch (error) {
      console.error('[AdminUserService] Exception in getUserDetails:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      console.log('[AdminUserService] updateUserRole:', { userId, newRole });

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('update_user_role', {
        p_user_id: userId,
        p_new_role: newRole,
      });

      if (error) {
        console.error('[AdminUserService] updateUserRole error:', error);
        return {
          success: false,
          error: error.message || 'Failed to update user role',
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          error: responseData?.error || 'Failed to update role',
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
      console.error('[AdminUserService] Exception in updateUserRole:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      console.log('[AdminUserService] updateUserStatus:', { userId, active });

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('update_user_status', {
        p_user_id: userId,
        p_active: active,
      });

      if (error) {
        console.error('[AdminUserService] updateUserStatus error:', error);
        return {
          success: false,
          error: error.message || 'Failed to update user status',
        };
      }

      // Handle response
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.success) {
        return {
          success: false,
          error: responseData?.error || 'Failed to update status',
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
      console.error('[AdminUserService] Exception in updateUserStatus:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    console.log('[AdminUserService] assignCustomerToUser:', { userMobile, customerId });

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
        errorMessage: 'Failed to assign customer',
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
    console.log('[AdminUserService] removeCustomerAssignment:', { userMobile, customerId });

    const result = await executeRPC<boolean>(
      getAuthenticatedClient,
      'remove_customer_assignment',
      {
        target_user_mobile: userMobile,
        target_customer_id: customerId,
      },
      {
        context: 'AdminUserService.removeCustomerAssignment',
        errorMessage: 'Failed to remove customer assignment',
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
