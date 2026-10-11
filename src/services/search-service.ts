import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

import { formatDate, toLocalISODate } from '@/utils/formatters';
import { t } from '@/i18n';
import { createLogger, loggableError } from '@/utils/logger';

// Identifiers, counts and error codes only: what is typed into a search and
// what the server answers (names, mobile numbers, cities) are never logged.
const log = createLogger('search');
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
      if (!query || query.length < 1) {
        return [];
      }

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient
        .rpc('search_customers', {
          p_search_query: query,
          p_limit: 20
        });

      if (error) {
        log.error('searchCustomers error', loggableError(error));
        return [];
      }

      // Handle wrapped response format: { data: [...], message, success }
      const customerData = Array.isArray(data) ? data : (data?.data || []);

      if (!customerData || customerData.length === 0) {
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

      log.debug('searchCustomers', { results: results.length });

      return results;
    } catch (error) {
      log.error('Exception in searchCustomers', loggableError(error));
      return [];
    }
  }

  // Search items catalog by name or packaging
  async searchGRNItems(query: string): Promise<SearchResult[]> {
    try {
      if (!query || query.length < 1) {
        return [];
      }

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('search_items_autocomplete', {
        p_search_query: query,
        p_active_only: true,
        p_limit: 20
      });

      if (error) {
        log.error('searchGRNItems error', loggableError(error));
        return [];
      }

      if (!data || !data.items) {
        return [];
      }

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

      log.debug('searchGRNItems', { results: results.length });

      return results;
    } catch (error) {
      log.error('Exception in searchGRNItems', loggableError(error));
      return [];
    }
  }

  // M3 Fix: Using executeRPC wrapper
  // Search dispatches by number using RPC
  // Updated 2026-01-03: Use get_dispatch_list_with_items which has correct filter structure
  async searchDispatches(query: string): Promise<SearchResult[]> {
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
        errorMessage: t('errors.dispatch.searchFailed'),
        transform: (data) => {
          const dispatches = Array.isArray(data?.dispatches) ? data.dispatches : [];
          return dispatches.map((dispatch: Record<string, unknown>) => {
            // Handle both camelCase and snake_case field names
            const dispNo = dispatch.dispNo || dispatch.disp_no || '';
            const customerName = dispatch.customerName || dispatch.customer_name || '';
            const dispDate = dispatch.dispDate || dispatch.disp_date || dispatch.dispatch_date || '';
            return {
              label: `#${dispNo}`,
              value: dispatch.id as string,
              detail: `${customerName} • ${dispDate ? formatDate(dispDate as string) : ''}`,
              type: 'dispatch' as const
            };
          });
        }
      }
    );

    log.debug('searchDispatches', { success: result.success, results: result.data?.length ?? 0 });

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

    const result = await executeRPC<GRNListResponse, SearchResult[]>(
      getAuthenticatedClient,
      'get_grn_list',
      {
        p_date_from: toLocalISODate(oneYearAgo),
        p_date_to: toLocalISODate(oneYearAhead),
        p_sort_by: 'gr_no',
        p_sort_order: 'asc',
        p_limit: 20,
        p_offset: 0,
        p_filters: { gr_no: query }
      },
      {
        context: 'SearchService.searchGRNNumbers',
        errorMessage: t('errors.grn.searchNumbersFailed'),
        transform: (data) => {
          const grns = Array.isArray(data?.grns) ? data.grns : [];
          return grns.map((grn) => ({
            label: grn.gr_no,
            value: grn.id,
            detail: `${grn.customer_name} • ${formatDate(grn.date)}`,
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
      log.error('Exception in searchAll', loggableError(error));
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