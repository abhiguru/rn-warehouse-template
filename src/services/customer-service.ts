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
  CustomerRefusalDetails,
  CustomerFilters,
  CreateCustomerParams,
  UpdateCustomerParams,
  DEFAULT_CUSTOMER_FILTERS,
} from '@/types/customer.types';
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { t } from '@/i18n';
import { containsPattern, orContains } from '@/utils/postgrestFilter';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

// Identifiers, counts and error codes only: search text, customer records and
// the server's wording are never logged.
const log = createLogger('customers');

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
   *
   * A search that could not be made (no connection, a refusal) throws, so the
   * picker can say so instead of showing "Nothing matches". A search that was
   * made and found nothing returns [].
   *
   * `includeInactive` adds deactivated customers (the server allows it for administrators
   * and supervisors only; for anyone else it is ignored). Such rows have `active: false`.
   */
  async searchCustomers(
    query: string,
    limit: number = 20,
    options: { includeInactive?: boolean } = {}
  ): Promise<CustomerListItem[]> {
    try {
      if (!query || query.length < 1) {
        return [];
      }

      const client = await getAuthenticatedClient();

      const { data, error } = await client.rpc('search_customers', {
        p_search_query: query,
        p_limit: limit,
        ...(options.includeInactive ? { p_include_inactive: true } : {}),
      });

      if (error) {
        handleGlobalAuthError(error);
        throw error; // logged once, by the catch below
      }

      // Handle standardized response format: { success: true, data: [...] }
      // or direct array response
      let customerArray: unknown[];
      if (Array.isArray(data)) {
        customerArray = data;
      } else if (
        data &&
        typeof data === 'object' &&
        'data' in data &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        customerArray = (data as Record<string, unknown>).data as unknown[];
      } else {
        log.warn('searchCustomers: answer is not a customer list', { type: typeof data });
        return [];
      }

      // Map RPC response to CustomerListItem
      interface RpcCustomer {
        id: string;
        name: string;
        mobile?: string;
        city?: string;
        email?: string;
        address?: string;
        active?: boolean;
        deleted?: boolean;
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
          ...(c.deleted ? { deleted: true } : {}),
        };
      });

      log.debug('searchCustomers', { results: results.length });

      return results;
    } catch (error) {
      log.error('Exception in searchCustomers', loggableError(error));
      throw error;
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
      log.debug('getCustomerList', {
        hasSearch: Boolean(filters.search),
        hasCity: Boolean(filters.city),
        active: filters.active,
        limit,
        offset,
      });

      const client = await getAuthenticatedClient();

      // Build query
      let query = client
        .from('customers')
        .select('id, name, mobile, city, email, address, active', {
          count: 'exact',
        });

      // Apply filters
      if (filters.search) {
        // The search text is data: quoted and escaped, so a comma, a bracket
        // or a % in a name cannot change the filter.
        query = query.or(
          `${orContains('name', filters.search)},${orContains('mobile', filters.search)}`
        );
      }

      if (filters.active !== null && filters.active !== undefined) {
        query = query.eq('active', filters.active);
      }

      if (filters.city) {
        query = query.ilike('city', containsPattern(filters.city));
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'name';
      const sortOrder = filters.sortOrder || 'asc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        handleGlobalAuthError(error);
        log.error('getCustomerList error', loggableError(error));
        return {
          success: false,
          message: serverText(error, t('errors.customer.fetchListFailed')),
          data: [],
          error: error.message,
          code: error.code,
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
      const customers: CustomerListItem[] = (data || []).map(
        (c: RpcCustomerRow) => ({
          id: c.id,
          name: c.name,
          mobile: c.mobile || '',
          city: c.city,
          email: c.email,
          address: c.address,
          active: c.active ?? true,
        })
      );

      return {
        success: true,
        message: t('errors.customer.listFetched'),
        data: customers,
        pagination: {
          total_count: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      log.error('Exception in getCustomerList', loggableError(error));
      return {
        success: false,
        message: serverText(error, t('errors.customer.fetchListFailed')),
        data: [],
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
      };
    }
  }

  /**
   * How many customers are active and how many are deactivated (two head counts of the
   * customers table, the same table the list reads). null when either count could not be read:
   * the list then counts its own rows.
   */
  async getCustomerCounts(): Promise<{ active: number; inactive: number } | null> {
    try {
      const client = await getAuthenticatedClient();
      const head = (active: boolean) =>
        client.from('customers').select('id', { count: 'exact', head: true }).eq('active', active);
      const [active, inactive] = await Promise.all([head(true), head(false)]);
      if (active.error || inactive.error) {
        log.warn('getCustomerCounts: a count failed', {
          code: active.error?.code ?? inactive.error?.code,
        });
        return null;
      }
      return { active: active.count ?? 0, inactive: inactive.count ?? 0 };
    } catch (error) {
      log.error('Exception in getCustomerCounts', loggableError(error));
      return null;
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
      log.debug('getCustomerById', { customerId });

      if (!customerId) {
        return {
          success: false,
          message: t('errors.customer.idRequired'),
          error: t('errors.general.missingParameter'),
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (error) {
        handleGlobalAuthError(error);
        log.error('getCustomerById error', loggableError(error));
        return {
          success: false,
          message: serverText(error, t('errors.customer.notFound')),
          error: error.message,
          code: error.code,
        };
      }

      if (!data) {
        return {
          success: false,
          message: t('errors.customer.notFound'),
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
        contact_name: data.contact_person ?? data.contact_name,
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
        message: t('errors.customer.fetched'),
        data: customer,
      };
    } catch (error) {
      log.error('Exception in getCustomerById', loggableError(error));
      return {
        success: false,
        message: serverText(error, t('errors.customer.fetchFailed')),
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
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
  async createCustomer(
    params: CreateCustomerParams
  ): Promise<CustomerServiceResponse> {
    log.debug('createCustomer', {
      image_count: params.p_image_urls?.length || 0,
    });

    // Validate image count
    if (params.p_image_urls && params.p_image_urls.length > 10) {
      return {
        success: false,
        message: t('errors.customer.createFailed'),
        error: t('errors.customer.imageLimit'),
      };
    }

    interface CreateCustomerRpcResponse {
      success: boolean;
      message?: string;
      data?: { customer_id?: string };
      error?: unknown;
    }

    const result = await executeRPC<CreateCustomerRpcResponse>(
      getAuthenticatedClient,
      'create_customer',
      params as unknown as Record<string, unknown>,
      {
        context: 'CustomerService.createCustomer',
        write: true,
        errorMessage: t('errors.customer.createFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
        code: result.errorCode,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      return refusedResponse(rpcData, 'createCustomer', t('errors.customer.createFailed'));
    }

    const newId = rpcData.data?.customer_id;
    log.debug('createCustomer done', { customerId: newId });
    return {
      success: true,
      message: serverText(rpcData.message, t('errors.customer.created')),
      data: {
        id: newId,
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
  async updateCustomer(
    params: UpdateCustomerParams
  ): Promise<CustomerServiceResponse> {
    log.debug('updateCustomer', {
      customer_id: params.p_customer_id,
      has_images: !!params.p_image_urls,
      image_count: params.p_image_urls?.length || 0,
    });

    // Validate image count
    if (params.p_image_urls && params.p_image_urls.length > 10) {
      return {
        success: false,
        message: t('errors.customer.updateFailed'),
        error: t('errors.customer.imageLimit'),
      };
    }

    interface UpdateCustomerRpcResponse {
      success: boolean;
      message?: string;
      error?: unknown;
    }

    const result = await executeRPC<UpdateCustomerRpcResponse>(
      getAuthenticatedClient,
      'update_customer',
      {
        p_customer_id: params.p_customer_id,
        p_name: params.p_name,
        p_mobile: params.p_mobile,
        p_email: params.p_email,
        p_address: params.p_address,
        p_city: params.p_city,
        p_state: params.p_state,
        p_pincode: params.p_pincode,
        p_gst: params.p_gst_number,
        p_pan: params.p_pan_number,
        p_contact_person: params.p_contact_person,
        p_contact_mobile: params.p_contact_mobile,
        p_contact_email: params.p_contact_email,
        p_image_urls: params.p_image_urls,
        // The exact string read with the customer: never passed through a Date.
        p_expected_updated_at: params.p_expected_updated_at,
      },
      {
        context: 'CustomerService.updateCustomer',
        write: true,
        errorMessage: t('errors.customer.updateFailed'),
        unwrapNested: false,
        validateSuccess: false,
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
        code: result.errorCode,
      };
    }

    const rpcData = result.data;
    if (!rpcData.success) {
      return refusedResponse(rpcData, 'updateCustomer', t('errors.customer.updateFailed'));
    }

    return {
      success: true,
      message: serverText(rpcData.message, t('errors.customer.updated')),
    };
  }

  // ===========================================================================
  // INACTIVATE / RESTORE
  // ===========================================================================

  /**
   * Deactivate a customer: only `active` goes off, nothing is deleted (backend migration 82,
   * `set_customer_active`).
   */
  async inactivateCustomer(
    customerId: string
  ): Promise<CustomerServiceResponse> {
    try {
      log.debug('inactivateCustomer', { customerId });

      if (!customerId) {
        return {
          success: false,
          message: t('errors.customer.idRequired'),
          error: t('errors.general.missingParameter'),
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('set_customer_active', {
        p_customer_id: customerId,
        p_active: false,
      });

      if (error) {
        handleGlobalAuthError(error);
        log.error('inactivateCustomer error', loggableError(error));

        // The server owns the rules for this (a customer that still holds stock
        // cannot be deactivated), so a failed call is reported, never replaced
        // by a direct write to the customers table.
        return {
          success: false,
          message: serverText(error, t('errors.customer.inactivateFailed'), { write: true }),
          error: error.message,
          code: error.code,
        };
      }

      // Check if RPC returned success: false in the response data
      if (data && data.success === false) {
        return {
          success: false,
          message: serverText(data.message, t('errors.customer.inactivateFailed')),
          error: data.message,
        };
      }

      return {
        success: true,
        message: serverText(data?.message, t('errors.customer.inactivated')),
        data: data,
      };
    } catch (error) {
      log.error('Exception in inactivateCustomer', loggableError(error));
      return {
        success: false,
        message: serverText(error, t('errors.customer.inactivateFailed'), { write: true }),
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
      };
    }
  }

  /**
   * Activate a customer again (`set_customer_active`, backend migration 82).
   */
  async restoreCustomer(customerId: string): Promise<CustomerServiceResponse> {
    try {
      log.debug('restoreCustomer', { customerId });

      if (!customerId) {
        return {
          success: false,
          message: t('errors.customer.idRequired'),
          error: t('errors.general.missingParameter'),
        };
      }

      const client = await getAuthenticatedClient();
      const { data, error } = await client.rpc('set_customer_active', {
        p_customer_id: customerId,
        p_active: true,
      });

      if (error) {
        handleGlobalAuthError(error);
        log.error('restoreCustomer error', loggableError(error));

        // As for deactivation: a failed call is reported, never replaced by a
        // direct write to the customers table.
        return {
          success: false,
          message: serverText(error, t('errors.customer.restoreFailed'), { write: true }),
          error: error.message,
          code: error.code,
        };
      }

      // Check if RPC returned success: false in the response data
      if (data && data.success === false) {
        // Since the activation check: another active customer already uses the number (DUPLICATE_MOBILE
        // with that customer in `details`). Older answers carry the message only.
        const refusal = refusedResponse(data, 'restoreCustomer', t('errors.customer.restoreFailed'));
        return { ...refusal, error: data.message ?? refusal.error };
      }

      return {
        success: true,
        message: serverText(data?.message, t('errors.customer.restored')),
        data: data,
      };
    } catch (error) {
      log.error('Exception in restoreCustomer', loggableError(error));
      return {
        success: false,
        message: serverText(error, t('errors.customer.restoreFailed'), { write: true }),
        error: error instanceof Error ? error.message : t('errors.general.unknown'),
      };
    }
  }
}

/**
 * A refusal from create_customer / update_customer: `{ success: false, message, error: { code, field?, details? } }`.
 * Its code, field and details are carried on the response so the form can put the text under the right field.
 */
function refusedResponse(
  rpcData: { message?: string; error?: unknown },
  action: string,
  fallback: string
): CustomerServiceResponse {
  const refusal = rpcData.error && typeof rpcData.error === 'object' ? (rpcData.error as Record<string, unknown>) : {};
  const code = typeof refusal.code === 'string' ? refusal.code : typeof rpcData.error === 'string' ? rpcData.error : undefined;
  const field = typeof refusal.field === 'string' ? refusal.field : undefined;
  const details =
    refusal.details && typeof refusal.details === 'object' ? (refusal.details as CustomerRefusalDetails) : undefined;
  log.error(`${action} refused`, { code, field });
  const message = serverText(rpcData.message, fallback, { write: true, code });
  return {
    success: false,
    message,
    error: message,
    code,
    ...(field ? { field } : {}),
    ...(details ? { details } : {}),
  };
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
