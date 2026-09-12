import {
  getSupabaseClient,
  getAuthenticatedClient,
} from '@/config/supabaseConfig';
import { getAuthToken, getRefreshToken } from '@/utils/authTokenUtils';
import {
  isJWTSignatureError,
  createErrorResponse,
  executeRPC,
} from '@/utils/serviceErrorHandler';
import { PAGINATION } from '@/config/cacheConfig';
import { store } from '@/store';
import { forceLogoutOnInvalidToken } from '@/store/slices/authSlice';
import {
  Order,
  OrderItem,
  OrderServiceResponse,
  GetOrCreateOrderResponse,
  AddToOrderResponse,
  CreateDispatchResponse,
  OrderSummary,
  OrderFilters,
  ItemFilters,
  GRNItem,
  Dispatch,
  EnhancedSearchFilters,
  EnhancedGRNItem,
  SearchMetadata,
  CustomerDispatchResponse,
} from '@/types/order.types';
// Import canonical types (snake_case) - fully migrated
import type {
  RpcOrderListItem,
  RpcOrderItemDetail,
  RpcEnhancedGrnItem,
  RpcSearchMetadata,
} from '@/types/rpc-canonical.types';

/**
 * Handle JWT signature errors by forcing logout
 * Call this whenever you detect a PGRST301/JWSInvalidSignature error
 */
function handleJWTError(error: unknown): void {
  if (isJWTSignatureError(error)) {
    console.warn('[OrderService] JWT signature invalid - forcing logout');
    store.dispatch(
      forceLogoutOnInvalidToken('JWT signature invalid. Please sign in again.')
    );
  }
}

// Order Service - Frontend uses "Order" terminology, backend uses "Cart"
export class OrderService {
  // Test connection to Supabase
  static async testConnection(): Promise<{
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    try {
      console.log('[OrderService] Testing Supabase connection...');

      // Test 1: Basic connectivity
      const startTime = Date.now();
      const { data, error } = await getSupabaseClient()
        .from('goodsreceived')
        .select('count')
        .limit(1);
      const endTime = Date.now();

      console.log('[OrderService] Connection test results:', {
        success: !error,
        responseTime: endTime - startTime,
        hasData: !!data,
        error: error?.message,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          details: {
            code: error.code,
            details: error.details,
            hint: error.hint,
          },
        };
      }

      // Test 2: Check session
      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      console.log('[OrderService] Session status:', {
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.session?.user,
        userId: sessionData?.session?.user?.id,
      });

      return {
        success: true,
        details: {
          responseTime: endTime - startTime,
          hasSession: !!sessionData?.session,
          userId: sessionData?.session?.user?.id,
        },
      };
    } catch (error) {
      console.error('[OrderService] Connection test failed:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Connection test failed',
        details: { originalError: error },
      };
    }
  }

  // Get or create order for a customer (perpetual cart model)
  static async getOrCreateOrder(
    customerId: string
  ): Promise<OrderServiceResponse<GetOrCreateOrderResponse>> {
    try {
      console.log('[OrderService] ========================================');
      console.log('[OrderService] GET OR CREATE ORDER - START');
      console.log('[OrderService] Customer ID:', customerId);

      if (!customerId) {
        console.error('[OrderService] ERROR: Missing customer ID');
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing parameter',
        };
      }

      // Check for JWT tokens using centralized utility
      console.log('[OrderService] Step 1: Checking for JWT tokens...');
      const authResult = await getAuthToken();
      const refreshToken = await getRefreshToken();

      console.log('[OrderService] JWT Token Status:', {
        hasAccessToken: !!authResult.token,
        tokenSource: authResult.source,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: authResult.token?.length || 0,
      });

      if (!authResult.token) {
        console.error('[OrderService] ERROR: No access token found');
        return {
          success: false,
          message: 'Authentication required - no access token',
          error: 'No JWT token in storage',
        };
      }

      // Get authenticated client (will handle JWT token from AsyncStorage)
      console.log('[OrderService] Step 2: Getting authenticated client...');
      const authenticatedClient = await getAuthenticatedClient();
      console.log('[OrderService] Authenticated client created successfully');

      // Make RPC call
      console.log('[OrderService] Step 3: Calling get_or_create_cart RPC...');
      console.log('[OrderService] RPC Parameters:', {
        p_customer_id: customerId,
      });

      const { data, error } = await authenticatedClient.rpc(
        'get_or_create_cart',
        {
          p_customer_id: customerId,
        }
      );

      console.log('[OrderService] Step 4: RPC call completed');

      console.log('[OrderService] RPC Response Details:', {
        hasError: !!error,
        hasData: !!data,
        dataType: typeof data,
        dataValue: JSON.stringify(data),
        errorDetails: error
          ? {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            }
          : null,
      });

      if (error) {
        console.error('[OrderService] ❌ RPC ERROR OCCURRED');
        console.error('[OrderService] Error Message:', error.message);
        console.error('[OrderService] Error Code:', error.code);
        console.error('[OrderService] Error Details:', error.details);
        console.error('[OrderService] Error Hint:', error.hint);
        console.error(
          '[OrderService] Full Error Object:',
          JSON.stringify(error)
        );
        return {
          success: false,
          message: 'Failed to get or create order',
          error: error.message,
        };
      }

      // Check if the RPC returned an error in the data itself
      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        !data.success
      ) {
        console.error('[OrderService] ❌ RPC RETURNED ERROR IN DATA');
        console.error('[OrderService] Data Message:', data.message);
        console.error('[OrderService] Data Error:', data.error);
        console.error('[OrderService] Full Data Object:', JSON.stringify(data));
        return {
          success: false,
          message: data.message || 'Failed to get or create order',
          error: data.error || 'RPC function returned error',
        };
      }

      // The RPC returns just the cart_id as a string
      const cartId = data;

      console.log('[OrderService] ✅ SUCCESS - Cart ID extracted:', cartId);
      console.log('[OrderService] GET OR CREATE ORDER - END');
      console.log('[OrderService] ========================================');

      return {
        success: true,
        message: 'Order retrieved successfully',
        data: {
          cart_id: cartId,
          is_new: false, // We can't determine this from the current response
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[OrderService] ❌ EXCEPTION CAUGHT');
      console.error('[OrderService] Exception Type:', err.constructor.name);
      console.error('[OrderService] Exception Message:', err.message);
      console.error('[OrderService] Exception Stack:', err.stack);
      console.error('[OrderService] Full Exception:', JSON.stringify(error));
      console.error('[OrderService] ========================================');
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getOrCreateOrder'
      );
    }
  }

  // Add item to order
  // M3 Fix: Using executeRPC wrapper
  static async addItemToOrder(
    orderId: string,
    grnItemId: string,
    quantity: number
  ): Promise<OrderServiceResponse<AddToOrderResponse>> {
    console.log('[OrderService] Adding item to order:', {
      orderId,
      grnItemId,
      quantity,
    });

    if (!orderId || !grnItemId || quantity <= 0) {
      return {
        success: false,
        message: 'Invalid parameters',
        error: 'Order ID, item ID, and positive quantity required',
      };
    }

    const result = await executeRPC<AddToOrderResponse>(
      getAuthenticatedClient,
      'add_item_to_order',
      {
        p_grn_item_id: grnItemId,
        p_order_id: orderId,
        p_quantity: quantity,
      },
      {
        context: 'OrderService.addItemToOrder',
        errorMessage: 'Failed to add item to order',
        unwrapNested: false, // Response is direct data
      }
    );

    return {
      success: result.success,
      message: result.success ? 'Item added to order' : result.message,
      data: result.data,
      error: result.error,
    };
  }

  // Update order item quantity using correct RPC
  // M3 Fix: Using executeRPC wrapper
  static async updateOrderItemQuantity(
    itemId: string,
    orderId: string,
    newQuantity: number
  ): Promise<OrderServiceResponse<OrderItem>> {
    console.log('[OrderService] Updating item quantity via RPC:', {
      itemId,
      newQuantity,
    });

    if (newQuantity === 0) {
      // If quantity is 0, remove the item
      const removeResult = await this.removeItemFromOrder(itemId, orderId);
      if (!removeResult.success) {
        return removeResult as OrderServiceResponse<OrderItem>;
      }
      // Return a success response with placeholder OrderItem data
      return {
        success: true,
        message: 'Item removed successfully',
        data: {
          id: itemId,
          order_id: orderId,
          grn_item_id: '',
          requested_quantity: 0,
          created_at: '',
        },
      };
    }

    const result = await executeRPC<OrderItem>(
      getAuthenticatedClient,
      'update_order_item_quantity',
      {
        p_new_quantity: newQuantity,
        p_order_item_id: itemId,
      },
      {
        context: 'OrderService.updateOrderItemQuantity',
        errorMessage: 'Failed to update item quantity',
        unwrapNested: false,
      }
    );

    return {
      success: result.success,
      message: result.success ? 'Quantity updated' : result.message,
      data: result.data,
      error: result.error,
    };
  }

  // Remove item from order
  static async removeItemFromOrder(
    itemId: string,
    orderId: string
  ): Promise<OrderServiceResponse<void>> {
    try {
      console.log('[OrderService] Removing item from order:', {
        itemId,
        orderId,
      });

      const authenticatedClient = await getAuthenticatedClient();
      const { data, error, count } = await authenticatedClient
        .from('order_items')
        .delete()
        .eq('id', itemId)
        .eq('order_id', orderId)
        .select();

      console.log('[OrderService] Delete result:', {
        data,
        error,
        count,
        rowsDeleted: data?.length,
      });

      if (error) {
        console.error('[OrderService] Delete Error:', error);
        return {
          success: false,
          message: 'Failed to remove item',
          error: error.message,
        };
      }

      if (!data || data.length === 0) {
        console.warn(
          '[OrderService] Delete returned no rows - item may not exist or RLS blocked'
        );
        return {
          success: false,
          message: 'Item not found or permission denied',
        };
      }

      console.log('[OrderService] Item removed successfully');
      return {
        success: true,
        message: 'Item removed from order',
      };
    } catch (error) {
      console.error('[OrderService] Exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.removeItemFromOrder'
      );
    }
  }

  // Get order with items using RPC
  static async getOrderWithItems(
    orderId: string
  ): Promise<OrderServiceResponse<Order>> {
    try {
      console.log(
        '[OrderService] Fetching order with items using RPC:',
        orderId
      );

      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc(
        'get_order_with_items',
        {
          p_order_id: orderId,
        }
      );

      console.log('[OrderService] get_order_with_items raw response:', {
        data: typeof data === 'string' ? data.substring(0, 200) + '...' : data,
        dataType: typeof data,
        error,
        orderId,
      });

      if (error) {
        console.error('[OrderService] RPC Error:', error);
        return {
          success: false,
          message: 'Failed to fetch order details',
          error: error.message,
        };
      }

      if (!data) {
        console.log('[OrderService] No data returned for order:', orderId);
        return {
          success: false,
          message: 'Order not found',
          error: 'No data returned',
        };
      }

      // Parse the JSON string if needed
      let parsedData;
      try {
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        console.log(
          '[OrderService] Parsed data type:',
          typeof parsedData,
          Array.isArray(parsedData)
        );
      } catch (parseError) {
        console.error(
          '[OrderService] Failed to parse JSON response:',
          parseError
        );
        return {
          success: false,
          message: 'Invalid response format',
          error: 'Failed to parse response',
        };
      }

      // Handle nested data structure: { data: {...}, success: true, message: null }
      let orderRecord;
      if (
        parsedData?.data &&
        typeof parsedData.data === 'object' &&
        !Array.isArray(parsedData.data)
      ) {
        // New format: { data: { order_data: {...}, items: [...] }, success: true }
        console.log('[OrderService] Unwrapping nested data object');
        orderRecord = parsedData.data;
      } else if (Array.isArray(parsedData) && parsedData.length > 0) {
        // Legacy format: [{ order_data: {...}, items: [...] }]
        console.log('[OrderService] Using legacy array format');
        orderRecord = parsedData[0];
      } else {
        console.log('[OrderService] Invalid data structure:', {
          isArray: Array.isArray(parsedData),
          hasData: !!parsedData?.data,
          keys: parsedData ? Object.keys(parsedData) : [],
        });
        return {
          success: false,
          message: 'Invalid response structure',
          error: 'Expected order data in response',
        };
      }

      if (!orderRecord.order_data || !orderRecord.items) {
        console.log('[OrderService] Missing order_data or items in response:', {
          hasOrderData: !!orderRecord.order_data,
          hasItems: !!orderRecord.items,
          keys: Object.keys(orderRecord),
        });
        return {
          success: false,
          message: 'Incomplete order data',
          error: 'Missing order_data or items',
        };
      }

      // Map the RPC response to our expected format
      const orderData = orderRecord.order_data;
      const items = orderRecord.items;

      // Create customer object from order_data
      const customer = {
        id: orderData.customer_id,
        name: orderData.customer_name,
        mobile: orderData.customer_phone,
        email: orderData.customer_email,
        city: '', // Not provided in this response
        active: true, // Default to active
      };

      // Map items to expected format
      // D1 Fix: Add optional chaining and fallbacks to prevent crashes from null/undefined backend values
      const mappedItems = items.map((item: RpcOrderItemDetail) => ({
        id: item?.id ?? '',
        order_id: item?.order_id ?? '',
        grn_item_id: item?.grn_items_id ?? '',
        requested_quantity: item?.requested_quantity ?? 0,
        fulfilled_quantity: item?.fulfilled_quantity ?? 0,
        item_status: item?.item_status ?? '',
        created_at: item?.created_at ?? '',
        updated_at: item?.updated_at ?? '',
        grn_item: {
          id: item?.grn_items_id ?? '',
          name: item?.grn_items_item_name ?? '',
          packaging: item?.grn_items_packaging ?? '',
          package_mark: item?.grn_items_package_mark ?? '',
          current_stock: item?.current_stock ?? 0,
          original_quantity: item?.grn_items_qty ?? 0,
          rack: item?.grn_items_rack ?? '',
          weight: item?.grn_items_weight ?? 0,
          image_url: item?.grn_items_image_url ?? '',
          gr_id: item?.grns_id ?? '',
          grn_number: item?.grns_gr_no ?? '',
          grn_date: item?.grns_date ?? '',
        },
      }));

      // Calculate totals
      const total_items = mappedItems.length;
      const total_quantity = mappedItems.reduce(
        (sum: number, item: (typeof mappedItems)[number]) =>
          sum + (item.requested_quantity || 0),
        0
      );

      const finalOrderData = {
        id: orderData.id,
        customer_id: orderData.customer_id,
        customer: customer,
        items: mappedItems,
        total_items: total_items,
        total_quantity: total_quantity,
        status: orderData.status,
        created_at: orderData.created_at,
        updated_at: orderData.updated_at,
        updated_by: orderData.updated_by,
        updated_by_name: orderData.updated_by_name,
        updated_by_display_name: orderData.updated_by_display_name,
        order_date: orderData.order_date,
        dispatch_id: orderData.dispatch_id,
        dispatch_no: orderData.dispatch_no,
        note: orderData.note,
        priority: orderData.priority,
      };

      console.log('[OrderService] Final mapped order data:', {
        id: finalOrderData.id,
        customer: finalOrderData.customer?.name,
        total_items: finalOrderData.total_items,
        total_quantity: finalOrderData.total_quantity,
        itemsCount: finalOrderData.items?.length,
        hasCustomer: !!finalOrderData.customer,
        hasItems: !!finalOrderData.items,
      });

      return {
        success: true,
        message: 'Order retrieved successfully',
        data: finalOrderData,
      };
    } catch (error) {
      console.error('[OrderService] Exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getOrderWithItems'
      );
    }
  }

  // Get orders list with filters using RPC
  static async getOrdersList(
    filters?: OrderFilters
  ): Promise<OrderServiceResponse<Order[]>> {
    const totalStartTime = Date.now();
    try {
      console.log('[OrderService] Fetching orders list using RPC:', filters);

      // Get authenticated client with JWT tokens
      const authClientStart = Date.now();
      const authenticatedClient = await getAuthenticatedClient();
      console.log(
        `[OrderService] getAuthenticatedClient took ${Date.now() - authClientStart}ms`
      );

      // Skip session check - it's slow and not needed since we're using JWT auth
      // The authenticated client already has the JWT token
      console.log(
        '[OrderService] Using authenticated client for RPC call (skipping session check)'
      );

      // Make the RPC call with enhanced error handling using authenticated client
      const rpcStartTime = Date.now();
      console.log('[OrderService] ========== GET ORDERS LIST RPC ==========');
      console.log('[OrderService] Filters received:', JSON.stringify(filters));
      console.log('[OrderService] RPC params:', {
        p_customer_id: filters?.customer_id || null,
        p_customer_name: filters?.customer_name || null,
        p_has_items: filters?.has_items || null,
        p_user_id: null,
        p_limit: 200,
        p_offset: 0,
      });
      const rpcCall = authenticatedClient.rpc('get_orders_list', {
        p_customer_id: filters?.customer_id || null,
        p_customer_name: filters?.customer_name || null,
        p_has_items: filters?.has_items || null,
        p_user_id: null, // Use current session user
        p_limit: 200, // Increased from 50 to show more customers
        p_offset: 0,
      });

      console.log('[OrderService] RPC call initiated, waiting for response...');
      const { data, error } = await rpcCall;
      const rpcDuration = Date.now() - rpcStartTime;
      console.log(`[OrderService] RPC response received in ${rpcDuration}ms:`, {
        hasData: !!data,
        dataType: typeof data,
        hasError: !!error,
        errorDetails: error,
      });

      if (error) {
        console.error('[OrderService] RPC Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });

        // Check for JWT signature error and force logout
        handleJWTError(error);

        // Check if it's a network error
        if (
          error.message?.includes('Network request failed') ||
          error.message?.includes('fetch')
        ) {
          return {
            success: false,
            message:
              'Network connection error. Please check your internet connection and try again.',
            error: 'Network request failed - ' + error.message,
          };
        }

        return {
          success: false,
          message: 'Failed to fetch orders',
          error: error.message,
        };
      }

      if (__DEV__) {
        console.log('[OrderService] ====== RAW RPC RESPONSE DEBUG ======');
        console.log(
          '[OrderService] data is null/undefined:',
          data === null || data === undefined
        );
        console.log('[OrderService] typeof data:', typeof data);
        console.log(
          '[OrderService] JSON.stringify(data):',
          JSON.stringify(data)?.substring(0, 500)
        );

        if (data) {
          console.log('[OrderService] Raw data structure:', {
            isArray: Array.isArray(data),
            hasOrders: !!data.orders,
            keys: typeof data === 'object' ? Object.keys(data) : 'N/A',
            firstItem: Array.isArray(data) ? data[0] : data.orders?.[0] || null,
            dataLength: Array.isArray(data)
              ? data.length
              : data.orders?.length || 'N/A',
          });
          console.log('Orders:', data.orders);
          console.log('Total:', data.total_count);
          console.log('Has more:', data.has_more);
        }
        console.log('[OrderService] ====== END RAW RPC RESPONSE DEBUG ======');

        const totalDuration = Date.now() - totalStartTime;
        console.log(
          `[OrderService] === TOTAL getOrdersList TIME: ${totalDuration}ms ===`
        );
      }

      // Handle multiple response formats:
      // 1. { data: { orders: [...] } } - nested format from RPC
      // 2. { orders: [...] } - direct object format
      // 3. [...] - direct array format
      let ordersArray: RpcOrderListItem[] = [];

      console.log('[OrderService] ====== PARSING RESPONSE ======');
      console.log('[OrderService] Checking formats:');
      console.log('  - Is Array?:', Array.isArray(data));
      console.log('  - Has data.data?:', !!data?.data);
      console.log('  - Has data.data.orders?:', !!data?.data?.orders);
      console.log(
        '  - data.data.orders is Array?:',
        Array.isArray(data?.data?.orders)
      );
      console.log('  - data.data.orders length:', data?.data?.orders?.length);
      console.log('  - Has data.orders?:', !!data?.orders);
      console.log('  - data.orders is Array?:', Array.isArray(data?.orders));

      if (Array.isArray(data)) {
        console.log('[OrderService] Using direct array format');
        ordersArray = data;
      } else if (data?.data?.orders) {
        console.log('[OrderService] Using nested format: data.data.orders');
        ordersArray = data.data.orders;
        console.log(
          '[OrderService] Extracted array length:',
          ordersArray.length
        );
        console.log('[OrderService] First order:', ordersArray[0]);
      } else if (data?.orders) {
        console.log('[OrderService] Using direct object format: data.orders');
        ordersArray = data.orders;
      } else {
        console.log('[OrderService] ⚠️ NO MATCHING FORMAT FOUND!');
      }

      console.log(
        '[OrderService] Final extracted orders array length:',
        ordersArray.length
      );
      console.log('[OrderService] ====== END PARSING ======');

      return {
        success: true,
        message: 'Orders retrieved successfully',
        data: ordersArray,
      };
    } catch (error) {
      const totalDuration = Date.now() - totalStartTime;
      console.error(
        `[OrderService] Exception after ${totalDuration}ms:`,
        error
      );
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getOrdersList'
      );
    }
  }

  // Get order dispatches
  // M3 Fix: Using executeRPC wrapper
  static async getOrderDispatches(
    orderId: string,
    limit = 20,
    offset = 0
  ): Promise<OrderServiceResponse<Dispatch[]>> {
    console.log('[OrderService] Fetching order dispatches:', {
      orderId,
      limit,
      offset,
    });

    const result = await executeRPC<Dispatch[]>(
      getAuthenticatedClient,
      'get_cart_dispatches',
      { p_cart_id: orderId },
      {
        context: 'OrderService.getOrderDispatches',
        errorMessage: 'Failed to fetch dispatches',
        unwrapNested: false,
        validateSuccess: false, // Response is direct array
      }
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    // D3 Fix: Type check before calling slice
    if (!Array.isArray(result.data)) {
      return {
        success: false,
        message: 'Invalid response format',
        error: 'Expected array response from RPC',
      };
    }

    // Apply pagination manually if backend doesn't support it
    const paginatedData = result.data.slice(offset, offset + limit);

    return {
      success: true,
      message: 'Dispatches retrieved successfully',
      data: paginatedData,
    };
  }

  // Get customer dispatches using the new RPC
  static async getCustomerDispatches(
    customerId: string,
    options?: {
      dateFrom?: string;
      dateTo?: string;
      filters?: {
        itemName?: string;
        grNo?: string;
        dispNo?: string;
        packageMark?: string;
        dispQtyMin?: number;
        dispQtyMax?: number;
      };
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<OrderServiceResponse<CustomerDispatchResponse>> {
    try {
      console.log('[OrderService] Fetching customer dispatches:', {
        customerId,
        options,
      });

      if (!customerId) {
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing customer_id parameter',
        };
      }

      // Transform filter keys from camelCase (frontend) to snake_case (backend)
      const transformedFilters: Record<string, unknown> = {};
      if (options?.filters) {
        const keyMap: Record<string, string> = {
          itemName: 'item_name',
          grNo: 'gr_no',
          dispNo: 'disp_no',
          packageMark: 'package_mark',
          dispQtyMin: 'disp_qty_min',
          dispQtyMax: 'disp_qty_max',
        };
        for (const [key, value] of Object.entries(options.filters)) {
          if (value !== undefined && value !== null && value !== '') {
            transformedFilters[keyMap[key] || key] = value;
          }
        }
      }

      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc(
        'get_customer_dispatch_items',
        {
          p_customer_id: customerId,
          p_date_from: options?.dateFrom || null,
          p_date_to: options?.dateTo || null,
          p_filters: transformedFilters,
          p_sort_by: options?.sortBy || 'grns_grNo',
          p_sort_order: options?.sortOrder || 'asc',
          p_limit: options?.limit || PAGINATION.DEFAULT_LIMIT,
          p_offset: options?.offset || 0,
        }
      );

      console.log('[OrderService] Customer dispatches response:', {
        success: !error,
        error: error,
        dataStructure: data
          ? {
              hasItems: !!data.data?.items,
              itemsCount: data.data?.items?.length,
              hasPagination: !!data.data?.pagination,
              hasAggregations: !!data.data?.aggregations,
            }
          : null,
      });

      if (error) {
        console.error('[OrderService] Customer dispatches RPC Error:', error);
        return {
          success: false,
          message: 'Failed to fetch customer dispatches',
          error: error.message,
        };
      }

      if (!data || !data.data) {
        return {
          success: true,
          message: 'No dispatches found for this customer',
          data: {
            items: [],
            pagination: { total_count: 0, has_more: false },
            aggregations: {
              total_initial_qty: 0,
              total_dispatch_qty: 0,
              total_weight: 0,
              total_count: 0,
            },
          },
        };
      }

      return {
        success: true,
        message: 'Customer dispatches retrieved successfully',
        data: data.data,
      };
    } catch (error) {
      console.error('[OrderService] Customer dispatches exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getCustomerDispatches'
      );
    }
  }

  // Enhanced search for customer items with intelligent search detection
  static async searchCustomerItemsForOrder(
    filters: EnhancedSearchFilters
  ): Promise<
    OrderServiceResponse<EnhancedGRNItem[]> & { metadata?: SearchMetadata }
  > {
    try {
      console.log(
        '[OrderService] Enhanced search with intelligent detection:',
        filters
      );

      if (!filters.customer_id) {
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing customer_id parameter',
        };
      }

      // Detailed RPC call parameters
      const rpcParams = {
        p_customer_id: filters.customer_id,
        p_search_query: filters.search_query || null,
        p_search_type: filters.search_type || 'auto',
        p_weight_min: filters.weight_min || null,
        p_weight_max: filters.weight_max || null,
        p_page_size: filters.page_size || 50,
        p_offset: filters.offset || 0,
        p_stock_filter_min: filters.stock_filter_min || 0,
        p_catalog_id: filters.catalog_id || null,
      };

      console.log('[OrderService] 🔍 ENHANCED SEARCH RPC CALL:', {
        functionName: 'search_customer_items_for_order',
        parameters: rpcParams,
        parameterTypes: Object.entries(rpcParams).reduce(
          (acc, [key, value]) => ({
            ...acc,
            [key]: `${typeof value} ${value === null ? '(null)' : `(${value})`}`,
          }),
          {}
        ),
      });

      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc(
        'search_customer_items_for_order',
        rpcParams
      );

      // Log raw response immediately after RPC call
      console.log('[OrderService] 📥 RAW RPC RESPONSE:', {
        dataType: typeof data,
        dataIsNull: data === null,
        dataIsUndefined: data === undefined,
        dataIsArray: Array.isArray(data),
        dataLength: Array.isArray(data) ? data.length : 'N/A',
        rawData: data,
        error: error,
        errorMessage: error?.message,
        errorDetails: error?.details,
        errorHint: error?.hint,
        errorCode: error?.code,
      });

      // Additional detailed logging if data exists
      if (data !== null && data !== undefined) {
        console.log('[OrderService] 📊 RESPONSE DATA ANALYSIS:', {
          stringified: JSON.stringify(data).substring(0, 500) + '...',
          firstRecord:
            Array.isArray(data) && data[0]
              ? {
                  allKeys: Object.keys(data[0]),
                  grn_item_id: data[0].grn_item_id,
                  item_name: data[0].item_name,
                  weight: data[0].weight,
                  search_match_type: data[0].search_match_type,
                  total_count: data[0].total_count,
                }
              : 'No first record',
        });
      }

      console.log('[OrderService] Enhanced search response:', {
        data: Array.isArray(data)
          ? {
              isArray: true,
              itemsLength: data.length,
              totalCount: data[0]?.total_count,
              searchType: data[0]?.search_type,
              firstItem: data[0]
                ? {
                    grn_item_id: data[0].grn_item_id,
                    item_name: data[0].item_name,
                    weight: data[0].weight,
                    search_match_type: data[0].search_match_type,
                  }
                : null,
            }
          : null,
        error,
        filters,
      });

      if (error) {
        console.error('[OrderService] Enhanced search RPC Error:', error);
        return {
          success: false,
          message: 'Failed to search items',
          error: error.message,
        };
      }

      // Handle new response structure with items array
      let itemsArray: RpcEnhancedGrnItem[] = [];
      let responseMetadata: Partial<RpcSearchMetadata> = {};

      if (!data) {
        return {
          success: true,
          message: 'No items found',
          data: [],
          metadata: {
            search_type: 'text',
            match_type: 'combined',
            total_count: 0,
            current_count: 0,
            has_more: false,
          },
        };
      }

      // Check if data has the new structure with 'items' property
      if (data && typeof data === 'object' && 'items' in data) {
        console.log('[OrderService] 🆕 NEW RESPONSE FORMAT DETECTED');
        itemsArray = data.items || [];
        responseMetadata = {
          total_count: data.total_count || 0,
          has_more: data.has_more || false,
          search_type_detected: data.search_type_detected || 'text',
          pagination: data.pagination,
        };
      } else if (Array.isArray(data)) {
        console.log('[OrderService] 🔸 LEGACY ARRAY FORMAT');
        itemsArray = data;
        // Extract metadata from first record for legacy format (with safe array access)
        const firstRecord = data.length > 0 ? data[0] : null;
        responseMetadata = {
          total_count: firstRecord?.total_count || data.length,
          has_more: false,
        };
      } else {
        console.log('[OrderService] ⚠️ UNEXPECTED DATA FORMAT:', typeof data);
        return {
          success: true,
          message: 'No items found',
          data: [],
          metadata: {
            search_type: 'text',
            match_type: 'combined',
            total_count: 0,
            current_count: 0,
            has_more: false,
          },
        };
      }

      if (itemsArray.length === 0) {
        return {
          success: true,
          message: 'No items found for search criteria',
          data: [],
          metadata: {
            search_type:
              (filters.search_type as 'text' | 'weight' | 'weight_range') ||
              'text',
            match_type: 'combined',
            total_count: 0,
            current_count: 0,
            has_more: false,
          },
        };
      }

      const totalCount = responseMetadata.total_count || itemsArray.length;
      const currentCount = itemsArray.length;

      // Map enhanced search results to EnhancedGRNItem format
      const mappedItems: EnhancedGRNItem[] = itemsArray.map(
        (item: RpcEnhancedGrnItem) => ({
          // Core GRNItem fields - handle both old and new response formats
          id: item.grn_item_id || item.id || '',
          name: item.item_name,
          packaging: item.packaging || '',
          package_mark: item.package_mark || '',
          current_stock: item.stock,
          original_quantity: item.qty,
          catalog_id: undefined,
          catalog: undefined,
          rack: item.rack || '',
          weight: item.weight || 0,
          gr_id: item.grn_id,
          grn_number: item.gr_no || item.grn_details?.gr_no,
          grn_date: item.grn_date || item.date || item.grn_details?.date,

          // Enhanced search specific fields
          grns_id: item.grns_id,
          grns_gr_no: item.grns_gr_no,
          grns_date: item.grns_date,
          grns_customer_name: item.grns_customer_name,
          grns_registration: item.grns_registration,
          grns_supervisor_name: item.grns_supervisor_name,
          grns_sender_name: item.grns_sender_name,
          grns_invoiced: item.grns_invoiced,
          grns_leon: item.grns_leon,
          grns_out_of_stock: item.grns_out_of_stock,
          grns_note: item.grns_note,
          grns_image_url: item.grns_image_url,
          search_match_type: item.search_match_type as
            'weight' | 'name' | 'package_mark' | 'combined' | undefined,

          // Additional customer context - handle both formats
          customer_id: item.customer_id || item.customer?.id,
          customer_name: item.customer_name || item.customer?.name,

          // Legacy compatibility
          image_url: item.grns_image_url || item.image_url || '',
          pricing_mode: undefined,
          created_at: undefined,
          updated_at: undefined,
        })
      );

      // Determine detected search type from results or response metadata
      const detectedSearchType =
        responseMetadata.search_type_detected === 'weight_range'
          ? 'weight_range'
          : responseMetadata.search_type_detected === 'weight'
            ? 'weight'
            : itemsArray[0]?.search_match_type === 'weight'
              ? 'weight'
              : filters.search_query &&
                  /^\d+(\.\d+)?(-\d+(\.\d+)?)?$/.test(filters.search_query)
                ? 'weight_range'
                : 'text';

      const searchMetadata: SearchMetadata = {
        search_type: detectedSearchType as 'weight' | 'text' | 'weight_range',
        match_type:
          (itemsArray[0]?.search_match_type as
            'weight' | 'name' | 'package_mark' | 'combined') || 'combined',
        total_count: totalCount,
        current_count: currentCount,
        has_more: responseMetadata.has_more || currentCount < totalCount,
      };

      console.log('[OrderService] Enhanced search mapped results:', {
        originalCount: itemsArray.length,
        mappedCount: mappedItems.length,
        metadata: searchMetadata,
        searchQuery: filters.search_query,
        detectedType: detectedSearchType,
      });

      return {
        success: true,
        message: 'Items found successfully',
        data: mappedItems,
        metadata: searchMetadata,
      };
    } catch (error) {
      console.error('[OrderService] Enhanced search exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred during search',
        'OrderService.searchCustomerItemsForOrder'
      );
    }
  }

  // Get available items for ordering using customer-specific RPC
  static async getAvailableItems(
    filters?: ItemFilters & { customer_id?: string }
  ): Promise<OrderServiceResponse<GRNItem[]>> {
    try {
      console.log(
        '[OrderService] Fetching available items using customer-specific RPC:',
        filters
      );

      if (!filters?.customer_id) {
        console.error(
          '[OrderService] Customer ID is required for fetching items'
        );
        return {
          success: false,
          message: 'Customer ID is required',
          error: 'Missing customer_id parameter',
        };
      }

      // Use the customer-specific RPC function with all supported parameters
      const authenticatedClient = await getAuthenticatedClient();
      const { data: response, error } = await authenticatedClient.rpc(
        'get_customer_items_for_order_selection',
        {
          p_customer_id: filters.customer_id,
          p_page_size: 50, // Default page size
          p_offset: 0, // No pagination for now
          p_search_term: filters.search || null,
          p_stock_filter_min: filters.in_stock_only ? 1 : 0, // Server-side stock filtering
          p_grn_no_filter: filters.grn_id || null, // GRN filter if provided
        }
      );

      if (response?.success === false) {
        return {
          success: false,
          message: response.message || 'Failed to fetch items',
          error: 'BACKEND_ERROR',
        };
      }
      // The six-argument RPC returns the standard paginated envelope, not a bare array.
      const data = Array.isArray(response) ? response : response?.data;

      console.log(
        '[OrderService] get_customer_items_for_order_selection response:',
        {
          data: Array.isArray(data)
            ? {
                isArray: true,
                itemsLength: data.length,
                totalCount: data[0]?.total_count,
                firstItem: data[0]
                  ? {
                      grn_item_id: data[0].grn_item_id,
                      item_name: data[0].item_name,
                      packaging: data[0].packaging,
                      stock: data[0].stock,
                      gr_no: data[0].gr_no,
                      customer_name: data[0].customer_name,
                    }
                  : null,
              }
            : null,
          error,
          parameters: {
            customer_id: filters.customer_id,
            search_term: filters.search,
            stock_filter_min: filters.in_stock_only ? 1 : 0,
            grn_filter: filters.grn_id,
          },
        }
      );

      if (error) {
        console.error('[OrderService] RPC Error:', error);
        return {
          success: false,
          message: 'Failed to fetch items',
          error: error.message,
        };
      }

      if (!data || !Array.isArray(data)) {
        console.log('[OrderService] No items returned or invalid format');
        return {
          success: true,
          message: 'No items available',
          data: [],
        };
      }

      if (data.length === 0) {
        console.log(
          '[OrderService] Empty result set for customer:',
          filters.customer_id
        );
        return {
          success: true,
          message: 'No items available for this customer',
          data: [],
        };
      }

      // Extract total count from first record for pagination metadata
      const totalCount =
        response?.pagination?.total_count ??
        data[0]?.total_count ??
        data.length;
      console.log(
        '[OrderService] Total available items for customer:',
        totalCount
      );

      // Map the customer-specific items to our expected format
      const mappedItems = data.map((item: RpcEnhancedGrnItem) => ({
        // Core identification
        id: item.grn_item_id,
        name: item.item_name,

        // Stock and quantity
        current_stock: item.stock,
        original_quantity: item.qty,

        // Physical attributes
        packaging: item.packaging || '',
        package_mark: item.package_mark || '',
        rack: item.rack || '',
        weight: item.weight || 0,
        image_url: item.grns_image_url || '',

        // GRN information
        gr_id: item.grn_id,
        grn_number: item.gr_no, // Note: using gr_no not grn_no
        grn_date: item.grn_date || item.date,

        // Customer context
        customer_id: item.customer_id,
        customer_name: item.customer_name,

        // GRN header information
        grns_id: item.grns_id,
        grns_gr_no: item.grns_gr_no,
        grns_date: item.grns_date,
        grns_customer_name: item.grns_customer_name,
        grns_registration: item.grns_registration,
        grns_supervisor_name: item.grns_supervisor_name,
        grns_sender_name: item.grns_sender_name,
        grns_invoiced: item.grns_invoiced,
        grns_leon: item.grns_leon,
        grns_out_of_stock: item.grns_out_of_stock,
        grns_note: item.grns_note,

        // Legacy compatibility fields
        catalog_id: undefined,
        catalog: undefined,
      }));

      console.log('[OrderService] Mapped customer items:', {
        originalCount: data.length,
        mappedCount: mappedItems.length,
        totalCount: totalCount,
        firstMappedItem: mappedItems[0]
          ? {
              id: mappedItems[0].id,
              name: mappedItems[0].name,
              packaging: mappedItems[0].packaging,
              current_stock: mappedItems[0].current_stock,
              grn_number: mappedItems[0].grn_number,
            }
          : null,
      });

      // Note: Server-side filtering is already applied, so no need for additional client-side filtering
      console.log('[OrderService] Final customer items (server-filtered):', {
        count: mappedItems.length,
        totalAvailable: totalCount,
        customerId: filters?.customer_id,
        appliedFilters: {
          search: filters?.search,
          in_stock_only: filters?.in_stock_only,
          grn_filter: filters?.grn_id,
        },
      });

      return {
        success: true,
        message: 'Items retrieved successfully',
        data: mappedItems,
        // Include pagination metadata if needed in the future
        metadata: {
          total_count: totalCount,
          current_count: mappedItems.length,
          has_more: mappedItems.length < totalCount,
        },
      };
    } catch (error) {
      console.error('[OrderService] Exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getAvailableItems'
      );
    }
  }

  // Get order summary
  static async getOrderSummary(
    orderId: string
  ): Promise<OrderServiceResponse<OrderSummary>> {
    try {
      console.log('[OrderService] Fetching order summary:', orderId);

      const { data, error } = await getSupabaseClient()
        .from('order_items')
        .select('requested_quantity')
        .eq('order_id', orderId)
        .gt('requested_quantity', 0);

      if (error) {
        console.error('[OrderService] Fetch Error:', error);
        return {
          success: false,
          message: 'Failed to fetch order summary',
          error: error.message,
        };
      }

      const summary: OrderSummary = {
        item_count: data?.length || 0,
        total_quantity:
          data?.reduce(
            (sum, item) => sum + (item.requested_quantity || 0),
            0
          ) || 0,
      };

      return {
        success: true,
        message: 'Summary retrieved successfully',
        data: summary,
      };
    } catch (error) {
      console.error('[OrderService] Exception:', error);
      return createErrorResponse(
        error,
        'An unexpected error occurred',
        'OrderService.getOrderSummary'
      );
    }
  }

  // Check if order is empty
  static async isOrderEmpty(orderId: string): Promise<boolean> {
    try {
      const { data, count } = await getSupabaseClient()
        .from('order_items')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', orderId)
        .gt('requested_quantity', 0);

      return count === 0;
    } catch (error) {
      console.error('[OrderService] Error checking order status:', error);
      return true;
    }
  }

  // Create dispatch from order
  // M3 Fix: Using executeRPC wrapper
  static async createDispatchFromOrder(
    orderId: string,
    userId: string
  ): Promise<OrderServiceResponse<CreateDispatchResponse>> {
    console.log('[OrderService] Creating dispatch from order:', {
      orderId,
      userId,
    });

    const result = await executeRPC<CreateDispatchResponse>(
      getAuthenticatedClient,
      'convert_order_to_dispatch',
      {
        p_order_id: orderId,
        p_user_id: userId,
      },
      {
        context: 'OrderService.createDispatchFromOrder',
        errorMessage: 'Failed to create dispatch',
        unwrapNested: false,
      }
    );

    return {
      success: result.success,
      message: result.success
        ? 'Dispatch created successfully'
        : result.message,
      data: result.data,
      error: result.error,
    };
  }
}

// ============================================================
// Named Function Exports (Issue #7)
// Provides consistent API with other services (grn-service, dispatch-service)
// while maintaining backward compatibility with existing OrderService.method() calls
// ============================================================

/** Test connection to Supabase */
export const testOrderConnection =
  OrderService.testConnection.bind(OrderService);

/** Get or create order for a customer (perpetual cart model) */
export const getOrCreateOrder =
  OrderService.getOrCreateOrder.bind(OrderService);

/** Add item to order */
export const addItemToOrder = OrderService.addItemToOrder.bind(OrderService);

/** Update order item quantity */
export const updateOrderItemQuantity =
  OrderService.updateOrderItemQuantity.bind(OrderService);

/** Remove item from order */
export const removeItemFromOrder =
  OrderService.removeItemFromOrder.bind(OrderService);

/** Get order with items using RPC */
export const getOrderWithItems =
  OrderService.getOrderWithItems.bind(OrderService);

/** Get orders list with filters using RPC */
export const getOrdersList = OrderService.getOrdersList.bind(OrderService);

/** Get order dispatches */
export const getOrderDispatches =
  OrderService.getOrderDispatches.bind(OrderService);

/** Get customer dispatches using the new RPC */
export const getCustomerDispatches =
  OrderService.getCustomerDispatches.bind(OrderService);

/** Enhanced search for customer items with intelligent search detection */
export const searchCustomerItemsForOrder =
  OrderService.searchCustomerItemsForOrder.bind(OrderService);

/** Get available items for ordering using customer-specific RPC */
export const getAvailableItems =
  OrderService.getAvailableItems.bind(OrderService);

/** Get order summary */
export const getOrderSummary = OrderService.getOrderSummary.bind(OrderService);

/** Check if order is empty */
export const isOrderEmpty = OrderService.isOrderEmpty.bind(OrderService);

/** Create dispatch from order */
export const createDispatchFromOrder =
  OrderService.createDispatchFromOrder.bind(OrderService);

// Default export maintained for backward compatibility
export default OrderService;
