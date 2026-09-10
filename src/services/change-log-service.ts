import { getSupabaseClient, getAuthenticatedClient } from '@/config/supabaseConfig';
import { ChangeLogResponse, ChangeLogEntry } from '@/types/order.types';
// M3 Fix: Using executeRPC wrapper - Note: All methods in this service have extensive
// debug logging and custom response structures (EnhancedChangeLogResponse) that require
// the manual RPC pattern. Imports retained for consistency and future use.
import { executeRPC, createErrorResponse } from '@/utils/serviceErrorHandler';

interface ServiceError {
  message: string;
  code?: string;
}

interface EnhancedChangeLogResponse {
  success: boolean;
  data: {
    changes: ChangeLogEntry[];
    pagination: {
      total_count: number;
      has_more: boolean;
      current_page: number;
      total_pages: number;
    };
    analytics?: {
      total_changes: number;
      breakdown: {
        item_changes: number;
        order_changes: number;
        dispatch_changes: number;
      };
      change_types: {
        quantity_updates: number;
        item_additions: number;
        item_removals: number;
      };
      activity_summary: {
        unique_editors: number;
        first_change: string;
        last_change: string;
        recent_changes_24h: number;
      };
    };
  };
  error?: ServiceError;
}

interface ChangeLogFilters {
  change_category?: 'item_level' | 'order_level' | 'dispatch_level';
  change_type?: string;
  date_from?: string;
  date_to?: string;
  changed_by?: string;
  include_analytics?: boolean;
}

export class ChangeLogService {
  /**
   * Get detailed item-level changes for debugging
   */
  static async getDetailedChanges(
    customerId: string
  ): Promise<{ itemChanges: ChangeLogEntry[], orderChanges: ChangeLogEntry[], dispatchChanges: ChangeLogEntry[] }> {
    try {
      console.log('[ChangeLogService] === FETCHING DETAILED CHANGES ===');
      
      // Get all changes without filter
      const allChangesResult = await this.getCustomerChangeLog(customerId, 100, 0);
      
      // Try to get item-level changes specifically
      const itemChangesResult = await this.getCustomerChangeLog(customerId, 100, 0, {
        change_category: 'item_level'
      });
      
      // Try to get order-level changes
      const orderChangesResult = await this.getCustomerChangeLog(customerId, 100, 0, {
        change_category: 'order_level'  
      });
      
      // Try to get dispatch-level changes
      const dispatchChangesResult = await this.getCustomerChangeLog(customerId, 100, 0, {
        change_category: 'dispatch_level'
      });
      
      console.log('[ChangeLogService] === DETAILED CHANGES SUMMARY ===');
      console.log('[ChangeLogService] All changes:', allChangesResult.data.changes.length);
      console.log('[ChangeLogService] Item changes:', itemChangesResult.data.changes.length);
      console.log('[ChangeLogService] Order changes:', orderChangesResult.data.changes.length);
      console.log('[ChangeLogService] Dispatch changes:', dispatchChangesResult.data.changes.length);
      
      return {
        itemChanges: itemChangesResult.data.changes,
        orderChanges: orderChangesResult.data.changes,
        dispatchChanges: dispatchChangesResult.data.changes
      };
    } catch (error) {
      console.error('[ChangeLogService] Error getting detailed changes:', error);
      return { itemChanges: [], orderChanges: [], dispatchChanges: [] };
    }
  }

  /**
   * Helper method to parse response data (handles both current and enhanced structures)
   */
  private static parseResponseData(data: Record<string, unknown>): EnhancedChangeLogResponse['data'] {
    const dataObj = data?.data as Record<string, unknown> | undefined;
    const isEnhancedStructure = !!(dataObj?.pagination);
    const changes = (dataObj?.changes as ChangeLogEntry[]) || [];
    const pagination = dataObj?.pagination as Record<string, unknown> | undefined;
    const totalCount = isEnhancedStructure ?
      (pagination?.total_count as number) :
      (dataObj?.total_count as number);
    const hasMore = isEnhancedStructure ?
      (pagination?.has_more as boolean) :
      (dataObj?.has_more as boolean);

    // Transform changes to ensure quantity_change is populated correctly
    const transformedChanges = changes.map((change: ChangeLogEntry) => {
      const transformed = { ...change };

      // If quantity_change is null but we have additional_details with quantity info, transform it
      const changeDetails = transformed.change_details as {
        quantity_change?: { previous_quantity: number; new_quantity: number; change_amount: number };
        additional_details?: { previous_qty?: number; new_qty?: number };
      } | undefined;

      if (!changeDetails?.quantity_change && changeDetails?.additional_details) {
        const additional = changeDetails.additional_details;
        if (additional.previous_qty !== undefined && additional.new_qty !== undefined) {
          changeDetails.quantity_change = {
            previous_quantity: additional.previous_qty,
            new_quantity: additional.new_qty,
            change_amount: additional.new_qty - additional.previous_qty
          };
        }
      }

      // Ensure change_id is populated for unique keys
      if (!transformed.change_id) {
        transformed.change_id = `${transformed.order_id}-${transformed.change_timestamp}-${transformed.change_type}`;
      }

      return transformed;
    });
    // Note: Previously filtered to only item_level, now showing all change categories
    // (order_level, dispatch_level, item_level)

    return {
      changes: transformedChanges,
      pagination: {
        total_count: totalCount || 0,
        has_more: hasMore || false,
        current_page: isEnhancedStructure ? (pagination?.current_page as number) || 1 : 1,
        total_pages: isEnhancedStructure ? (pagination?.total_pages as number) || 0 : 0
      },
      analytics: dataObj?.analytics as EnhancedChangeLogResponse['data']['analytics']
    };
  }
  /**
   * Get all change log entries for a specific customer
   * @param customerId - Customer UUID  
   * @param limit - Number of entries to fetch (default: 50)
   * @param offset - Offset for pagination (default: 0)
   * @param filters - Additional filters to apply
   */
  static async getCustomerChangeLog(
    customerId: string, 
    limit: number = 50, 
    offset: number = 0,
    filters?: ChangeLogFilters
  ): Promise<EnhancedChangeLogResponse> {
    try {
      // Build parameters dynamically to avoid null ambiguity
      const rpcParams: Record<string, unknown> = {};

      // Always include required parameters
      rpcParams.p_customer_id = customerId;
      rpcParams.p_limit = limit;
      rpcParams.p_offset = offset;
      
      // Only include optional parameters if they have values
      if (filters?.date_from) {
        rpcParams.p_date_from = filters.date_from;
      }
      if (filters?.date_to) {
        rpcParams.p_date_to = filters.date_to;
      }
      if (filters?.changed_by) {
        rpcParams.p_user_id = filters.changed_by;
      }
      
      console.log('[ChangeLogService] === DEBUGGING INFO ===');
      console.log('[ChangeLogService] Customer ID type:', typeof customerId);
      console.log('[ChangeLogService] Limit type:', typeof limit);
      console.log('[ChangeLogService] Offset type:', typeof offset);
      console.log('[ChangeLogService] Parameters being sent:', Object.keys(rpcParams));
      
      console.log('[ChangeLogService] === RPC CALL START ===');
      console.log('[ChangeLogService] Function:', 'get_order_change_log');
      console.log('[ChangeLogService] Parameters:', JSON.stringify(rpcParams, null, 2));
      console.log('[ChangeLogService] Timestamp:', new Date().toISOString());

      // The function has DEFAULT values for all parameters, so we only need to pass what we need
      // Only pass the parameters we actually want to use
      const rpcCall: Record<string, unknown> = {};

      // Only add parameters that have actual values
      if (customerId) rpcCall.p_customer_id = customerId;
      if (filters?.date_from) rpcCall.p_date_from = filters.date_from;
      if (filters?.date_to) rpcCall.p_date_to = filters.date_to;
      if (filters?.changed_by) rpcCall.p_user_id = filters.changed_by;
      if (filters?.change_type) rpcCall.p_change_type = filters.change_type;
      if (filters?.change_category) rpcCall.p_change_category = filters.change_category;
      
      // Always include limit and offset
      rpcCall.p_limit = limit;
      rpcCall.p_offset = offset;
      
      console.log('[ChangeLogService] RPC call parameters:', JSON.stringify(rpcCall, null, 2));
      console.log('[ChangeLogService] Calling get_order_change_log...');

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('get_order_change_log', rpcCall);
      
      console.log('[ChangeLogService] === RPC RESPONSE ===');
      console.log('[ChangeLogService] Raw data:', JSON.stringify(data, null, 2));
      console.log('[ChangeLogService] Raw error:', JSON.stringify(error, null, 2));
      console.log('[ChangeLogService] Data type:', typeof data);
      console.log('[ChangeLogService] Error type:', typeof error);
      console.log('[ChangeLogService] Has data:', !!data);
      console.log('[ChangeLogService] Has error:', !!error);
      if (error) {
        console.log('[ChangeLogService] Error code:', error.code);
        console.log('[ChangeLogService] Error message:', error.message);
        console.log('[ChangeLogService] Error hint:', error.hint);
      }
      console.log('[ChangeLogService] === RPC CALL END ===');

      if (error) {
        console.error('[ChangeLogService] RPC error:', error);
        return {
          success: false,
          data: {
            changes: [],
            pagination: {
              total_count: 0,
              has_more: false,
              current_page: 1,
              total_pages: 0
            }
          },
          error: {
            message: error.message || 'Failed to fetch customer change log',
            code: error.code || 'RPC_ERROR'
          }
        };
      }

      console.log('[ChangeLogService] === PARSED RESPONSE ===');
      console.log('[ChangeLogService] data?.success:', data?.success);
      
      const parsedData = this.parseResponseData(data);
      
      console.log('[ChangeLogService] data?.data structure:', {
        hasChanges: !!parsedData.changes.length,
        changesLength: parsedData.changes.length,
        hasPagination: !!data?.data?.pagination,
        hasAnalytics: !!parsedData.analytics
      });
      
      if (parsedData.changes.length > 0) {
        console.log('[ChangeLogService] First change entry sample:', JSON.stringify(parsedData.changes[0], null, 2));
        
        // Log details about each change to understand what's missing
        console.log('[ChangeLogService] === CHANGE DETAILS ANALYSIS ===');
        parsedData.changes.forEach((change, index) => {
          console.log(`[ChangeLogService] Change ${index + 1}:`, {
            change_id: change.change_id,
            change_category: change.change_category,
            change_type: change.change_type,
            has_item_name: !!change.item_name,
            has_grn_no: !!change.grn_no,
            has_package_mark: !!change.package_mark,
            has_item_details: !!change.change_details?.item_details,
            has_quantity_change: !!change.change_details?.quantity_change,
            has_stock_info: !!change.change_details?.stock_info,
            action: change.change_details?.action,
            raw_change_details: JSON.stringify(change.change_details)
          });
        });
        console.log('[ChangeLogService] === END CHANGE DETAILS ANALYSIS ===');
      }
      
      if (parsedData.analytics) {
        console.log('[ChangeLogService] Analytics data:', JSON.stringify(parsedData.analytics, null, 2));
      }
      
      console.log('[ChangeLogService] Customer change log fetched successfully:', {
        entriesCount: parsedData.changes.length,
        totalCount: parsedData.pagination.total_count,
        hasMore: parsedData.pagination.has_more,
        hasAnalytics: !!parsedData.analytics
      });

      const finalResponse = {
        success: data?.success || false,
        data: parsedData
      };
      
      console.log('[ChangeLogService] Final service response:', JSON.stringify(finalResponse, null, 2));
      console.log('[ChangeLogService] === RESPONSE PROCESSING COMPLETE ===');
      
      return finalResponse;
    } catch (error) {
      console.error('[ChangeLogService] Exception in getCustomerChangeLog:', error);
      return {
        success: false,
        data: {
          changes: [],
          pagination: {
            total_count: 0,
            has_more: false,
            current_page: 1,
            total_pages: 0
          }
        },
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'EXCEPTION_ERROR'
        }
      };
    }
  }

  /**
   * Get change log entries for a specific order
   * @param orderId - Order UUID
   * @param limit - Number of entries to fetch (default: 50)
   */
  static async getOrderChangeLog(
    orderId: string, 
    limit: number = 50
  ): Promise<EnhancedChangeLogResponse> {
    try {
      console.log('[ChangeLogService] Fetching order change log:', { orderId, limit });

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('get_order_change_log', {
        p_order_id: orderId,
        p_limit: limit,
        p_offset: 0
      });

      if (error) {
        console.error('[ChangeLogService] RPC error:', error);
        return {
          success: false,
          data: {
            changes: [],
            pagination: {
              total_count: 0,
              has_more: false,
              current_page: 1,
              total_pages: 0
            }
          },
          error: {
            message: error.message || 'Failed to fetch order change log',
            code: error.code || 'RPC_ERROR'
          }
        };
      }

      const parsedData = this.parseResponseData(data);
      
      console.log('[ChangeLogService] Order change log fetched successfully:', {
        entriesCount: parsedData.changes.length,
        totalCount: parsedData.pagination.total_count,
        hasMore: parsedData.pagination.has_more
      });

      return {
        success: data?.success || false,
        data: parsedData
      };
    } catch (error) {
      console.error('[ChangeLogService] Exception in getOrderChangeLog:', error);
      return {
        success: false,
        data: {
          changes: [],
          pagination: {
            total_count: 0,
            has_more: false,
            current_page: 1,
            total_pages: 0
          }
        },
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'EXCEPTION_ERROR'
        }
      };
    }
  }

  /**
   * Get recent change log entries for a customer within a date range
   * @param customerId - Customer UUID
   * @param dateFrom - Start date (ISO string)
   * @param dateTo - End date (ISO string)
   * @param limit - Number of entries to fetch (default: 50)
   * @param offset - Offset for pagination (default: 0)
   */
  static async getRecentChanges(
    customerId: string,
    dateFrom: string,
    dateTo: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<EnhancedChangeLogResponse> {
    try {
      console.log('[ChangeLogService] Fetching recent changes:', { 
        customerId, 
        dateFrom, 
        dateTo, 
        limit, 
        offset 
      });

      const rpcParams: Record<string, unknown> = {
        p_customer_id: customerId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_limit: limit,
        p_offset: offset
      };

      // Get authenticated client with JWT tokens
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('get_order_change_log', rpcParams);

      if (error) {
        console.error('[ChangeLogService] RPC error:', error);
        return {
          success: false,
          data: {
            changes: [],
            pagination: {
              total_count: 0,
              has_more: false,
              current_page: 1,
              total_pages: 0
            }
          },
          error: {
            message: error.message || 'Failed to fetch recent changes',
            code: error.code || 'RPC_ERROR'
          }
        };
      }

      const parsedData = this.parseResponseData(data);
      
      console.log('[ChangeLogService] Recent changes fetched successfully:', {
        entriesCount: parsedData.changes.length,
        totalCount: parsedData.pagination.total_count,
        hasMore: parsedData.pagination.has_more
      });

      return {
        success: data?.success || false,
        data: parsedData
      };
    } catch (error) {
      console.error('[ChangeLogService] Exception in getRecentChanges:', error);
      return {
        success: false,
        data: {
          changes: [],
          pagination: {
            total_count: 0,
            has_more: false,
            current_page: 1,
            total_pages: 0
          }
        },
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'EXCEPTION_ERROR'
        }
      };
    }
  }
}

// ============================================================
// Named Function Exports (Issue #7)
// Provides consistent API with other services
// ============================================================

/** Get detailed item-level changes for debugging */
export const getDetailedChanges = ChangeLogService.getDetailedChanges.bind(ChangeLogService);

/** Get change log entries for a customer with filters */
export const getCustomerChangeLog = ChangeLogService.getCustomerChangeLog.bind(ChangeLogService);

/** Get change log entries for a specific order */
export const getOrderChangeLog = ChangeLogService.getOrderChangeLog.bind(ChangeLogService);

/** Get recent change log entries for a customer within a date range */
export const getRecentChanges = ChangeLogService.getRecentChanges.bind(ChangeLogService);

// Default export maintained for backward compatibility
export default ChangeLogService;