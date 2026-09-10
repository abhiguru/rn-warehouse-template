/**
 * Customer Service
 *
 * Handles all customer-related API operations including:
 * - List/search customers
 * - Create new customers
 * - Update existing customers
 * - Inactivate/restore customers
 *
 * Uses Supabase RPCs for security and consistency.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import {
  Customer,
  CustomerListItem,
  CustomerListResponse,
  CustomerServiceResponse,
  CustomerFilters,
  CreateCustomerParams,
  UpdateCustomerParams,
  DEFAULT_CUSTOMER_FILTERS,
} from '@/types/customer.types';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

// =============================================================================
// SERVICE CLASS
// =============================================================================

class CustomerService {
  // ===========================================================================
  // SEARCH/LIST
  // ===========================================================================

  /**
   * Search customers by name or mobile
   * Uses search_customers RPC which respects RLS
   */
  async searchCustomers(
    query: string,
    limit: number = 20
  ): Promise<CustomerListItem[]> {
    try {
      console.log('[CustomerService] searchCustomers called:', { query, limit });

      if (!query || query.length < 1) {
        console.log('[CustomerService] Query too short, returning empty');
        return [];
      }

      const client = await getAuthenticatedClient();
      console.log('[CustomerService] Calling search_customers RPC...');

      const { data, error } = await client.rpc('search_customers', {
        p_search_query: query,
        p_limit: limit,
      });

      console.log('[CustomerService] RPC response:', {
        hasData: !!data,
        dataType: typeof data,
        isArray: Array.isArray(data),
        hasNestedData: !!(data as Record<string, unknown>)?.data,
        error: error?.message,
      });

      if (error) {
        console.error('[CustomerService] Search error:', error);
        return [];
      }

      // Handle standardized response format: { success: true, data: [...] }
      // or direct array response
      let customerArray: unknown[];
      if (Array.isArray(data)) {
        customerArray = data;
      } else if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as Record<string, unknown>).data)) {
        console.log('[CustomerService] Unwrapping nested data array');
        customerArray = (data as Record<string, unknown>).data as unknown[];
      } else {
        console.log('[CustomerService] No valid customer data found, raw data:', JSON.stringify(data, null, 2));
        return [];
      }

      console.log('[CustomerService] Customer array length:', customerArray.length);

      // Map RPC response to CustomerListItem
      interface RpcCustomer {
        id: string;
        name: string;
        mobile?: string;
        city?: string;
        email?: string;
        address?: string;
        active?: boolean;
      }
      const results = customerArray.map((customer: unknown) => {
        const c = customer as RpcCustomer;
        return {
          id: c.id,
          name: c.name,
          mobile: c.mobile || '',
          city: c.city,
          email: c.email,
          address: c.address,
          active: c.active ?? true,
        };
      });

      console.log('[CustomerService] Mapped results:', results.length);
      if (results.length > 0) {
        console.log('[CustomerService] First result:', results[0]);
      }

      return results;
    } catch (error) {
      console.error('[CustomerService] Exception in searchCustomers:', error);
      return [];
    }
  }

  /**
   * Get paginated customer list with filters
   * Falls back to direct table query with RLS
   */
  async getCustomerList(
    filters: CustomerFilters = DEFAULT_CUSTOMER_FILTERS,
    limit: number = 20,
    offset: number = 0
  ): Promise<CustomerListResponse> {
    try {
      console.log('[CustomerService] getCustomerList:', { filters, limit, offset });

      const client = await getAuthenticatedClient();

      // Build query
      let query = client
        .from('customers')
        .select('id, name, mobile, city, email, address, active', { count: 'exact' });

      // Apply filters
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
      }

      if (filters.active !== null && filters.active !== undefined) {
        query = query.eq('active', filters.active);
      }

      if (filters.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'name';
      const sortOrder = filters.sortOrder || 'asc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('[CustomerService] List error:', error);
        return {
          success: false,
          message: error.message || 'Failed to fetch customers',
          data: [],
          error: error.message,
        };
      }

      interface RpcCustomerRow {
        id: string;
        name: string;
        mobile?: string;
        city?: string;
        email?: string;
        address?: string;
        active?: boolean;
      }
      const customers: CustomerListItem[] = (data || []).map((c: RpcCustomerRow) => ({
        id: c.id,
        name: c.name,
        mobile: c.mobile || '',
        city: c.city,
        email: c.email,
        address: c.address,
        active: c.active ?? true,
      }));

      return {
        success: true,
        message: 'Customers fetched successfully',
        data: customers,
        pagination: {
          total_count: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      console.error('[CustomerService] Exception in getCustomerList:', error);
      return {
        success: false,
        message: 'Failed to fetch customers',
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // GET BY ID
  // ===========================================================================

  /**
   * Get customer by ID with full details
   */
  async getCustomerById(customerId: string): Promise<CustomerServiceResponse> {
    try {
      console.log('[CustomerService] getCustomerById:', customerId);

      if (!customerId) {
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing parameter',
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (error) {
        console.error('[CustomerService] Get by ID error:', error);
        return {
          success: false,
          message: error.message || 'Customer not found',
          error: error.message,
        };
      }

      if (!data) {
        return {
          success: false,
          message: 'Customer not found',
          error: 'NOT_FOUND',
        };
      }

      const customer: Customer = {
        id: data.id,
        name: data.name,
        mobile: data.mobile || '',
        email: data.email,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        address: data.address,
        gst: data.gst,
        pan: data.pan,
        contact_name: data.contact_name,
        contact_mobile: data.contact_mobile,
        contact_email: data.contact_email,
        document_urls: data.document_urls || [],
        image_urls: data.image_urls || [],
        active: data.active ?? true,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      return {
        success: true,
        message: 'Customer fetched successfully',
        data: customer,
      };
    } catch (error) {
      console.error('[CustomerService] Exception in getCustomerById:', error);
      return {
        success: false,
        message: 'Failed to fetch customer',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a new customer
   * Uses create_customer RPC with image upload support
   * M3 Fix: Using executeRPC wrapper
   *
   * Validates:
   * - Mobile format (10-15 digits)
   * - Email format (RFC 5322)
   * - GST format (15 chars Indian format)
   * - PAN format (10 chars Indian format)
   * - Image count (max 10)
   */
  async createCustomer(params: CreateCustomerParams): Promise<CustomerServiceResponse> {
    console.log('[CustomerService] createCustomer:', { ...params, p_image_urls: params.p_image_urls?.length || 0 });

    // Validate image count
    if (params.p_image_urls && params.p_image_urls.length > 10) {
      return {
        success: false,
        message: 'Failed to create customer',
        error: 'Image count exceeds maximum of 10',
      };
    }

    interface CreateCustomerRpcResponse {
      success: boolean;
      message?: string;
      customer_id?: string;
      error?: string;
    }

    const result = await executeRPC<CreateCustomerRpcResponse>(
      getAuthenticatedClient,
      'create_customer',
      params as unknown as Record<string, unknown>,
      {
        context: 'CustomerService.createCustomer',
        errorMessage: 'Failed to create customer',
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      console.error('[CustomerService] RPC returned success=false:', rpcData);
      return {
        success: false,
        message: rpcData.message || 'Failed to create customer',
        error: rpcData.error || 'Unknown error',
      };
    }

    console.log('[CustomerService] Customer created via RPC:', rpcData.customer_id);
    return {
      success: true,
      message: rpcData.message || 'Customer created successfully',
      data: {
        id: rpcData.customer_id,
        name: params.p_name,
        mobile: params.p_mobile,
        email: params.p_email,
        city: params.p_city,
        state: params.p_state,
        pincode: params.p_pincode,
        address: params.p_address,
        gst: params.p_gst_number,
        pan: params.p_pan_number,
        contact_name: params.p_contact_person,
        contact_mobile: params.p_contact_mobile,
        contact_email: params.p_contact_email,
        image_urls: params.p_image_urls,
        document_urls: params.p_document_urls,
        active: true,
        created_at: new Date().toISOString(),
      } as Customer,
    };
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  /**
   * Update an existing customer
   * Uses update_customer RPC with image management support
   * M3 Fix: Using executeRPC wrapper
   *
   * Validates:
   * - Mobile format (10-15 digits, must be unique if changed)
   * - Email format (RFC 5322)
   * - GST format (15 chars Indian format)
   * - PAN format (10 chars Indian format)
   * - Image count (max 10)
   *
   * Permissions:
   * - Admin/Supervisor: all fields
   * - Customer role: only contact fields (contact_person, contact_mobile, contact_email)
   */
  async updateCustomer(params: UpdateCustomerParams): Promise<CustomerServiceResponse> {
    console.log('[CustomerService] updateCustomer:', {
      customer_id: params.p_customer_id,
      has_images: !!params.p_image_urls,
      image_count: params.p_image_urls?.length || 0,
    });

    // Validate image count
    if (params.p_image_urls && params.p_image_urls.length > 10) {
      return {
        success: false,
        message: 'Failed to update customer',
        error: 'Image count exceeds maximum of 10',
      };
    }

    interface UpdateCustomerRpcResponse {
      success: boolean;
      message?: string;
      error?: string;
    }

    const result = await executeRPC<UpdateCustomerRpcResponse>(
      getAuthenticatedClient,
      'update_customer',
      params as unknown as Record<string, unknown>,
      {
        context: 'CustomerService.updateCustomer',
        errorMessage: 'Failed to update customer',
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      console.error('[CustomerService] RPC returned success=false:', rpcData);
      return {
        success: false,
        message: rpcData.message || 'Failed to update customer',
        error: rpcData.error || 'Unknown error',
      };
    }

    console.log('[CustomerService] Customer updated via RPC');
    return {
      success: true,
      message: rpcData.message || 'Customer updated successfully',
    };
  }

  // ===========================================================================
  // INACTIVATE / RESTORE
  // ===========================================================================

  /**
   * Inactivate (soft delete) a customer
   * Uses safe_delete_customer RPC
   */
  async inactivateCustomer(customerId: string): Promise<CustomerServiceResponse> {
    try {
      console.log('[CustomerService] inactivateCustomer:', customerId);

      if (!customerId) {
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing parameter',
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('safe_delete_customer', {
        p_customer_id: customerId,
        p_permanent: false,
      });

      if (error) {
        console.error('[CustomerService] Inactivate error:', error);

        // Fallback to direct update if RPC doesn't exist
        if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('does not exist')) {
          console.log('[CustomerService] RPC not available, using direct update fallback');

          const { error: updateError } = await client
            .from('customers')
            .update({
              active: false,
              deleted_at: new Date().toISOString(),
            })
            .eq('id', customerId);

          if (updateError) {
            return {
              success: false,
              message: updateError.message || 'Failed to inactivate customer',
              error: updateError.message,
            };
          }

          return {
            success: true,
            message: 'Customer inactivated successfully',
          };
        }

        return {
          success: false,
          message: error.message || 'Failed to inactivate customer',
          error: error.message,
        };
      }

      // Check if RPC returned success: false in the response data
      if (data && data.success === false) {
        return {
          success: false,
          message: data.message || 'Failed to inactivate customer',
          error: data.message,
        };
      }

      return {
        success: true,
        message: data?.message || 'Customer inactivated successfully',
        data: data,
      };
    } catch (error) {
      console.error('[CustomerService] Exception in inactivateCustomer:', error);
      return {
        success: false,
        message: 'Failed to inactivate customer',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Restore an inactivated customer
   * Uses restore_customer RPC
   */
  async restoreCustomer(customerId: string): Promise<CustomerServiceResponse> {
    try {
      console.log('[CustomerService] restoreCustomer:', customerId);

      if (!customerId) {
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing parameter',
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('restore_customer', {
        p_customer_id: customerId,
      });

      if (error) {
        console.error('[CustomerService] Restore error:', error);

        // Fallback to direct update if RPC doesn't exist
        if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('does not exist')) {
          console.log('[CustomerService] RPC not available, using direct update fallback');

          const { error: updateError } = await client
            .from('customers')
            .update({
              active: true,
              deleted_at: null,
            })
            .eq('id', customerId);

          if (updateError) {
            return {
              success: false,
              message: updateError.message || 'Failed to restore customer',
              error: updateError.message,
            };
          }

          return {
            success: true,
            message: 'Customer restored successfully',
          };
        }

        return {
          success: false,
          message: error.message || 'Failed to restore customer',
          error: error.message,
        };
      }

      // Check if RPC returned success: false in the response data
      if (data && data.success === false) {
        return {
          success: false,
          message: data.message || 'Failed to restore customer',
          error: data.message,
        };
      }

      return {
        success: true,
        message: data?.message || 'Customer restored successfully',
        data: data,
      };
    } catch (error) {
      console.error('[CustomerService] Exception in restoreCustomer:', error);
      return {
        success: false,
        message: 'Failed to restore customer',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const customerService = new CustomerService();

// Also export individual functions for convenience
export const {
  searchCustomers,
  getCustomerList,
  getCustomerById,
  createCustomer,
  updateCustomer,
  inactivateCustomer,
  restoreCustomer,
} = customerService;
