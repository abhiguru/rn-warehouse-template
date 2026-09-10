import { getSupabaseClient, getAuthenticatedClient, getStoredToken } from '@/config/supabaseConfig';
import {
  StockServiceResponse,
  StockAnalysisResponse,
  CustomerGRNItemsResponse,
  CustomerStockSummary,
  CustomersWithStockResponse,
  CustomerListItem,
  CustomerListResponse,
  SimplePagination,
  StockItemFilter,
  GRNItemFilter,
  StockSortBy,
  SortOrder
} from '@/types/stock.types';
import { hasMoreItems } from '@/utils/paginationUtils';
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';

// M3 Fix: Removed duplicate categorizeError function - now using centralized version from serviceErrorHandler.ts

// PR20 Fix: Options interfaces for functions with many parameters
export interface GetCustomersWithStockOptions {
  /** Search query for customer name */
  searchQuery?: string;
  /** Date to calculate stock position (defaults to now) */
  asOfDate?: Date;
  /** Filter to show only items with stock > 0 (default: true) */
  inStockOnly?: boolean;
  /** Maximum number of customers to return */
  limit?: number;
  /** Number of customers to skip (for pagination) */
  offset?: number;
}

export interface GetItemWiseStockListOptions {
  /** Filter by customer ID */
  customerId?: string;
  /** Search query for item name */
  searchQuery?: string;
  /** Maximum number of items to return (default: 50) */
  limit?: number;
  /** Number of items to skip (default: 0) */
  offset?: number;
}

export class StockService {
  /**
   * Get comprehensive stock analysis for a specific customer
   * @param customerId - Customer UUID
   * @param dateFilter - Optional date for historical analysis
   * @param itemFilter - Optional filter for items
   * @param inStockOnly - Filter to show only items with stock > 0 (default: true)
   */
  static async getCustomerStockAnalysis(
    customerId: string,
    dateFilter?: Date,
    itemFilter?: StockItemFilter,
    inStockOnly: boolean = true
  ): Promise<StockServiceResponse<StockAnalysisResponse>> {
    try {
      // Validate customer ID
      if (!customerId || customerId === 'undefined') {
        console.error('[StockService] Invalid customer ID:', customerId);
        return {
          success: false,
          message: 'Invalid customer ID',
          error: 'INVALID_CUSTOMER_ID'
        };
      }

      // IMPORTANT FIX: Only send parameters with actual values
      // PostgreSQL RPC functions treat explicitly passed NULL differently than omitted parameters
      // When we send p_date_filter: null explicitly, it may trigger different logic than omitting it
      const rpcParams: Record<string, any> = {
        p_customer_id: customerId
      };

      // Only add optional parameters if they have meaningful values
      if (dateFilter) {
        rpcParams.p_date_filter = dateFilter.toISOString();
      }

      // Only add in_stock_only if it's explicitly true (default behavior is false anyway)
      if (inStockOnly === true) {
        rpcParams.p_in_stock_only = true;
      }

      // Only add item_filter if it has actual filter criteria
      if (itemFilter && Object.keys(itemFilter).length > 0) {
        rpcParams.p_item_filter = itemFilter;
      }

      console.log('[StockService] Calling get_customer_stock_analysis_v2 with params:', {
        timestamp: new Date().toISOString(),
        customerId,
        paramKeys: Object.keys(rpcParams),
        dateFilter: dateFilter?.toISOString(),
        inStockOnly,
        hasItemFilter: !!(itemFilter && Object.keys(itemFilter).length > 0),
        rawParams: JSON.stringify(rpcParams)
      });

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();

      // Using v2: Filters at GRN receipt level (only counts GRNs with remaining stock)
      const { data, error } = await authenticatedClient.rpc('get_customer_stock_analysis_v2', rpcParams);

      // LOG RAW RPC RESPONSE
      console.log('[StockService] RAW RPC RESPONSE:', JSON.stringify({
        customerId,
        hasError: !!error,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        fullData: data,
        fullError: error
      }));

      if (error) {
        console.error('[StockService] RPC error:', error);
        return {
          success: false,
          message: error.message || 'Failed to fetch stock analysis',
          error: error.code
        };
      }

      if (!data?.success) {
        console.log('[StockService] RPC returned unsuccessful:', { data });
        return {
          success: false,
          message: data?.message || 'Failed to fetch stock analysis',
          error: 'API_ERROR'
        };
      }

      console.log('[StockService] RPC successful for customer:', {
        customerId,
        hasData: !!data.data,
        itemsLength: data.data?.items?.length || 0,
        aggregations: data.data?.aggregations,
        inStockOnly
      });

      return {
        success: true,
        message: data.message || 'Stock analysis retrieved successfully',
        data: data.data
      };
    } catch (error) {
      console.error('[StockService] Exception in getCustomerStockAnalysis:', error);
      return createErrorResponse(error, 'Failed to fetch stock analysis', 'StockService.getCustomerStockAnalysis');
    }
  }

  /**
   * Get detailed GRN items for a specific customer
   * @param customerId - Customer UUID
   * @param dateFrom - Optional start date filter
   * @param dateTo - Optional end date filter
   * @param filters - Optional filters
   * @param sortBy - Sort field
   * @param sortOrder - Sort order
   * @param limit - Page size
   * @param offset - Page offset
   */
  static async getCustomerGRNItems(
    customerId: string,
    dateFrom?: Date,
    dateTo?: Date,
    filters?: GRNItemFilter,
    sortBy: StockSortBy = 'date',
    sortOrder: SortOrder = 'desc',
    limit: number = 20,
    offset: number = 0
  ): Promise<StockServiceResponse<CustomerGRNItemsResponse>> {
    try {
      console.log('[StockService] Getting customer GRN items:', {
        customerId,
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        filters,
        sortBy,
        sortOrder,
        limit,
        offset
      });

      // Build parameters - only include non-null values
      const rpcParams: Record<string, any> = {
        p_customer_id: String(customerId),
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: Number(limit),
        p_offset: Number(offset)
      };

      // Only add optional date parameters if they have values
      if (dateFrom) {
        rpcParams.p_date_from = dateFrom.toISOString();
      }
      if (dateTo) {
        rpcParams.p_date_to = dateTo.toISOString();
      }

      // Only add filters if they have actual filter criteria
      if (filters && Object.keys(filters).length > 0) {
        rpcParams.p_filters = filters;
      }

      console.log('[StockService] Calling get_customer_grn_items with params:', {
        timestamp: new Date().toISOString(),
        paramsKeys: Object.keys(rpcParams),
        rawParams: JSON.stringify(rpcParams)
      });

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('get_customer_grn_items', rpcParams);

      if (error) {
        console.error('[StockService] RPC error:', error);
        return {
          success: false,
          message: error.message || 'Failed to fetch GRN items',
          error: error.code
        };
      }

      if (!data?.success) {
        return {
          success: false,
          message: data?.message || 'Failed to fetch GRN items',
          error: 'API_ERROR'
        };
      }

      console.log('[StockService] GRN items retrieved:', {
        itemCount: data.data?.items?.length || 0,
        total: data.data?.pagination?.total || 0,
        hasMore: data.data?.pagination?.hasMore || false
      });

      return {
        success: true,
        message: data.message || 'GRN items retrieved successfully',
        data: data.data
      };
    } catch (error) {
      console.error('[StockService] Exception in getCustomerGRNItems:', error);
      return createErrorResponse(error, 'Failed to fetch GRN items', 'StockService.getCustomerGRNItems');
    }
  }

  /**
   * Calculate current financial year based on current date
   * Financial year runs from April 1 to March 31
   */
  static getCurrentFinancialYear(): number {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-based (0 = January)

    // If current month is April (3) or later, FY is current year
    // If current month is before April, FY is previous year
    return currentMonth >= 3 ? currentYear : currentYear - 1;
  }

  /**
   * Get simple list of customers (no stock data)
   * Fast, lightweight method that returns just customer information
   * Use this for initial customer list display, then fetch stock data on-demand
   *
   * @param searchQuery - Optional text to filter customer names/mobile/email
   * @param limit - Maximum number of customers to return (default: 20)
   * @param offset - Number of customers to skip (default: 0)
   */
  static async getCustomerList(
    searchQuery?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<StockServiceResponse<CustomerListResponse>> {
    try {
      const authenticatedClient = await getAuthenticatedClient();

      // Call search_customers RPC to get simple customer list
      // RPC expects: p_limit and p_search_query parameters
      const { data: customersData, error: customersError } = await authenticatedClient
        .rpc('search_customers', {
          p_limit: 1000, // Get all customers, we'll paginate client-side
          p_search_query: searchQuery || ''
        });

      if (customersError) {
        console.error('[StockService] Failed to fetch customers:', customersError);
        return {
          success: false,
          message: 'Failed to fetch customers',
          error: customersError.message
        };
      }

      if (!customersData || !Array.isArray(customersData)) {
        return {
          success: false,
          message: 'No customer data returned',
          error: 'EMPTY_RESPONSE'
        };
      }

      // Map RPC response to CustomerListItem format
      interface RpcCustomerRow {
        id: string;
        name: string;
        mobile?: string;
        city?: string;
        email?: string;
        address?: string;
      }
      const customers: CustomerListItem[] = customersData.map((customer: RpcCustomerRow) => ({
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        city: customer.city,
        email: customer.email,
        address: customer.address
      }));

      // Apply client-side pagination
      const total = customers.length;
      const paginatedCustomers = customers.slice(offset, offset + limit);
      const hasMore = hasMoreItems(offset, limit, total);

      return {
        success: true,
        message: `Found ${total} customers`,
        data: {
          data: paginatedCustomers,
          pagination: {
            total,
            hasMore
          }
        }
      };
    } catch (error) {
      console.error('[StockService] Exception in getCustomerList:', error);
      return createErrorResponse(error, 'Failed to fetch customer list', 'StockService.getCustomerList');
    }
  }

  /**
   * Get list of customers with stock summary using individual customer analysis
   * @param options - Options for fetching customers with stock (PR20 fix)
   */
  static async getCustomersWithStock(
    options: GetCustomersWithStockOptions = {}
  ): Promise<StockServiceResponse<CustomersWithStockResponse>> {
    const {
      searchQuery,
      asOfDate,
      inStockOnly = true,
      limit,
      offset = 0,
    } = options;

    try {
      console.log('[StockService] Getting customers with stock - START', {
        searchQuery,
        asOfDate: asOfDate?.toISOString(),
        inStockOnly,
        limit,
        offset
      });

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();

      // Get list of accessible customers with details using search_customers RPC
      // This returns full customer objects with id, name, mobile, etc.
      console.log('[StockService] Fetching accessible customers via RPC');

      // Generate deduplication key for this request (PO9 fix)
      const dedupKey = generateRequestKey('getCustomersWithStock', {
        searchQuery, asOfDate: asOfDate?.toISOString(), inStockOnly, limit, offset
      });

      // Use search_customers with an empty search query to get all accessible customers
      const { data: customersData, error: customersError } = await deduplicatedRequest(dedupKey, async () => {
        return authenticatedClient.rpc('search_customers', {
          p_search_query: searchQuery || '',  // Pass search query or empty string for all
          p_limit: 20  // Fetch 20 customers to find some with stock
        });
      });

      if (customersError) {
        console.error('[StockService] Error fetching customers:', customersError);
        return {
          success: false,
          message: customersError.message || 'Failed to fetch customers',
          error: customersError.code
        };
      }

      let customers = customersData || [];
      console.log(`[StockService] Fetched ${customers.length} accessible customers`);

      // Debug: Log first customer to check the structure
      if (customers.length > 0) {
        console.log('[StockService] First customer structure:', {
          keys: Object.keys(customers[0]),
          sample: customers[0]
        });
      }

      // No need to apply search filter again - already filtered by RPC

      // If no pagination requested, process all customers (legacy behavior)
      if (!limit) {
        const stockPromises = customers.map(async (customer: { id?: string; name?: string; mobile?: string; email?: string; address?: string }) => {
          try {
            // Validate customer ID exists
            if (!customer.id) {
              console.error(`[StockService] Customer missing ID:`, customer);
              return null;
            }

            const stockResult = await this.getCustomerStockAnalysis(
              customer.id,
              asOfDate,
              undefined, // no item filter
              inStockOnly // Filter to only in-stock items
            );

            console.log(`[StockService] Stock result for ${customer.name}:`, {
              success: stockResult.success,
              hasData: !!stockResult.data,
              message: stockResult.message,
              inStockOnly
            });

            if (stockResult.success && stockResult.data) {
              const aggregations = stockResult.data.aggregations;

              // Debug log the aggregations
              console.log(`[StockService] Customer ${customer.name} aggregations:`, {
                itemCount: aggregations.itemCount,
                calculated_stock: aggregations.calculated_stock,
                total_grn_qty: aggregations.total_grn_qty,
                total_dispatch_qty: aggregations.total_dispatch_qty
              });

              // Only include customers who have stock data
              if (aggregations.itemCount > 0) {
                return {
                  customer_id: customer.id,
                  customer_name: customer.name,
                  mobile: customer.mobile,
                  email: customer.email,
                  address: customer.address,
                  current_stock_qty: aggregations.calculated_stock,
                  total_grn_qty: aggregations.total_grn_qty,
                  total_dispatch_qty: aggregations.total_dispatch_qty,
                  unique_items_count: aggregations.itemCount,
                  latest_grn_date: undefined, // Not available in this RPC
                  latest_dispatch_date: undefined, // Not available in this RPC
                } as CustomerStockSummary;
              }
            } else if (!stockResult.success) {
              console.log(`[StockService] Stock analysis failed for ${customer.name}:`, stockResult.message);
            }
            return null;
          } catch (error) {
            console.error(`[StockService] Error analyzing customer ${customer.name}:`, error);
            return null;
          }
        });

        const stockResults = await Promise.all(stockPromises);
        const customersWithStock = stockResults.filter(result => result !== null) as CustomerStockSummary[];

        // Sort by total stock descending
        customersWithStock.sort((a, b) => b.current_stock_qty - a.current_stock_qty);

        console.log(`[StockService] Stock analysis complete:`, {
          customersWithStock: customersWithStock.length,
          totalCustomers: customers.length,
          firstFewResults: customersWithStock.slice(0, 3).map(c => ({
            name: c.customer_name,
            stock: c.current_stock_qty,
            items: c.unique_items_count
          }))
        });

        const response = {
          success: true,
          message: 'Customers retrieved successfully',
          data: {
            data: customersWithStock,
            pagination: {
              total: customersWithStock.length,
              hasMore: false
            }
          }
        };

        console.log('[StockService] Non-paginated response summary:', {
          success: response.success,
          customersReturned: response.data.data.length,
          message: response.message
        });

        return response;
      }

      // Pagination logic: Batch processing approach
      // Since we filter AFTER analysis, we need to over-fetch from DB to ensure we get enough results
      const BATCH_SIZE = 20; // Analyze 20 customers at a time
      const customersWithStock: CustomerStockSummary[] = [];
      let processedCount = 0;
      let customersWithStockCount = 0;

      // Skip customers based on offset (offset is in terms of customers WITH stock)
      // We need to process customers until we've skipped 'offset' customers with stock
      while (processedCount < customers.length && customersWithStockCount < offset) {
        const customer = customers[processedCount];
        processedCount++;

        // Validate customer ID exists
        if (!customer.id) {
          console.error(`[StockService] Customer missing ID at index ${processedCount - 1}:`, customer);
          continue;
        }

        try {
          const stockResult = await this.getCustomerStockAnalysis(
            customer.id,
            asOfDate,
            undefined,
            inStockOnly
          );

          if (stockResult.success && stockResult.data) {
            const aggregations = stockResult.data.aggregations;
            if (aggregations.itemCount > 0) {
              customersWithStockCount++;
              console.log(`[StockService] Skip phase - found customer with stock: ${customer.name}, count: ${customersWithStockCount}/${offset}`);
            }
          }
        } catch (error) {
          console.error(`[StockService] Error analyzing customer ${customer.name}:`, error);
        }
      }

      // Now collect the actual page of results
      while (processedCount < customers.length && customersWithStock.length < limit) {
        // Process in batches for better performance
        const batchEnd = Math.min(processedCount + BATCH_SIZE, customers.length);
        const batch = customers.slice(processedCount, batchEnd);

        const batchPromises = batch.map(async (customer: { id?: string; name?: string; mobile?: string; email?: string; address?: string }) => {
          try {
            // Validate customer ID exists
            if (!customer.id) {
              console.error(`[StockService] Customer missing ID in batch:`, customer);
              return null;
            }

            const stockResult = await this.getCustomerStockAnalysis(
              customer.id,
              asOfDate,
              undefined,
              inStockOnly
            );

            if (stockResult.success && stockResult.data) {
              const aggregations = stockResult.data.aggregations;

              // Debug log for paginated version too
              console.log(`[StockService] Customer ${customer.name} aggregations (batch):`, {
                itemCount: aggregations.itemCount,
                calculated_stock: aggregations.calculated_stock,
                total_grn_qty: aggregations.total_grn_qty,
                total_dispatch_qty: aggregations.total_dispatch_qty
              });

              if (aggregations.itemCount > 0) {
                return {
                  customer_id: customer.id,
                  customer_name: customer.name,
                  mobile: customer.mobile,
                  email: customer.email,
                  address: customer.address,
                  current_stock_qty: aggregations.calculated_stock,
                  total_grn_qty: aggregations.total_grn_qty,
                  total_dispatch_qty: aggregations.total_dispatch_qty,
                  unique_items_count: aggregations.itemCount,
                  latest_grn_date: undefined,
                  latest_dispatch_date: undefined,
                } as CustomerStockSummary;
              }
            } else if (!stockResult.success) {
              console.log(`[StockService] Stock analysis failed for ${customer.name}:`, stockResult.message);
            }
            return null;
          } catch (error) {
            console.error(`[StockService] Error analyzing customer ${customer.name}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const batchWithStock = batchResults.filter(result => result !== null) as CustomerStockSummary[];

        customersWithStock.push(...batchWithStock);
        processedCount = batchEnd;

        // If we have enough results, stop processing
        if (customersWithStock.length >= limit) {
          break;
        }
      }

      // Trim to exact limit
      const paginatedResults = customersWithStock.slice(0, limit);

      // Sort by total stock descending
      paginatedResults.sort((a, b) => b.current_stock_qty - a.current_stock_qty);

      const hasMore = processedCount < customers.length || customersWithStock.length > limit;

      console.log(`[StockService] Paginated stock analysis complete:`, {
        customersFound: paginatedResults.length,
        offset,
        processedCount,
        totalCustomers: customers.length,
        hasMore,
        firstFewResults: paginatedResults.slice(0, 3).map(c => ({
          name: c.customer_name,
          stock: c.current_stock_qty,
          items: c.unique_items_count
        }))
      });

      const response = {
        success: true,
        message: 'Customers retrieved successfully',
        data: {
          data: paginatedResults,
          pagination: {
            total: customers.length,
            hasMore
          }
        }
      };

      console.log('[StockService] Final response summary:', {
        success: response.success,
        customersReturned: response.data.data.length,
        message: response.message
      });

      return response;
    } catch (error) {
      console.error('[StockService] Exception in getCustomersWithStock:', error);
      return createErrorResponse(error, 'Failed to fetch customers with stock', 'StockService.getCustomersWithStock');
    }
  }

  /**
   * Search customers with stock using the main method
   * @param searchQuery - Search query for customer name
   * @param asOfDate - Optional date to calculate stock position
   */
  static async searchCustomersWithStock(
    searchQuery: string,
    asOfDate?: Date
  ): Promise<StockServiceResponse<CustomersWithStockResponse>> {
    try {
      console.log('[StockService] Searching customers with stock:', searchQuery);

      // Use the main method with search query (no pagination for search)
      return await this.getCustomersWithStock({ searchQuery, asOfDate });
    } catch (error) {
      console.error('[StockService] Exception in searchCustomersWithStock:', error);
      return createErrorResponse(error, 'Failed to search customers', 'StockService.searchCustomersWithStock');
    }
  }

  /**
   * Get item-wise stock list for a customer
   * M3 Fix: Demonstrates executeRPC usage pattern
   * PR20 Fix: Uses options object instead of positional parameters
   *
   * @param options - Options for fetching item-wise stock list
   */
  static async getItemWiseStockList(
    options: GetItemWiseStockListOptions = {}
  ): Promise<StockServiceResponse<{
    items: Array<{
      item_id: string;
      item_name: string;
      packaging?: string;
      total_qty: number;
      total_stock: number;
      grn_count: number;
    }>;
    pagination: {
      totalCount: number;
      hasMore: boolean;
      limit: number;
      offset: number;
    };
  }>> {
    const {
      customerId,
      searchQuery,
      limit = 50,
      offset = 0,
    } = options;

    console.log('[StockService] Getting item-wise stock list:', { customerId, searchQuery, limit, offset });

    // M3 Fix: Using executeRPC wrapper for standardized error handling
    interface RawItemData {
      items: Array<{
        item_id: string;
        item_name: string;
        packaging?: string;
        total_qty: number;
        total_stock: number;
        grn_count: number;
      }>;
      total_count: number;
    }

    const result = await executeRPC<RawItemData>(
      getAuthenticatedClient,
      'get_item_wise_stock_list',
      {
        p_customer_id: customerId || null,
        p_search_query: searchQuery || null,
        p_limit: limit,
        p_offset: offset,
      },
      {
        context: 'StockService.getItemWiseStockList',
        errorMessage: 'Failed to fetch item-wise stock list',
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    // Keep snake_case from raw response to match ItemWiseStockItem interface
    const rawData = result.data as RawItemData;
    const items = (rawData.items || []).map((item: RawItemData['items'][0]) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      packaging: item.packaging || undefined,
      total_qty: item.total_qty,
      total_stock: item.total_stock,
      grn_count: item.grn_count,
    }));

    const totalCount = rawData.total_count || 0;

    return {
      success: true,
      message: 'Item-wise stock list retrieved',
      data: {
        items,
        pagination: {
          totalCount,
          hasMore: offset + items.length < totalCount,
          limit,
          offset,
        },
      },
    };
  }
}

export default StockService;