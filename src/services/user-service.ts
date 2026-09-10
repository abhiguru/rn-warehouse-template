import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  UserProfile,
  UserFormData,
  UserServiceResponse,
  CustomerAssignment,
  SearchCustomerResult
} from '@/types/user.types';
// M3 Fix: Import executeRPC utilities (kept for future use - current methods have extensive debug logging)
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

export class UserService {
  
  // Get user by ID with customer assignments
  static async getUserById(userId: string): Promise<UserServiceResponse<UserProfile>> {
    try {
      console.log('[UserService] Fetching user by ID:', userId);

      if (!userId) {
        return {
          success: false,
          message: 'User ID is required',
          error: 'Missing parameter'
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
        console.error('[UserService] User profile fetch error:', userError);
        return {
          success: false,
          message: 'Failed to fetch user profile',
          error: userError.message
        };
      }

      if (!userProfile) {
        return {
          success: false,
          message: 'User not found',
          error: 'User profile not found'
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
        name: mappedUser.name,
        role: mappedUser.role,
        assignedCustomersCount: assignedCustomers.length
      });

      return {
        success: true,
        message: 'User retrieved successfully',
        data: mappedUser
      };
    } catch (error) {
      console.error('[UserService] Exception:', error);
      return {
        success: false,
        message: 'An unexpected error occurred',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Update user profile
  static async updateUser(userId: string, userData: UserFormData): Promise<UserServiceResponse<UserProfile>> {
    try {
      console.log('[UserService] Updating user:', { userId, userData });

      if (!userId) {
        return {
          success: false,
          message: 'User ID is required',
          error: 'Missing parameter'
        };
      }

      // Get authenticated client (handles JWT auth properly)
      console.log('[UserService] Getting authenticated client for update...');
      const client = await getAuthenticatedClient();

      // Only update fields that users are allowed to modify
      // Note: mobile, role, active, and email fields are managed by administrators
      // The user_profiles table doesn't have an email column
      const dataToUpdate: Record<string, string> = {
        name: userData.name,
        updated_at: new Date().toISOString()
      };

      console.log('[UserService] Updating with data:', dataToUpdate);

      // Update user profile - try by id first, then by auth_user_id
      let updateError = null;

      // First try updating by profile table's primary key (id)
      const { error: errorById, count: countById } = await client
        .from('user_profiles')
        .update(dataToUpdate)
        .eq('id', userId)
        .select('id');

      if (countById === 0) {
        // Fallback: try by auth_user_id
        const { error: errorByAuthId } = await client
          .from('user_profiles')
          .update(dataToUpdate)
          .eq('auth_user_id', userId);

        updateError = errorByAuthId;
      } else {
        updateError = errorById;
      }

      if (updateError) {
        console.error('[UserService] User update error:', updateError);
        return {
          success: false,
          message: 'Failed to update user profile',
          error: updateError.message
        };
      }

      // Customer assignments are managed by administrators and not updated here

      // Fetch updated user data
      const updatedUserResult = await this.getUserById(userId);
      
      console.log('[UserService] User updated successfully');

      return {
        success: true,
        message: 'User updated successfully',
        data: updatedUserResult.data
      };
    } catch (error) {
      console.error('[UserService] Exception:', error);
      return {
        success: false,
        message: 'An unexpected error occurred',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Search customers for assignment
  static async searchCustomers(query: string): Promise<UserServiceResponse<SearchCustomerResult[]>> {
    try {
      console.log('[UserService] searchCustomers called with query:', query);

      if (!query || query.length < 2) {
        console.log('[UserService] Query too short, returning empty');
        return {
          success: true,
          message: 'Query too short',
          data: []
        };
      }

      console.log('[UserService] Getting authenticated client...');
      const client = await getAuthenticatedClient();
      console.log('[UserService] Got client, executing search query...');

      const { data: customers, error } = await client
        .from('customers')
        .select('id, name, mobile, city')
        .or(`name.ilike.%${query}%,mobile.ilike.%${query}%,city.ilike.%${query}%`)
        .eq('active', true)
        .order('name')
        .limit(20);

      console.log('[UserService] Customer search raw response:', {
        hasData: !!customers,
        dataLength: customers?.length,
        error: error?.message,
        errorCode: error?.code,
        firstResult: customers?.[0],
      });

      if (error) {
        console.error('[UserService] Customer search error:', error);
        return {
          success: false,
          message: 'Failed to search customers',
          error: error.message
        };
      }

      console.log('[UserService] Raw customers data:', JSON.stringify(customers, null, 2));

      const searchResults: SearchCustomerResult[] = (customers || []).map(customer => ({
        value: customer.id,
        label: customer.name,
        detail: [customer.mobile, customer.city].filter(Boolean).join(' • ')
      }));

      console.log('[UserService] Mapped search results:', searchResults.length, 'results');

      return {
        success: true,
        message: 'Customers found',
        data: searchResults
      };
    } catch (error) {
      console.error('[UserService] Exception:', error);
      return {
        success: false,
        message: 'An unexpected error occurred',
        error: error instanceof Error ? error.message : 'Unknown error'
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
        console.error('[UserService] Account deletion RPC error:', error);
        return {
          success: false,
          message: 'Failed to delete account',
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
          message: rpcResponse?.error || 'Failed to delete account',
          error: rpcResponse?.error || 'Unknown error'
        };
      }

      return {
        success: true,
        message: rpcResponse.message || 'Account deleted successfully',
        data: undefined
      };
    } catch (error) {
      console.error('[UserService] Account deletion exception:', error);
      return {
        success: false,
        message: 'An unexpected error occurred while deleting account',
        error: error instanceof Error ? error.message : 'Unknown error'
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
        console.error('[UserService] Customer fetch error:', error);
        return {
          success: false,
          message: 'Failed to fetch customer',
          error: error.message
        };
      }

      if (!customer) {
        return {
          success: false,
          message: 'Customer not found',
          error: 'Customer not found'
        };
      }

      return {
        success: true,
        message: 'Customer retrieved successfully',
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
        message: 'An unexpected error occurred',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default UserService;
