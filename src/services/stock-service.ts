import {
  getSupabaseClient,
  getAuthenticatedClient,
  getStoredToken,
} from '@/config/supabaseConfig';
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
  SortOrder,
} from '@/types/stock.types';
import { hasMoreItems } from '@/utils/paginationUtils';
import { executeRPC, createErrorResponse, handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { deduplicatedRequest, generateRequestKey } from '@/utils/requestDedup';
import { localizeDigits, t } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('StockService');

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

/** What get_item_wise_stock_list can sort by (backend migration 52). */
export type ItemStockSortBy = 'item_name' | 'total_stock' | 'total_qty' | 'grn_count';
export type ItemStockSortOrder = 'asc' | 'desc';

export interface GetItemWiseStockListOptions {
  /** Filter by customer ID */
  customerId?: string;
  /** Search query for item name */
  searchQuery?: string;
  /** Maximum number of items to return (default: 50) */
  limit?: number;
  /** Number of items to skip (default: 0) */
  offset?: number;
  /**
   * The order the server pages the items in (backend migration 52). Left out,
   * nothing is sent and the server keeps its own order, item name A to Z.
   */
  sortBy?: ItemStockSortBy;
  sortOrder?: ItemStockSortOrder;
}

/** Totals over every item the customer and search leave, whatever page was asked for (migration 52). */
export interface ItemStockSummary {
  total_stock: number;
  total_qty: number;
  item_count: number;
}

/**
 * The facilities whose get_item_wise_stock_list refused the two sort parameters
 * (a backend older than migration 52), by origin and instance. Their later
 * calls go without the parameters at once instead of failing first. Kept for
 * the app's run: a facility that is upgraded is asked with them again after a
 * restart.
 */
const facilitiesWithoutItemSort = new Set<string>();
/**
 * The facility in use, by its origin and its instance: what a capability of one
 * facility is remembered under (here, and the report PDFs in useReportExport),
 * so that an instance replacing another at the same origin is asked afresh.
 * '' when no facility is chosen.
 */
export const facilityKey = (): string => {
  const server = getActiveOperatorServer();
  return server ? `${server.origin}|${server.instanceId}` : '';
};
/** Forget which facilities could not sort the item list (tests). */
export const forgetItemSortSupport = (): void => facilitiesWithoutItemSort.clear();

/**
 * True when PostgREST found no get_item_wise_stock_list that takes the
 * parameters sent: PGRST202 "Could not find the function ... in the schema
 * cache" (the database itself says 42883 "function ... does not exist").
 */
function lacksSortParameters(result: { error?: string; errorCode?: string }): boolean {
  const message = (result.error ?? '').toLowerCase();
  if (result.errorCode === 'PGRST202' || message.includes('could not find the function')) return true;
  return message.includes('get_item_wise_stock_list') && (result.errorCode === '42883' || message.includes('does not exist'));
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The summary when the answer has a complete one; an older backend sends none. */
function readItemStockSummary(value: unknown): ItemStockSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const totalStock = finiteNumber(raw.total_stock);
  const totalQty = finiteNumber(raw.total_qty);
  const itemCount = finiteNumber(raw.item_count);
  if (totalStock === undefined || totalQty === undefined || itemCount === undefined) return undefined;
  return { total_stock: totalStock, total_qty: totalQty, item_count: itemCount };
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
          message: t('errors.customer.invalidId'),
          error: 'INVALID_CUSTOMER_ID',
        };
      }

      // IMPORTANT FIX: Only send parameters with actual values
      // PostgreSQL RPC functions treat explicitly passed NULL differently than omitted parameters
      // When we send p_date_filter: null explicitly, it may trigger different logic than omitting it
      const rpcParams: Record<string, any> = {
        p_customer_id: customerId,
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

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();

      // Using v2: Filters at GRN receipt level (only counts GRNs with remaining stock)
      const { data, error } = await authenticatedClient.rpc(
        'get_customer_stock_analysis_v2',
        rpcParams
      );

      // LOG RAW RPC RESPONSE

      if (error) {
        console.error('[StockService] RPC error:', error);
        handleGlobalAuthError(error);
        return {
          success: false,
          message: serverText(error.message, t('errors.stock.analysisFailed')),
          error: error.code,
        };
      }

      if (!data?.success) {
        handleGlobalAuthError(data);
        return {
          success: false,
          message: serverText(data?.message, t('errors.stock.analysisFailed')),
          error: 'API_ERROR',
        };
      }

      return {
        success: true,
        message: serverText(data.message, t('errors.stock.analysisRetrieved')),
        data: data.data,
      };
    } catch (error) {
      console.error(
        '[StockService] Exception in getCustomerStockAnalysis:',
        error
      );
      return createErrorResponse(
        error,
        t('errors.stock.analysisFailed'),
        'StockService.getCustomerStockAnalysis'
      );
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
      // Build parameters - only include non-null values
      const rpcParams: Record<string, any> = {
        p_customer_id: String(customerId),
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: Number(limit),
        p_offset: Number(offset),
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

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc(
        'get_customer_grn_items',
        rpcParams
      );

      if (error) {
        console.error('[StockService] RPC error:', error);
        return {
          success: false,
          message: serverText(error.message, t('errors.grn.fetchItemsFailed')),
          error: error.code,
        };
      }

      if (!data?.success) {
        return {
          success: false,
          message: serverText(data?.message, t('errors.grn.fetchItemsFailed')),
          error: 'API_ERROR',
        };
      }

      return {
        success: true,
        message: serverText(data.message, t('errors.grn.itemsRetrieved')),
        data: data.data,
      };
    } catch (error) {
      console.error('[StockService] Exception in getCustomerGRNItems:', error);
      return createErrorResponse(
        error,
        t('errors.grn.fetchItemsFailed'),
        'StockService.getCustomerGRNItems'
      );
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
      const { data: customersData, error: customersError } =
        await authenticatedClient.rpc('search_customers', {
          p_limit: 1000, // Get all customers, we'll paginate client-side
          p_search_query: searchQuery || '',
        });

      if (customersError) {
        console.error(
          '[StockService] Failed to fetch customers:',
          customersError
        );
        return {
          success: false,
          message: t('errors.customer.fetchListFailed'),
          error: customersError.message,
        };
      }

      if (!customersData || !Array.isArray(customersData)) {
        return {
          success: false,
          message: t('errors.customer.noDataReturned'),
          error: 'EMPTY_RESPONSE',
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
      const customers: CustomerListItem[] = customersData.map(
        (customer: RpcCustomerRow) => ({
          id: customer.id,
          name: customer.name,
          mobile: customer.mobile,
          city: customer.city,
          email: customer.email,
          address: customer.address,
        })
      );

      // Apply client-side pagination
      const total = customers.length;
      const paginatedCustomers = customers.slice(offset, offset + limit);
      const hasMore = hasMoreItems(offset, limit, total);

      return {
        success: true,
        message: t('errors.customer.foundCount', { count: total, total: localizeDigits(String(total)) }),
        data: {
          data: paginatedCustomers,
          pagination: {
            total,
            hasMore,
          },
        },
      };
    } catch (error) {
      console.error('[StockService] Exception in getCustomerList:', error);
      return createErrorResponse(
        error,
        t('errors.customer.fetchCustomerListFailed'),
        'StockService.getCustomerList'
      );
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
      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();

      // Get list of accessible customers with details using search_customers RPC
      // This returns full customer objects with id, name, mobile, etc.

      // Generate deduplication key for this request (PO9 fix)
      const dedupKey = generateRequestKey('getCustomersWithStock', {
        searchQuery,
        asOfDate: asOfDate?.toISOString(),
        inStockOnly,
        limit,
        offset,
      });

      // Use search_customers with an empty search query to get all accessible customers
      const { data: customersData, error: customersError } =
        await deduplicatedRequest(dedupKey, async () => {
          return authenticatedClient.rpc('search_customers', {
            p_search_query: searchQuery || '', // Pass search query or empty string for all
            p_limit: 20, // Fetch 20 customers to find some with stock
          });
        });

      if (customersError) {
        console.error(
          '[StockService] Error fetching customers:',
          customersError
        );
        return {
          success: false,
          message: serverText(customersError.message, t('errors.customer.fetchListFailed')),
          error: customersError.code,
        };
      }

      let customers = customersData || [];

      // Debug: Log first customer to check the structure
      if (customers.length > 0) {
        /* No action needed. */
      }

      // No need to apply search filter again - already filtered by RPC

      // If no pagination requested, process all customers (legacy behavior)
      if (!limit) {
        const stockPromises = customers.map(
          async (customer: {
            id?: string;
            name?: string;
            mobile?: string;
            email?: string;
            address?: string;
          }) => {
            try {
              // Validate customer ID exists
              if (!customer.id) {
                console.error('[StockService] Customer missing ID');
                return null;
              }

              const stockResult = await this.getCustomerStockAnalysis(
                customer.id,
                asOfDate,
                undefined, // no item filter
                inStockOnly // Filter to only in-stock items
              );

              if (stockResult.success && stockResult.data) {
                const aggregations = stockResult.data.aggregations;

                // Debug log the aggregations

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
                /* No action needed. */
              }
              return null;
            } catch (error) {
              console.error(
                `[StockService] Error analyzing customer ${customer.name}:`,
                error
              );
              return null;
            }
          }
        );

        const stockResults = await Promise.all(stockPromises);
        const customersWithStock = stockResults.filter(
          result => result !== null
        ) as CustomerStockSummary[];

        // Sort by total stock descending
        customersWithStock.sort(
          (a, b) => b.current_stock_qty - a.current_stock_qty
        );

        const response = {
          success: true,
          message: t('errors.customer.listRetrieved'),
          data: {
            data: customersWithStock,
            pagination: {
              total: customersWithStock.length,
              hasMore: false,
            },
          },
        };

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
      while (
        processedCount < customers.length &&
        customersWithStockCount < offset
      ) {
        const customer = customers[processedCount];
        processedCount++;

        // Validate customer ID exists
        if (!customer.id) {
          console.error(
            `[StockService] Customer missing ID at index ${processedCount - 1}`
          );
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
            }
          }
        } catch (error) {
          console.error(
            `[StockService] Error analyzing customer ${customer.name}:`,
            error
          );
        }
      }

      // Now collect the actual page of results
      while (
        processedCount < customers.length &&
        customersWithStock.length < limit
      ) {
        // Process in batches for better performance
        const batchEnd = Math.min(
          processedCount + BATCH_SIZE,
          customers.length
        );
        const batch = customers.slice(processedCount, batchEnd);

        const batchPromises = batch.map(
          async (customer: {
            id?: string;
            name?: string;
            mobile?: string;
            email?: string;
            address?: string;
          }) => {
            try {
              // Validate customer ID exists
              if (!customer.id) {
                console.error('[StockService] Customer missing ID in batch');
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
                /* No action needed. */
              }
              return null;
            } catch (error) {
              console.error(
                `[StockService] Error analyzing customer ${customer.name}:`,
                error
              );
              return null;
            }
          }
        );

        const batchResults = await Promise.all(batchPromises);
        const batchWithStock = batchResults.filter(
          result => result !== null
        ) as CustomerStockSummary[];

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
      paginatedResults.sort(
        (a, b) => b.current_stock_qty - a.current_stock_qty
      );

      const hasMore =
        processedCount < customers.length || customersWithStock.length > limit;

      const response = {
        success: true,
        message: t('errors.customer.listRetrieved'),
        data: {
          data: paginatedResults,
          pagination: {
            total: customers.length,
            hasMore,
          },
        },
      };

      return response;
    } catch (error) {
      console.error(
        '[StockService] Exception in getCustomersWithStock:',
        error
      );
      return createErrorResponse(
        error,
        t('errors.customer.fetchWithStockFailed'),
        'StockService.getCustomersWithStock'
      );
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
      // Use the main method with search query (no pagination for search)
      return await this.getCustomersWithStock({ searchQuery, asOfDate });
    } catch (error) {
      console.error(
        '[StockService] Exception in searchCustomersWithStock:',
        error
      );
      return createErrorResponse(
        error,
        t('errors.customer.searchFailed'),
        'StockService.searchCustomersWithStock'
      );
    }
  }

  /**
   * Get item-wise stock list for a customer
   * M3 Fix: Demonstrates executeRPC usage pattern
   * PR20 Fix: Uses options object instead of positional parameters
   *
   * With `sortBy`/`sortOrder` the server sorts before it pages and answers with
   * `summary`, totals over the whole filtered list (backend migration 52). A
   * backend without migration 52 refuses the two parameters (PGRST202): the
   * call is then made again without them, `sortApplied` is false (the items
   * are in item-name order) and there is no `summary`. That facility's later
   * calls leave the parameters out at once. That refusal is how the app finds
   * out, so it is one info line, not an error in the log; any other failure is
   * logged as an error as it always was.
   *
   * @param options - Options for fetching item-wise stock list
   */
  static async getItemWiseStockList(
    options: GetItemWiseStockListOptions = {}
  ): Promise<
    StockServiceResponse<{
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
      /** Totals of the whole filtered list; missing from a backend without migration 52. */
      summary?: ItemStockSummary;
      /** False when a sort was asked for and the server could not apply it. */
      sortApplied?: boolean;
    }>
  > {
    const { customerId, searchQuery, limit = 50, offset = 0, sortBy, sortOrder } = options;

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
      summary?: unknown;
    }

    const baseParams = {
      p_customer_id: customerId || null,
      p_search_query: searchQuery || null,
      p_limit: limit,
      p_offset: offset,
    };
    const call = (params: Record<string, unknown>, getClient: () => Promise<unknown> = getAuthenticatedClient) =>
      executeRPC<RawItemData>(getClient, 'get_item_wise_stock_list', params, {
        context: 'StockService.getItemWiseStockList',
        errorMessage: t('errors.stock.itemWiseFailed'),
      });

    // The first call to a facility sends the sort parameters. A server without
    // migration 52 refuses them (PGRST202), which is the expected way to find
    // that out, not a fault: that one answer is taken off the client's reply
    // before executeRPC can log it as an error. It still comes back as a failed
    // result, so the retry below runs. Every other answer, and every exception,
    // reaches executeRPC untouched and is logged there as before.
    let serverHasNoSort = false;
    const sortProbeClient = async () => {
      const client = await getAuthenticatedClient();
      return {
        rpc: async (name: string, args: Record<string, unknown>) => {
          const answer = await client.rpc(name, args);
          if (answer.error && lacksSortParameters({ error: answer.error.message, errorCode: answer.error.code })) {
            serverHasNoSort = true;
            return { data: { success: false, error: answer.error.message }, error: null };
          }
          return answer;
        },
      };
    };

    const wantsSort = sortBy !== undefined || sortOrder !== undefined;
    const facility = facilityKey();
    let sortApplied = true;
    let result: Awaited<ReturnType<typeof call>>;
    if (wantsSort && !facilitiesWithoutItemSort.has(facility)) {
      result = await call({ ...baseParams, p_sort_by: sortBy ?? 'item_name', p_sort_order: sortOrder ?? 'asc' }, sortProbeClient);
      if (!result.success && (serverHasNoSort || lacksSortParameters(result))) {
        facilitiesWithoutItemSort.add(facility);
        // Once per facility per run: later calls to it leave the parameters out at once.
        logger.info('[StockService.getItemWiseStockList] This server cannot sort the item list; asking again without the sort.');
        result = await call(baseParams);
        sortApplied = false;
      }
    } else {
      result = await call(baseParams);
      sortApplied = !wantsSort;
    }

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    // Keep snake_case from raw response to match ItemWiseStockItem interface
    const rawData = result.data as RawItemData;
    const items = (rawData.items || []).map(
      (item: RawItemData['items'][0]) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        packaging: item.packaging || undefined,
        total_qty: item.total_qty,
        total_stock: item.total_stock,
        grn_count: item.grn_count,
      })
    );

    const totalCount = rawData.total_count || 0;

    return {
      success: true,
      message: t('errors.stock.itemWiseRetrieved'),
      data: {
        items,
        pagination: {
          totalCount,
          hasMore: offset + items.length < totalCount,
          limit,
          offset,
        },
        summary: readItemStockSummary(rawData.summary),
        sortApplied,
      },
    };
  }
}

export default StockService;
