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

export class UserService {
  
  // Get user by ID with customer assignments
  static async getUserById(userId: string): Promise<UserServiceResponse<UserProfile>> {
    try {
      console.log('[UserService] Fetching user by ID:', userId);

      if (!userId) {
        return {
          success: false,
          message: t('errors.user.idRequired'),
          error: t('errors.general.missingParameter')
        };
      }

      // Get authenticated client (handles JWT auth properly)
      console.log('[UserService] Getting authenticated client...');
      const client = await getAuthenticatedClient();
      console.log('[UserService] Got authenticated client, fetching user profile...');

      // Fetch user profile - try by id first, then by auth_user_id
      let userProfile = null;
      let userError = null;

      // First try querying by profile table's primary key (id)
      const { data: profileById, error: errorById } = await client
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      console.log('[UserService] Query by id result:', {
        found: !!profileById,
        error: errorById?.message
      });

      if (profileById) {
        userProfile = profileById;
      } else {
        // Fallback: try by auth_user_id
        const { data: profileByAuthId, error: errorByAuthId } = await client
          .from('user_profiles')
          .select('*')
          .eq('auth_user_id', userId)
          .maybeSingle();

        console.log('[UserService] Query by auth_user_id result:', {
          found: !!profileByAuthId,
          error: errorByAuthId?.message
        });

        userProfile = profileByAuthId;
        userError = errorByAuthId;
      }

      if (userError) {
        handleGlobalAuthError(userError);
        console.error('[UserService] User profile fetch error:', userError);
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

      console.log('[UserService] User fetched successfully:', {
        userId: mappedUser.id,
        role: mappedUser.role,
        assignedCustomersCount: assignedCustomers.length
      });

      return {
        success: true,
        message: t('errors.user.retrieved'),
        data: mappedUser
      };
    } catch (error) {
      console.error('[UserService] Exception:', error);
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
        console.error('[UserService] User update error:', updateError.code, updateError.message);
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
      
      console.log('[UserService] User updated successfully');

      return {
        success: true,
        message: t('errors.user.updated'),
        data: updatedUserResult.data
      };
    } catch (error) {
      console.error('[UserService] Exception:', error);
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
  static async deleteAccount(): Promise<UserServiceResponse<void>> {
    try {
      console.log('[UserService] Initiating account deletion...');

      const client = await getAuthenticatedClient();

      const { data, error } = await client.rpc('delete_user_account');

      if (error) {
        handleGlobalAuthError(error);
        console.error('[UserService] Account deletion RPC error:', error);
        return {
          success: false,
          message: t('errors.user.deleteAccountFailed'),
          error: error.message
        };
      }

      console.log('[UserService] Account deletion RPC response:', data);

      // Check RPC response for success flag
      const rpcResponse = data as { success: boolean; message?: string; error?: string } | null;

      if (!rpcResponse?.success) {
        console.error('[UserService] Account deletion failed:', rpcResponse?.error);
        return {
          success: false,
          message: serverText(rpcResponse?.error, t('errors.user.deleteAccountFailed')),
          error: serverText(rpcResponse?.error, t('errors.general.unknown'))
        };
      }

      return {
        success: true,
        message: serverText(rpcResponse.message, t('errors.user.accountDeleted')),
        data: undefined
      };
    } catch (error) {
      console.error('[UserService] Account deletion exception:', error);
      return {
        success: false,
        message: t('errors.user.deleteAccountUnexpected'),
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
        console.error('[UserService] Customer fetch error:', error);
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
      console.error('[UserService] Exception:', error);
      return {
        success: false,
        message: t('errors.general.unexpected'),
        error: error instanceof Error ? error.message : t('errors.general.unknown')
      };
    }
  }
}

export default UserService;
