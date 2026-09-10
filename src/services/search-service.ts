import { getSupabaseClient, getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

export interface SearchResult {
  label: string;
  value: string;
  detail?: string;
  city?: string;
  mobile?: string;
  type: 'customer' | 'item' | 'dispatch' | 'grn';
}

class SearchService {
  // Search customers by name using RPC for proper security
  async searchCustomers(query: string): Promise<SearchResult[]> {
    try {
      if (__DEV__) {
        console.log('[SearchService] ====== CUSTOMER SEARCH DEBUG ======');
        console.log('[SearchService] Query:', query);
        console.log('[SearchService] Query length:', query?.length);
      }

      if (!query || query.length < 1) {
        if (__DEV__) console.log('[SearchService] Query too short, returning empty array');
        return [];
      }

      if (__DEV__) {
        console.log('[SearchService] Calling search_customers RPC...');
        console.log('[SearchService] - Query:', query);
        console.log('[SearchService] - Limit: 20');
      }

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient
        .rpc('search_customers', {
          p_search_query: query,
          p_limit: 20
        });

      if (__DEV__) {
        console.log('[SearchService] RPC response received');
        console.log('[SearchService] - Error:', error);
        console.log('[SearchService] - Data type:', typeof data);
        console.log('[SearchService] - Data is array:', Array.isArray(data));
        console.log('[SearchService] - Data length:', data?.length);
        console.log('[SearchService] - Raw data:', JSON.stringify(data, null, 2));
      }

      if (error) {
        console.error('[SearchService] Customer search RPC error:', error);
        if (__DEV__) console.error('[SearchService] Error details:', JSON.stringify(error, null, 2));
        return [];
      }

      // Handle wrapped response format: { data: [...], message, success }
      const customerData = Array.isArray(data) ? data : (data?.data || []);

      if (!customerData || customerData.length === 0) {
        if (__DEV__) console.log('[SearchService] No customers found for query:', query);
        return [];
      }

      // search_customers returns array directly with fields: id, name, mobile, city, email, address
      interface RpcCustomerResult {
        id: string;
        name: string;
        mobile?: string;
        city?: string;
        email?: string;
        address?: string;
      }
      const results = customerData.map((customer: RpcCustomerResult) => {
        // Prioritize address (first line) for distinguishing customers with same name
        let detail: string | undefined;
        if (customer.address) {
          // Get first line of address (split by comma or newline)
          detail = customer.address.split(/[,\n]/)[0].trim();
        } else if (customer.city) {
          detail = customer.city;
        }
        return {
          label: customer.name,
          value: customer.id,
          detail,
          city: customer.city,
          mobile: customer.mobile,
          type: 'customer' as const
        };
      });

      console.log('[SearchService] Mapped results:', results.length);
      console.log('[SearchService] First result:', results[0]);
      console.log('[SearchService] ====================================');

      return results;
    } catch (error) {
      console.error('[SearchService] Exception in searchCustomers:', error);
      console.error('[SearchService] Exception details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  // Search items catalog by name or packaging
  async searchGRNItems(query: string): Promise<SearchResult[]> {
    try {
      console.log('[SearchService] ====== ITEM SEARCH DEBUG ======');
      console.log('[SearchService] Query:', query);
      console.log('[SearchService] Query length:', query?.length);

      if (!query || query.length < 1) {
        console.log('[SearchService] Query too short, returning empty array');
        return [];
      }

      console.log('[SearchService] Calling search_items_autocomplete RPC...');
      console.log('[SearchService] - Query:', query);
      console.log('[SearchService] - Active only: true');
      console.log('[SearchService] - Limit: 20');

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('search_items_autocomplete', {
        p_search_query: query,
        p_active_only: true,
        p_limit: 20
      });

      console.log('[SearchService] RPC response received');
      console.log('[SearchService] - Error:', error);
      console.log('[SearchService] - Data type:', typeof data);
      console.log('[SearchService] - Raw data:', JSON.stringify(data, null, 2));

      if (error) {
        console.error('[SearchService] Items search RPC error:', error);
        console.error('[SearchService] Error details:', JSON.stringify(error, null, 2));
        return [];
      }

      if (!data || !data.items) {
        console.log('[SearchService] No items found - data structure:', data);
        return [];
      }

      console.log('[SearchService] Items found:', data.items.length);

      interface RpcItemResult {
        id: string;
        name: string;
        packaging?: string;
      }
      const results = data.items.map((item: RpcItemResult) => ({
        label: item.name,
        value: item.id,
        detail: item.packaging,
        type: 'item' as const
      }));

      console.log('[SearchService] Mapped results:', results.length);
      if (results.length > 0) {
        console.log('[SearchService] First result:', results[0]);
      }
      console.log('[SearchService] ====================================');

      return results;
    } catch (error) {
      console.error('[SearchService] Exception in searchGRNItems:', error);
      console.error('[SearchService] Exception details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  // M3 Fix: Using executeRPC wrapper
  // Search dispatches by number using RPC
  // Updated 2026-01-03: Use get_dispatch_list_with_items which has correct filter structure
  async searchDispatches(query: string): Promise<SearchResult[]> {
    if (__DEV__) console.log('[SearchService] searchDispatches called with query:', query);
    if (!query || query.length < 1) {
      return [];
    }

    // Use get_dispatch_list_with_items RPC with disp_no filter (prefix matching)
    // This RPC supports: disp_no (string), disp_no_from, disp_no_to filters
    interface DispatchListResponse {
      dispatches: Array<{
        id: string;
        dispNo?: string;
        disp_no?: string;
        customerName?: string;
        customer_name?: string;
        dispDate?: string;
        disp_date?: string;
        dispatch_date?: string;
      }>;
    }

    if (__DEV__) console.log('[SearchService] Calling get_dispatch_list_with_items RPC with:', {
      p_filters: { disp_no: query },  // String for prefix match
      p_sort_by: 'disp_no',
      p_sort_order: 'asc',
      p_page: 1,
      p_limit: 20,
      p_include_items: false
    });

    const result = await executeRPC<DispatchListResponse, SearchResult[]>(
      getAuthenticatedClient,
      'get_dispatch_list_with_items',
      {
        p_filters: { disp_no: query },  // String for prefix match
        p_sort_by: 'disp_no',
        p_sort_order: 'asc',
        p_page: 1,
        p_limit: 20,
        p_include_items: false  // Don't need items for search results
      },
      {
        context: 'SearchService.searchDispatches',
        errorMessage: 'Failed to search dispatches',
        transform: (data) => {
          if (__DEV__) console.log('[SearchService] searchDispatches raw response:', JSON.stringify(data, null, 2).slice(0, 1000));
          const dispatches = Array.isArray(data?.dispatches) ? data.dispatches : [];
          if (__DEV__) console.log('[SearchService] searchDispatches dispatches count:', dispatches.length);
          return dispatches.map((dispatch: Record<string, unknown>) => {
            // Handle both camelCase and snake_case field names
            const dispNo = dispatch.dispNo || dispatch.disp_no || '';
            const customerName = dispatch.customerName || dispatch.customer_name || '';
            const dispDate = dispatch.dispDate || dispatch.disp_date || dispatch.dispatch_date || '';
            return {
              label: `#${dispNo}`,
              value: dispatch.id as string,
              detail: `${customerName} • ${dispDate ? new Date(dispDate as string).toLocaleDateString() : ''}`,
              type: 'dispatch' as const
            };
          });
        }
      }
    );

    if (__DEV__) console.log('[SearchService] searchDispatches result:', { success: result.success, dataLength: result.data?.length, message: result.message });

    return result.success && result.data ? result.data : [];
  }

  // M3 Fix: Using executeRPC wrapper
  // Search GRN numbers using RPC
  async searchGRNNumbers(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 1) {
      return [];
    }

    // Use get_grn_list RPC with gr_no filter
    // Use wide date range to search all GRNs
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 2);
    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

    interface GRNListResponse {
      grns: Array<{
        id: string;
        gr_no: string;
        customer_name: string;
        date: string;
      }>;
    }

    // Note: searchGRNNumbers uses getSupabaseClient (not authenticated) for wider search
    const getClient = async () => getSupabaseClient();

    const result = await executeRPC<GRNListResponse, SearchResult[]>(
      getClient,
      'get_grn_list',
      {
        p_date_from: oneYearAgo.toISOString().split('T')[0],
        p_date_to: oneYearAhead.toISOString().split('T')[0],
        p_sort_by: 'gr_no',
        p_sort_order: 'asc',
        p_limit: 20,
        p_offset: 0,
        p_filters: { gr_no: query }
      },
      {
        context: 'SearchService.searchGRNNumbers',
        errorMessage: 'Failed to search GRN numbers',
        transform: (data) => {
          const grns = Array.isArray(data?.grns) ? data.grns : [];
          return grns.map((grn) => ({
            label: grn.gr_no,
            value: grn.id,
            detail: `${grn.customer_name} • ${new Date(grn.date).toLocaleDateString()}`,
            type: 'grn' as const
          }));
        }
      }
    );

    return result.success && result.data ? result.data : [];
  }

  // Combined search for multiple types
  async searchAll(query: string): Promise<{
    customers: SearchResult[];
    items: SearchResult[];
    dispatches: SearchResult[];
    grnNumbers: SearchResult[];
  }> {
    try {
      const [customers, items, dispatches, grnNumbers] = await Promise.all([
        this.searchCustomers(query),
        this.searchGRNItems(query),
        this.searchDispatches(query),
        this.searchGRNNumbers(query)
      ]);

      return {
        customers,
        items,
        dispatches,
        grnNumbers
      };
    } catch (error) {
      console.error('[SearchService] Exception in searchAll:', error);
      return {
        customers: [],
        items: [],
        dispatches: [],
        grnNumbers: []
      };
    }
  }
}

export const searchService = new SearchService();