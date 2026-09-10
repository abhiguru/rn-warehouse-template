/**
 * Simplified User Core Service for React Native
 * 
 * This service handles user CRUD operations using Supabase.
 * Adapted from the shared library for React Native compatibility.
 */

import { getSupabaseClient } from '../config/supabaseConfig';
import type { UserProfile } from '@/types/user.types';

/**
 * Fetches a single user document by its ID from Supabase.
 */
export const getUserByIdDirect = async (userId: string): Promise<{
  status: 'success' | 'error';
  data: UserProfile | null;
  error?: Error | string;
}> => {
  if (!userId) {
    return { status: 'error', data: null, error: 'User ID is required.' };
  }
  
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { status: 'error', data: null, error: 'User not found.' };
      }
      return { status: 'error', data: null, error };
    }

    // Fetch customer assignments via RPC (needed for Reports role-based access)
    let assignedCustomerIds: string[] = [];
    try {
      const { data: customerIds, error: rpcError } = await getSupabaseClient()
        .rpc('user_accessible_customers');

      if (!rpcError && customerIds) {
        assignedCustomerIds = customerIds;
      }
    } catch (rpcErr) {
      console.warn('[UserCoreService] Failed to fetch customer assignments:', rpcErr);
    }

    // Add compatibility fields
    const role: UserProfile['role'] = ['admin', 'supervisor', 'staff', 'customer'].includes(data.role)
      ? data.role
      : 'customer';
    const userWithCompatibility: UserProfile = {
      id: data.id,
      auth_user_id: data.auth_user_id,
      name: data.name,
      email: data.email || '',
      mobile: data.mobile || data.phone || data.phone_number || '',
      role,
      supervisor: data.role === 'supervisor' || data.role === 'admin',
      active: data.active ?? true,
      created_at: data.created_at || '',
      updated_at: data.updated_at || '',
      phoneNumber: data.phone || data.mobile || data.phone_number || '',
      assignedCustomerIds,
    };

    return { status: 'success', data: userWithCompatibility };
  } catch (error) {
    return { status: 'error', data: null, error: error instanceof Error ? error : String(error) };
  }
};
