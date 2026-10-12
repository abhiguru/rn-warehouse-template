import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  UserProfile,
  UserFormData,
  UserServiceResponse,
  CustomerAssignment
} from '@/types/user.types';
// M3 Fix: Import executeRPC utilities (kept for future use - current methods have extensive debug logging)
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

// Identifiers and error codes only; never a profile, a customer or the server's wording.
const log = createLogger('user');

export class UserService {
  
  // Get user by ID with customer assignments
  static async getUserById(userId: string): Promise<UserServiceResponse<UserProfile>> {
    try {

      if (!userId) {
        return {
          success: false,
          message: t('errors.user.idRequired'),
          error: t('errors.general.missingParameter')
        };
      }

      // Get authenticated client (handles JWT auth properly)
      const client = await getAuthenticatedClient();

      // Fetch user profile - try by id first, then by auth_user_id
      let userProfile = null;
      let userError = null;

      // First try querying by profile table's primary key (id)
      const { data: profileById, error: errorById } = await client
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();


      if (profileById) {
        userProfile = profileById;
      } else {
        // Fallback: try by auth_user_id
        const { data: profileByAuthId, error: errorByAuthId } = await client
          .from('user_profiles')
          .select('*')
          .eq('auth_user_id', userId)
          .maybeSingle();


        userProfile = profileByAuthId;
        userError = errorByAuthId;
      }

      if (userError) {
        handleGlobalAuthError(userError);
        log.error('User profile fetch error', loggableError(userError));
        return {
          success: false,
          message: t('errors.user.fetchProfileFailed'),
          error: userError.message
        };
      }

      if (!userProfile) {
        return {
          success: false,
          message: t('errors.user.notFound'),
          error: t('errors.user.profileNotFound')
        };
      }

      // Fetch customer assignments via RPC
      const { data: assignedCustomerIds, error: rpcError } = await client
        .rpc('user_accessible_customers');

      let assignedCustomers: CustomerAssignment[] = [];

      if (!rpcError && assignedCustomerIds && assignedCustomerIds.length > 0) {
        // Fetch customer details for assigned customers
        const { data: customers, error: customersError } = await client
          .from('customers')
          .select('id, name, mobile, city, active')
          .in('id', assignedCustomerIds);

        if (!customersError && customers) {
          assignedCustomers = customers.map(customer => ({
            id: customer.id,
            name: customer.name,
            mobile: customer.mobile,
            city: customer.city,
            active: customer.active
          }));
        }
      }

      // Map user profile with assignments
      const mappedUser: UserProfile = {
        id: userProfile.id,
        auth_user_id: userProfile.auth_user_id,
        name: userProfile.name,
        email: userProfile.email,
        mobile: userProfile.mobile,
        role: userProfile.role,
        supervisor: userProfile.role === 'supervisor', // Convert for UI compatibility
        active: userProfile.active,
        created_at: userProfile.created_at,
        updated_at: userProfile.updated_at,
        assignedCustomers: assignedCustomers
      };


      return {
        success: true,
        message: t('errors.user.retrieved'),
        data: mappedUser
      };
    } catch (error) {
      log.error('Exception', loggableError(error));
      return {
        success: false,
        message: t('errors.general.unexpected'),
        error: error instanceof Error ? error.message : t('errors.general.unknown')
      };
    }
  }

  // Update user profile
  static async updateUser(userId: string, userData: UserFormData): Promise<UserServiceResponse<UserProfile>> {
    try {
      if (!userId) {
        return {
          success: false,
          message: t('errors.user.idRequired'),
          error: t('errors.general.missingParameter')
        };
      }

      // Get authenticated client (handles JWT auth properly)
      const client = await getAuthenticatedClient();

      // The name is the only column sent. The server grants UPDATE on
      // user_profiles for (name, display_name) only, and any other column in
      // the statement, updated_at included, makes it refuse the whole update;
      // a trigger keeps updated_at. Mobile, role and active are changed by
      // administrators through their own RPCs.
      const dataToUpdate = { name: userData.name };

      // Update by the profile's primary key first, then by auth_user_id. The
      // updated rows are read back: an update that matches no row (the policy
      // allows a person's own profile only) is a failure, not a success.
      const byId = await client
        .from('user_profiles')
        .update(dataToUpdate)
        .eq('id', userId)
        .select('id');
      let updateError = byId.error;
      let updatedRows = byId.data?.length ?? 0;

      if (!updateError && updatedRows === 0) {
        const byAuthId = await client
          .from('user_profiles')
          .update(dataToUpdate)
          .eq('auth_user_id', userId)
          .select('id');
        updateError = byAuthId.error;
        updatedRows = byAuthId.data?.length ?? 0;
      }

      if (updateError) {
        handleGlobalAuthError(updateError);
        log.error('User update error', loggableError(updateError));
        return {
          success: false,
          message: t('errors.user.updateProfileFailed'),
          error: updateError.message
        };
      }

      if (updatedRows === 0) {
        return {
          success: false,
          message: t('errors.user.updateProfileFailed'),
          error: t('errors.user.profileNotChanged')
        };
      }

      // Customer assignments are managed by administrators and not updated here

      // Fetch updated user data
      const updatedUserResult = await this.getUserById(userId);
      

      return {
        success: true,
        message: t('errors.user.updated'),
        data: updatedUserResult.data
      };
    } catch (error) {
      log.error('Exception', loggableError(error));
      return {
        success: false,
        message: t('errors.general.unexpected'),
        error: error instanceof Error ? error.message : t('errors.general.unknown')
      };
    }
  }

  /**
   * Delete the current user's account and all associated data.
   * This calls the backend RPC function which handles:
   * - Deleting/anonymizing user profile data
   * - Removing customer assignments
   * - Revoking all sessions
   *
   * Note: Historical GRN/dispatch records are retained for regulatory compliance.
   *
   * @returns Success status and message
   */
  /**
   * True only for an error the database itself answered: a PostgREST or SQL
   * error with its code (a SQLSTATE such as 42501 or P0001, or PGRSTnnn).
   * postgrest-js gives `code: ""` for a lost connection and for a body that is
   * not JSON (a gateway's HTML page), and nothing at all for "Session changed"
   * thrown by the app's own fetch gate after the answer arrived. None of those
   * says what the server did, so none of them counts as a refusal.
   */
  static isDatabaseAnswer(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && /^(PGRST\d{3}|[0-9A-Z]{5})$/.test(code);
  }

  static async deleteAccount(): Promise<UserServiceResponse<void>> {
    try {

      const client = await getAuthenticatedClient();

      const { data, error } = await client.rpc('delete_user_account');

      if (error) {
        handleGlobalAuthError(error);
        log.error('Account deletion RPC error', loggableError(error));
        return {
          success: false,
          message: t('errors.user.deleteAccountFailed'),
          error: error.message,
          // Only the database's own answer says the account was kept; anything
          // else (no connection, a gateway page, a session that changed after
          // the answer) leaves open whether the deletion was committed.
          outcome: UserService.isDatabaseAnswer(error) ? 'refused' : 'unknown',
        };
      }


      // Check RPC response for success flag
      const rpcResponse = data as { success: boolean; message?: string; error?: string; code?: string } | null;

      // The only administrator cannot delete the account (backend migration 44).
      if (rpcResponse && !rpcResponse.success && rpcResponse.code === 'LAST_ADMIN') {
        return {
          success: false,
          message: t('errors.user.lastAdminDelete'),
          error: t('errors.user.lastAdminDelete'),
          outcome: 'refused',
        };
      }

      if (rpcResponse?.success !== true) {
        log.error('Account deletion failed', loggableError(rpcResponse));
        return {
          success: false,
          message: serverText(rpcResponse?.error, t('errors.user.deleteAccountFailed')),
          error: serverText(rpcResponse?.error, t('errors.general.unknown')),
          // Only the RPC's own `success: false` says the account was kept. An
          // empty body or JSON without `success` (an intermediary answering
          // 2xx) says nothing about what the database did.
          outcome: rpcResponse?.success === false ? 'refused' : 'unknown',
        };
      }

      return {
        success: true,
        message: serverText(rpcResponse.message, t('errors.user.accountDeleted')),
        data: undefined
      };
    } catch (error) {
      log.error('Account deletion exception', loggableError(error));
      return {
        success: false,
        message: t('errors.user.deleteAccountUnexpected'),
        outcome: 'unknown',
        error: error instanceof Error ? error.message : t('errors.general.unknown')
      };
    }
  }

  // Get customer by ID (for loading assigned customer details)
  static async getCustomerById(customerId: string): Promise<UserServiceResponse<CustomerAssignment>> {
    try {
      const client = await getAuthenticatedClient();
      const { data: customer, error } = await client
        .from('customers')
        .select('id, name, mobile, city, active')
        .eq('id', customerId)
        .single();

      if (error) {
        handleGlobalAuthError(error);
        log.error('Customer fetch error', loggableError(error));
        return {
          success: false,
          message: t('errors.customer.fetchFailed'),
          error: error.message
        };
      }

      if (!customer) {
        return {
          success: false,
          message: t('errors.customer.notFound'),
          error: t('errors.customer.notFound')
        };
      }

      return {
        success: true,
        message: t('errors.customer.retrieved'),
        data: {
          id: customer.id,
          name: customer.name,
          mobile: customer.mobile,
          city: customer.city,
          active: customer.active
        }
      };
    } catch (error) {
      log.error('Exception', loggableError(error));
      return {
        success: false,
        message: t('errors.general.unexpected'),
        error: error instanceof Error ? error.message : t('errors.general.unknown')
      };
    }
  }
}

export default UserService;
